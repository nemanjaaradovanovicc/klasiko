-- Klasiko: početna šema baze
-- Svaka škola (organizations) vidi samo svoje podatke (RLS).
-- Uloge: superadmin (vlasnik Klasika), owner (vlasnik škole), teacher (predavač).

create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('superadmin', 'owner', 'teacher');
exception when duplicate_object then null; end $$;
do $$ begin
  create type org_status as enum ('trial', 'active', 'suspended', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type plan_code as enum ('start', 'rast', 'pro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type billing_cycle as enum ('monthly', 'yearly', 'lifetime');
exception when duplicate_object then null; end $$;

-- ---------- Tabele ----------

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'skola_jezika',
  city text,
  address text,
  phone text,
  email text,
  pib text,
  mb text,
  bank_account text,
  payee_name text,
  fee_due_day int not null default 10 check (fee_due_day between 1 and 28),
  default_fee numeric(10,2),
  plan plan_code not null default 'start',
  billing billing_cycle not null default 'monthly',
  status org_status not null default 'trial',
  trial_ends_at date default (current_date + 14),
  paid_until date,
  admin_notes text,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid references organizations on delete cascade,
  role user_role not null default 'teacher',
  full_name text not null default '',
  email text,
  phone text,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists profiles_org_idx on profiles(org_id);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  capacity int,
  created_at timestamptz not null default now()
);
create index if not exists rooms_org_idx on rooms(org_id);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  level text,
  teacher_id uuid references profiles on delete set null,
  room_id uuid references rooms on delete set null,
  monthly_fee numeric(10,2),
  capacity int,
  color text not null default '#5B2A86',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists groups_org_idx on groups(org_id);
create index if not exists groups_teacher_idx on groups(teacher_id);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  first_name text not null,
  last_name text not null default '',
  birth_date date,
  phone text,
  email text,
  parent_name text,
  parent_phone text,
  parent_email text,
  notes text,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  custom_fee numeric(10,2),
  active boolean not null default true,
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now()
);
create index if not exists students_org_idx on students(org_id);

create table if not exists group_members (
  group_id uuid not null references groups on delete cascade,
  student_id uuid not null references students on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  joined_at date not null default current_date,
  primary key (group_id, student_id)
);
create index if not exists gm_student_idx on group_members(student_id);

create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  group_id uuid not null references groups on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  room_id uuid references rooms on delete set null
);
create index if not exists slots_group_idx on schedule_slots(group_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  group_id uuid not null references groups on delete cascade,
  date date not null,
  start_time time not null default '00:00',
  teacher_id uuid references profiles on delete set null,
  status text not null default 'held' check (status in ('held', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  unique (group_id, date, start_time)
);
create index if not exists sessions_org_date_idx on sessions(org_id, date);

create table if not exists attendance (
  session_id uuid not null references sessions on delete cascade,
  student_id uuid not null references students on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  status text not null check (status in ('present', 'absent', 'excused')),
  primary key (session_id, student_id)
);
create index if not exists attendance_student_idx on attendance(student_id);

create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  group_id uuid references groups on delete set null,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  description text,
  amount numeric(10,2) not null check (amount >= 0),
  due_date date,
  created_at timestamptz not null default now()
);
create unique index if not exists charges_unique_idx on charges(student_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), period);
create index if not exists charges_org_period_idx on charges(org_id, period);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  charge_id uuid references charges on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text not null default 'bank' check (method in ('cash', 'bank', 'card', 'other')),
  note text,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_org_idx on payments(org_id, paid_at);
create index if not exists payments_charge_idx on payments(charge_id);

create table if not exists demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  school text,
  kind text,
  students_count text,
  phone text,
  email text,
  preferred_time text,
  message text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'won', 'lost')),
  admin_notes text,
  org_id uuid references organizations on delete set null
);

-- ---------- Pomoćne funkcije ----------

create or replace function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid() and active
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' from profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_owner_of(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'owner' and org_id = o)
$$;

create or replace function public.is_member_of(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and org_id = o)
$$;

create or replace function public.teaches_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = g and teacher_id = auth.uid())
$$;

create or replace function public.teaches_student(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm join groups g on g.id = gm.group_id
    where gm.student_id = s and g.teacher_id = auth.uid()
  )
$$;

