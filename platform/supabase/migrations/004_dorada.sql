-- Klasiko: dorada aplikacije (bezbednost, tačnost uplata, automatska naplata, porodice, paketi, roditelji)
-- Migracija se može pokrenuti više puta.

-- ---------- Uparivanje sa izvoda: isti red izvoda ne sme da se upiše dvaput ----------
alter table payments add column if not exists statement_hash text;
create unique index if not exists payments_statement_idx on payments(org_id, statement_hash, charge_id);
create index if not exists payments_student_idx on payments(student_id);

-- ---------- Vrste zaduženja: samo mesečna članarina je jedinstvena po mesecu ----------
alter table charges add column if not exists kind text not null default 'monthly';
do $$ begin
  alter table charges add constraint charges_kind_check check (kind in ('monthly', 'extra', 'installment', 'package'));
exception when duplicate_object then null; end $$;
update charges set kind = 'extra' where group_id is null and kind = 'monthly';
drop index if exists charges_unique_idx;
create unique index if not exists charges_monthly_unique_idx on charges(student_id, group_id, period) where kind = 'monthly';
create index if not exists charges_student_idx on charges(student_id, period);

-- ---------- Načini naplate po grupi ----------
alter table groups add column if not exists fee_type text not null default 'monthly';
do $$ begin
  alter table groups add constraint groups_fee_type_check check (fee_type in ('monthly', 'package', 'manual'));
exception when duplicate_object then null; end $$;
alter table groups add column if not exists package_classes int check (package_classes is null or package_classes > 0);

-- ---------- Porodice: braća i sestre dele family_id ----------
alter table students add column if not exists family_id uuid;
create index if not exists students_family_idx on students(org_id, family_id) where family_id is not null;

-- ---------- Podešavanja škole za automatsku naplatu ----------
alter table organizations add column if not exists auto_charges boolean not null default false;
alter table organizations add column if not exists auto_charge_day int not null default 1 check (auto_charge_day between 1 and 28);
alter table organizations add column if not exists auto_reminders boolean not null default false;
alter table organizations add column if not exists reminder_days_before int not null default 3 check (reminder_days_before between 0 and 14);
alter table organizations add column if not exists sibling_discount_pct numeric(5,2) not null default 0 check (sibling_discount_pct between 0 and 100);
alter table organizations add column if not exists terms_accepted_at timestamptz;

-- ---------- Link za roditelje: ističe posle godinu dana bez otvaranja ----------
alter table parent_links add column if not exists expires_at timestamptz not null default (now() + interval '1 year');

-- ---------- Podsetnici za uplatu ----------
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  charge_id uuid references charges on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  kind text not null check (kind in ('before_due', 'after_due', 'manual')),
  sent_at timestamptz not null default now(),
  sent_by uuid references profiles on delete set null
);
create index if not exists reminders_org_idx on reminders(org_id, sent_at desc);
-- Ručni podsetnici nemaju charge_id, a NULL vrednosti se ne sudaraju, pa indeks važi samo za automatske.
create unique index if not exists reminders_auto_idx on reminders(charge_id, kind, channel);
alter table reminders enable row level security;
drop policy if exists rem_owner on reminders;
create policy rem_owner on reminders for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- ---------- Paketi časova ----------
create table if not exists class_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  group_id uuid not null references groups on delete cascade,
  classes_total int not null check (classes_total > 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  purchased_at date not null default current_date,
  expires_at date,
  charge_id uuid references charges on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists class_packages_student_idx on class_packages(student_id, group_id);
create index if not exists class_packages_org_idx on class_packages(org_id);
alter table class_packages enable row level security;
drop policy if exists cp_select on class_packages;
create policy cp_select on class_packages for select using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));
drop policy if exists cp_write on class_packages;
create policy cp_write on class_packages for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- ---------- Lista čekanja ----------
create table if not exists group_waitlist (
  group_id uuid not null references groups on delete cascade,
  student_id uuid not null references students on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id)
);
create index if not exists waitlist_org_idx on group_waitlist(org_id);
alter table group_waitlist enable row level security;
drop policy if exists wl_select on group_waitlist;
create policy wl_select on group_waitlist for select using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));
drop policy if exists wl_write on group_waitlist;
create policy wl_write on group_waitlist for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- ---------- Roditelj javlja izostanak ----------
create table if not exists absence_notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists absence_org_idx on absence_notices(org_id, date);
alter table absence_notices enable row level security;
drop policy if exists an_select on absence_notices;
create policy an_select on absence_notices for select using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_student(student_id)));
drop policy if exists an_owner on absence_notices;
create policy an_owner on absence_notices for delete using (is_superadmin() or is_owner_of(org_id));

