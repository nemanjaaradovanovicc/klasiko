-- Paketi časova: katalog (RSD/EUR), porodična kupovina, podsetnik pred poslednji čas,
-- uputstvo za uplatu, popust za treće dete, termin svake druge nedelje, otvorena grupa.
-- Migracija se može pokrenuti više puta.

-- ---------- Škola: uputstvo za uplatu, podsetnik za paket, popust za treće dete ----------
alter table organizations add column if not exists payment_instructions text;
alter table organizations add column if not exists package_reminders boolean not null default true;
alter table organizations add column if not exists sibling_discount_3_pct numeric(5,2) not null default 0;
do $$ begin
  alter table organizations add constraint organizations_sibling_discount_3_pct_check check (sibling_discount_3_pct between 0 and 100);
exception when duplicate_object then null; end $$;

-- ---------- Grupa bez stalnih članova (radionica, prijava na čas) ----------
alter table groups add column if not exists drop_in boolean not null default false;

-- ---------- Termin: svake nedelje ili svake druge ----------
alter table schedule_slots add column if not exists recurrence text not null default 'weekly';
alter table schedule_slots add column if not exists anchor_date date;
do $$ begin
  alter table schedule_slots add constraint schedule_slots_recurrence_check check (recurrence in ('weekly', 'biweekly'));
exception when duplicate_object then null; end $$;

-- ---------- Katalog paketa ----------
create table if not exists lesson_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  lessons int not null check (lessons > 0),
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'RSD' check (currency in ('RSD', 'EUR')),
  shared boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists lesson_packages_org_idx on lesson_packages(org_id, active);
alter table lesson_packages enable row level security;
drop policy if exists lp_select on lesson_packages;
create policy lp_select on lesson_packages for select using (is_superadmin() or is_member_of(org_id));
drop policy if exists lp_write on lesson_packages;
create policy lp_write on lesson_packages for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- ---------- Kupovina paketa: valuta, uplata, porodica, automatski istek ----------
alter table class_packages add column if not exists package_id uuid references lesson_packages on delete set null;
alter table class_packages add column if not exists currency text not null default 'RSD';
alter table class_packages add column if not exists paid_at date;
alter table class_packages add column if not exists bundle_id uuid;
alter table class_packages add column if not exists shared boolean not null default false;
alter table class_packages add column if not exists auto_expires boolean not null default true;
do $$ begin
  alter table class_packages add constraint class_packages_currency_check check (currency in ('RSD', 'EUR'));
exception when duplicate_object then null; end $$;
create index if not exists class_packages_bundle_idx on class_packages(bundle_id) where bundle_id is not null;

-- Predavač sme da menja paket svoje grupe, i braću/sestre u istom porodičnom paketu.
create or replace function public.teaches_package(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_packages cp
    join groups g on g.id = cp.group_id
    where cp.id = p and g.teacher_id = auth.uid()
  ) or exists (
    select 1 from class_packages mine
    join class_packages sib on sib.bundle_id = mine.bundle_id and sib.bundle_id is not null
    join groups g on g.id = sib.group_id
    where mine.id = p and g.teacher_id = auth.uid()
  );
$$;

drop policy if exists cp_teacher_insert on class_packages;
create policy cp_teacher_insert on class_packages for insert
  with check (is_member_of(org_id) and teaches_group(group_id));
drop policy if exists cp_teacher_update on class_packages;
create policy cp_teacher_update on class_packages for update
  using (is_member_of(org_id) and teaches_package(id))
  with check (is_member_of(org_id) and teaches_package(id));
drop policy if exists cp_teacher_delete on class_packages;
create policy cp_teacher_delete on class_packages for delete
  using (is_member_of(org_id) and teaches_group(group_id));

-- Deca na zajedničkom (duo) paketu. Porodični paket sa posebnim časovima je više redova sa istim bundle_id.
create table if not exists class_package_students (
  class_package_id uuid not null references class_packages on delete cascade,
  student_id uuid not null references students on delete cascade,
  group_id uuid not null references groups on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  primary key (class_package_id, student_id)
);
create index if not exists cps_student_idx on class_package_students(student_id);
alter table class_package_students enable row level security;
drop policy if exists cps_select on class_package_students;
create policy cps_select on class_package_students for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_package(class_package_id)));
drop policy if exists cps_owner on class_package_students;
create policy cps_owner on class_package_students for all
  using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists cps_teacher on class_package_students;
create policy cps_teacher on class_package_students for all
  using (is_member_of(org_id) and teaches_group(group_id))
  with check (is_member_of(org_id) and teaches_group(group_id));

-- Otkazan čas bez nadoknade produžava istek za nedelju dana, jednom po času.
create table if not exists package_extensions (
  class_package_id uuid not null references class_packages on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  primary key (class_package_id, session_id)
);
alter table package_extensions enable row level security;
drop policy if exists px_owner on package_extensions;
create policy px_owner on package_extensions for all
  using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists px_teacher on package_extensions;
