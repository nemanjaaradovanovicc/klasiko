-- Vrsta časa na grupi (i po želji na jednom času) i mesečni Zoom trošak predavača.
-- Probni časovi ostaju u trial_lessons i u izveštaju se broje kao „probni”.
-- Migracija se može pokrenuti više puta.

alter table groups add column if not exists lesson_type text;
do $$ begin
  alter table groups add constraint groups_lesson_type_check
    check (lesson_type is null or lesson_type in ('individualni', 'duo', 'grupni', 'radionica'));
exception when duplicate_object then null; end $$;

alter table sessions add column if not exists lesson_type text;
do $$ begin
  alter table sessions add constraint sessions_lesson_type_check
    check (lesson_type is null or lesson_type in ('individualni', 'duo', 'grupni', 'radionica'));
exception when duplicate_object then null; end $$;

comment on column groups.lesson_type is 'Upisana vrsta časa. Prazno: otvorena grupa je radionica, 1 aktivan član individualni, 2 duo, inače grupni.';
comment on column sessions.lesson_type is 'Vrsta samo ovog časa. Prazno znači vrsta grupe.';

create table if not exists teacher_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  teacher_id uuid not null references profiles on delete cascade,
  month date not null,
  kind text not null default 'zoom',
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, teacher_id, month, kind)
);

do $$ begin
  alter table teacher_expenses add constraint teacher_expenses_month_check check (extract(day from month) = 1);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table teacher_expenses add constraint teacher_expenses_kind_check check (length(btrim(kind)) > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table teacher_expenses add constraint teacher_expenses_currency_check check (currency in ('RSD', 'EUR'));
exception when duplicate_object then null; end $$;

create index if not exists teacher_expenses_org_month_idx on teacher_expenses(org_id, month);

-- Prazna valuta postaje valuta škole. Dan u mesecu se skraćuje na prvi.
-- Posebna funkcija, a ne check_same_org: ponovno pokretanje starije migracije ne sme da ukloni ovu proveru.
create or replace function public.teacher_expense_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  org_currency text;
begin
  select org_id into o from profiles where id = new.teacher_id;
  if o is distinct from new.org_id then
    raise exception 'Predavač ne pripada ovoj školi';
  end if;
  new.month := date_trunc('month', new.month)::date;
  if new.kind is null or btrim(new.kind) = '' then
    new.kind := 'zoom';
  end if;
  if new.currency is null or btrim(new.currency) = '' then
    select currency into org_currency from organizations where id = new.org_id;
    new.currency := coalesce(nullif(btrim(org_currency), ''), 'RSD');
  else
    new.currency := upper(btrim(new.currency));
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists teacher_expenses_before on teacher_expenses;
create trigger teacher_expenses_before before insert or update on teacher_expenses
  for each row execute function public.teacher_expense_before();

alter table teacher_expenses enable row level security;

-- Predavač vidi i menja samo svoje redove. Vlasnik vidi i menja sve u školi.
drop policy if exists te_select on teacher_expenses;
create policy te_select on teacher_expenses for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teacher_id = auth.uid()));
drop policy if exists te_owner on teacher_expenses;
create policy te_owner on teacher_expenses for all
  using (is_superadmin() or is_owner_of(org_id))
  with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists te_teacher_insert on teacher_expenses;
create policy te_teacher_insert on teacher_expenses for insert
  with check (is_member_of(org_id) and teacher_id = auth.uid());
drop policy if exists te_teacher_update on teacher_expenses;
create policy te_teacher_update on teacher_expenses for update
  using (is_member_of(org_id) and teacher_id = auth.uid())
  with check (is_member_of(org_id) and teacher_id = auth.uid());