-- Vlasnik škole ne može sam da menja paket, status i datume pretplate.
create or replace function public.protect_org_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() and auth.uid() is not null then
    new.plan := old.plan;
    new.billing := old.billing;
    new.status := old.status;
    new.trial_ends_at := old.trial_ends_at;
    new.paid_until := old.paid_until;
    new.admin_notes := old.admin_notes;
  end if;
  return new;
end $$;
drop trigger if exists organizations_protect_billing on organizations;
create trigger organizations_protect_billing before update on organizations
  for each row execute function public.protect_org_billing();

-- Korisnik ne može sam sebi da promeni ulogu, školu ili status.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() and auth.uid() is not null then
    new.role := old.role;
    new.org_id := old.org_id;
    new.active := old.active;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles
  for each row execute function public.protect_profile();

-- ---------- RLS ----------

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table groups enable row level security;
alter table students enable row level security;
alter table group_members enable row level security;
alter table schedule_slots enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
alter table demo_requests enable row level security;

-- organizations
drop policy if exists org_select on organizations;
create policy org_select on organizations for select using (is_superadmin() or is_member_of(id));
drop policy if exists org_update on organizations;
create policy org_update on organizations for update using (is_superadmin() or is_owner_of(id));
drop policy if exists org_admin_all on organizations;
create policy org_admin_all on organizations for all using (is_superadmin()) with check (is_superadmin());

-- profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_superadmin() or (org_id is not null and is_member_of(org_id)));
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update using (id = auth.uid() or is_superadmin() or (org_id is not null and is_owner_of(org_id)));

-- rooms: svi članovi škole čitaju, vlasnik menja
drop policy if exists rooms_select on rooms;
create policy rooms_select on rooms for select using (is_superadmin() or is_member_of(org_id));
drop policy if exists rooms_write on rooms;
create policy rooms_write on rooms for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- groups: vlasnik sve, predavač svoje
drop policy if exists groups_select on groups;
create policy groups_select on groups for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teacher_id = auth.uid()));
drop policy if exists groups_write on groups;
create policy groups_write on groups for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- students: vlasnik sve, predavač učenike iz svojih grupa (samo čitanje)
drop policy if exists students_select on students;
create policy students_select on students for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_student(id)));
drop policy if exists students_write on students;
create policy students_write on students for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- group_members
drop policy if exists gm_select on group_members;
create policy gm_select on group_members for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));
drop policy if exists gm_write on group_members;
create policy gm_write on group_members for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- schedule_slots
drop policy if exists slots_select on schedule_slots;
create policy slots_select on schedule_slots for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));
drop policy if exists slots_write on schedule_slots;
create policy slots_write on schedule_slots for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- sessions: predavač može da otvori i menja čas svoje grupe
drop policy if exists sessions_select on sessions;
create policy sessions_select on sessions for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));
drop policy if exists sessions_write on sessions;
create policy sessions_write on sessions for all
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)))
  with check (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_group(group_id)));

-- attendance
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and exists (select 1 from sessions s where s.id = session_id and teaches_group(s.group_id))));
drop policy if exists attendance_write on attendance;
create policy attendance_write on attendance for all
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and exists (select 1 from sessions s where s.id = session_id and teaches_group(s.group_id))))
  with check (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and exists (select 1 from sessions s where s.id = session_id and teaches_group(s.group_id))));

-- charges i payments: samo vlasnik
drop policy if exists charges_all on charges;
create policy charges_all on charges for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists payments_all on payments;
create policy payments_all on payments for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- demo_requests: samo superadmin (sajt upisuje preko servisnog ključa)
drop policy if exists demo_admin on demo_requests;
create policy demo_admin on demo_requests for all using (is_superadmin()) with check (is_superadmin());

-- ---------- Doslednost: povezani zapisi moraju biti iz iste škole ----------

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
  elsif tg_table_name = 'group_members' then
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
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
  elsif tg_table_name = 'attendance' then
    select org_id into o from sessions where id = new.session_id;
    if o is distinct from new.org_id then raise exception 'Čas ne pripada ovoj školi'; end if;
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
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'schedule_slots', 'sessions', 'attendance', 'charges', 'payments'] loop
    execute format('drop trigger if exists %I_same_org on %I', t, t);
    execute format('create trigger %I_same_org before insert or update on %I for each row execute function public.check_same_org()', t, t);
  end loop;
end $$;