create policy px_teacher on package_extensions for all
  using (is_member_of(org_id) and teaches_package(class_package_id))
  with check (is_member_of(org_id) and teaches_package(class_package_id));

-- ---------- Valuta zaduženja i uplate (IPS QR samo za RSD) ----------
alter table charges add column if not exists currency text not null default 'RSD';
alter table payments add column if not exists currency text not null default 'RSD';
do $$ begin
  alter table charges add constraint charges_currency_check check (currency in ('RSD', 'EUR'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table payments add constraint payments_currency_check check (currency in ('RSD', 'EUR'));
exception when duplicate_object then null; end $$;

-- Predavač vidi i upisuje samo zaduženje paketa za svoju grupu, ne mesečnu članarinu.
drop policy if exists charges_teacher_package on charges;
create policy charges_teacher_package on charges for all
  using (
    is_member_of(org_id) and kind = 'package' and group_id is not null and teaches_group(group_id)
    and (
      teaches_student(student_id)
      or exists (select 1 from groups g where g.id = group_id and g.drop_in and g.teacher_id = auth.uid())
    )
  )
  with check (
    is_member_of(org_id) and kind = 'package' and group_id is not null and teaches_group(group_id)
    and (
      teaches_student(student_id)
      or exists (select 1 from groups g where g.id = group_id and g.drop_in and g.teacher_id = auth.uid())
    )
  );

create or replace function public.teaches_charge(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_packages cp
    where cp.charge_id = c and teaches_package(cp.id)
  );
$$;

drop policy if exists payments_teacher_package on payments;
create policy payments_teacher_package on payments for all
  using (is_member_of(org_id) and charge_id is not null and teaches_charge(charge_id))
  with check (
    is_member_of(org_id) and charge_id is not null and teaches_charge(charge_id)
    and exists (select 1 from charges ch where ch.id = charge_id and ch.student_id = student_id and ch.org_id = org_id)
  );

-- ---------- Podsetnik jednom po paketu ----------
alter table reminders drop constraint if exists reminders_kind_check;
alter table reminders add constraint reminders_kind_check check (kind in ('before_due', 'after_due', 'manual', 'package_low'));
alter table reminders add column if not exists class_package_id uuid references class_packages on delete cascade;
create unique index if not exists reminders_package_idx on reminders (class_package_id, kind, channel);

drop policy if exists rem_teacher_package_select on reminders;
create policy rem_teacher_package_select on reminders for select
  using (is_member_of(org_id) and kind = 'package_low' and class_package_id is not null and teaches_package(class_package_id));
drop policy if exists rem_teacher_package_insert on reminders;
create policy rem_teacher_package_insert on reminders for insert
  with check (is_member_of(org_id) and kind = 'package_low' and channel = 'whatsapp' and class_package_id is not null and teaches_package(class_package_id));

-- Predavač otvorene grupe vidi sve učenike škole da bi ih dodao na taj čas.
drop policy if exists students_select on students;
create policy students_select on students for select
  using (
    is_superadmin()
    or is_owner_of(org_id)
    or (is_member_of(org_id) and teaches_student(id))
    or (is_member_of(org_id) and exists (
      select 1 from groups g where g.org_id = students.org_id and g.teacher_id = auth.uid() and g.drop_in and g.active
    ))
  );

-- ---------- Ista škola i za nove veze ----------
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
    -- package_id se čita preko jsonb jer je kolona dodata u istoj transakciji kao ova funkcija.
    if tg_table_name = 'class_packages' and nullif(to_jsonb(new)->>'package_id', '') is not null then
      select org_id into o from lesson_packages where id = (to_jsonb(new)->>'package_id')::uuid;
      if o is distinct from new.org_id then raise exception 'Paket ne pripada ovoj školi'; end if;
    end if;
  elsif tg_table_name = 'class_package_students' then
    select org_id into o from class_packages where id = new.class_package_id;
    if o is distinct from new.org_id then raise exception 'Paket ne pripada ovoj školi'; end if;
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
  elsif tg_table_name = 'package_extensions' then
    select org_id into o from class_packages where id = new.class_package_id;
    if o is distinct from new.org_id then raise exception 'Paket ne pripada ovoj školi'; end if;
    select org_id into o from sessions where id = new.session_id;
    if o is distinct from new.org_id then raise exception 'Čas ne pripada ovoj školi'; end if;
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
    if tg_table_name = 'reminders' and nullif(to_jsonb(new)->>'class_package_id', '') is not null then
      select org_id into o from class_packages where id = (to_jsonb(new)->>'class_package_id')::uuid;
      if o is distinct from new.org_id then raise exception 'Paket ne pripada ovoj školi'; end if;
    end if;
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
  foreach t in array array['class_package_students', 'package_extensions'] loop
    execute format('drop trigger if exists %I_same_org on %I', t, t);
    execute format('create trigger %I_same_org before insert or update on %I for each row execute function public.check_same_org()', t, t);
  end loop;
end $$;