-- ---------- Obaveštenja škole ----------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  group_id uuid references groups on delete cascade,
  title text not null,
  body text,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_org_idx on announcements(org_id, created_at desc);
alter table announcements enable row level security;
drop policy if exists ann_select on announcements;
create policy ann_select on announcements for select using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and (group_id is null or teaches_group(group_id))));
drop policy if exists ann_owner on announcements;
create policy ann_owner on announcements for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists ann_teacher_insert on announcements;
create policy ann_teacher_insert on announcements for insert with check (is_member_of(org_id) and group_id is not null and teaches_group(group_id));

-- ---------- Dnevnik: ko je šta uradio (zapis ostaje i posle brisanja škole) ----------
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  org_id uuid,
  target text,
  details jsonb
);
create index if not exists audit_org_idx on audit_log(org_id, at desc);
create index if not exists audit_at_idx on audit_log(at desc);
alter table audit_log enable row level security;
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_superadmin() or (org_id is not null and is_owner_of(org_id)));

-- ---------- Ograničenje pokušaja (prijava, registracija, reset lozinke, javne forme). Samo server. ----------
create table if not exists auth_throttle (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists auth_throttle_idx on auth_throttle(key, at desc);
alter table auth_throttle enable row level security;

-- ---------- Dolasci: osoba koja je upisala može da poništi svoj upis u roku od sat vremena ----------
drop policy if exists ck_self_delete on checkins;
create policy ck_self_delete on checkins for delete using (created_by = auth.uid() and at > now() - interval '1 hour');

-- ---------- Stari podaci: čas se vodi na predavača grupe, a ne na vlasnika koji je upisao prisustvo ----------
update sessions s set teacher_id = g.teacher_id
from groups g, profiles p
where s.group_id = g.id and p.id = s.teacher_id and p.role in ('owner', 'superadmin')
  and g.teacher_id is not null and g.teacher_id <> s.teacher_id;
update sessions s set teacher_id = null
from profiles p
where p.id = s.teacher_id and p.role = 'superadmin';

-- ---------- Povezani zapisi moraju biti iz iste škole: dodate i tabele koje su nedostajale ----------
delete from parent_links l using students s where s.id = l.student_id and s.org_id <> l.org_id;
delete from checkins c using students s where s.id = c.student_id and s.org_id <> c.org_id;
update sessions s set makeup_for = null from sessions o where o.id = s.makeup_for and o.org_id <> s.org_id;

create or replace function public.check_same_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if tg_table_name = 'groups' then
    if new.room_id is not null then
      select org_id into o from rooms where id = new.room_id;
      if o is distinct from new.org_id then raise exception 'Sala ne pripada ovoj školi'; end if;
    end if;
    if new.teacher_id is not null then
      select org_id into o from profiles where id = new.teacher_id;
      if o is distinct from new.org_id then raise exception 'Predavač ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name = 'schedule_slots' then
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    if new.room_id is not null then
      select org_id into o from rooms where id = new.room_id;
      if o is distinct from new.org_id then raise exception 'Sala ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name = 'sessions' then
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    if new.makeup_for is not null then
      select org_id into o from sessions where id = new.makeup_for;
      if o is distinct from new.org_id then raise exception 'Čas ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name = 'attendance' then
    select org_id into o from sessions where id = new.session_id;
    if o is distinct from new.org_id then raise exception 'Čas ne pripada ovoj školi'; end if;
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
  elsif tg_table_name in ('group_members', 'group_waitlist', 'class_packages') then
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
  elsif tg_table_name = 'charges' then
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
    if new.group_id is not null then
      select org_id into o from groups where id = new.group_id;
      if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name = 'payments' then
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
    if new.charge_id is not null then
      select org_id into o from charges where id = new.charge_id;
      if o is distinct from new.org_id then raise exception 'Zaduženje ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name in ('parent_links', 'checkins', 'absence_notices', 'reminders') then
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
  elsif tg_table_name = 'announcements' then
    if new.group_id is not null then
      select org_id into o from groups where id = new.group_id;
      if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'schedule_slots', 'sessions', 'attendance', 'charges', 'payments', 'parent_links', 'checkins', 'absence_notices', 'reminders', 'announcements', 'group_waitlist', 'class_packages'] loop
    execute format('drop trigger if exists %I_same_org on %I', t, t);
    execute format('create trigger %I_same_org before insert or update on %I for each row execute function public.check_same_org()', t, t);
  end loop;
end $$;

-- ---------- Automatska naplata: mesec za koji su zaduženja već napravljena ----------
alter table organizations add column if not exists last_auto_period text;
