-- Probni časovi: predavač ih upisuje posebno od redovnih časova, a vlasnik vidi koliko ih je bilo u mesecu
-- i koliko se kandidata posle probnog upisalo, a koliko nije.
-- Migracija se može pokrenuti više puta.

create table if not exists trial_lessons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  date date not null default current_date,
  start_time time,
  teacher_id uuid references profiles on delete set null,
  group_id uuid references groups on delete set null,
  first_name text not null,
  last_name text not null default '',
  phone text,
  email text,
  note text,
  outcome text not null default 'pending' check (outcome in ('pending', 'enrolled', 'declined')),
  outcome_at date,
  student_id uuid references students on delete set null, -- učenik koji je nastao iz ovog probnog časa
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists trial_lessons_org_date_idx on trial_lessons(org_id, date desc);
create index if not exists trial_lessons_teacher_idx on trial_lessons(teacher_id);
create index if not exists trial_lessons_student_idx on trial_lessons(student_id) where student_id is not null;

alter table trial_lessons enable row level security;

-- Vlasnik vidi i menja sve, predavač samo probne časove koje je sam držao.
drop policy if exists tl_select on trial_lessons;
create policy tl_select on trial_lessons for select
  using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teacher_id = auth.uid()));
drop policy if exists tl_owner on trial_lessons;
create policy tl_owner on trial_lessons for all
  using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));
drop policy if exists tl_teacher_insert on trial_lessons;
create policy tl_teacher_insert on trial_lessons for insert
  with check (is_member_of(org_id) and teacher_id = auth.uid());
drop policy if exists tl_teacher_update on trial_lessons;
create policy tl_teacher_update on trial_lessons for update
  using (is_member_of(org_id) and teacher_id = auth.uid())
  with check (is_member_of(org_id) and teacher_id = auth.uid());
-- Predavač briše svoj pogrešan unos samo dok ishod nije upisan, da brojke za mesec ostanu pouzdane.
drop policy if exists tl_teacher_delete on trial_lessons;
create policy tl_teacher_delete on trial_lessons for delete
  using (is_member_of(org_id) and teacher_id = auth.uid() and outcome = 'pending');

-- Posebna funkcija, a ne check_same_org: ponovno pokretanje starije migracije ne sme da ukloni ovu proveru.
create or replace function public.check_trial_lesson() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if new.teacher_id is not null then
    select org_id into o from profiles where id = new.teacher_id;
    if o is distinct from new.org_id then raise exception 'Predavač ne pripada ovoj školi'; end if;
  end if;
  if new.group_id is not null then
    select org_id into o from groups where id = new.group_id;
    if o is distinct from new.org_id then raise exception 'Grupa ne pripada ovoj školi'; end if;
  end if;
  if new.student_id is not null then
    select org_id into o from students where id = new.student_id;
    if o is distinct from new.org_id then raise exception 'Učenik ne pripada ovoj školi'; end if;
  end if;
  -- Učenika sa probnim časom povezuje samo vlasnik (predavač ne vidi sve učenike škole).
  if auth.uid() is not null and not public.is_superadmin() and not public.is_owner_of(new.org_id) then
    if tg_op = 'INSERT' then
      new.student_id := null;
    else
      new.student_id := old.student_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trial_lessons_check on trial_lessons;
create trigger trial_lessons_check before insert or update on trial_lessons
  for each row execute function public.check_trial_lesson();
