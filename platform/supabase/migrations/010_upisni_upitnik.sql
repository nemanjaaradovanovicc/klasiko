-- Upisni upitnik, jedan red po učeniku.
-- Ime deteta, datum rođenja i kontakt roditelja ostaju na students.
-- Predavač upisuje i menja samo ovu tabelu, plus ime, telefon i email roditelja preko funkcije ispod.
-- students_write i dalje važi samo za vlasnika.
-- Migracija se može pokrenuti više puta. Ne zavisi od 009.

create table if not exists student_profiles (
  student_id uuid primary key references students on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  messenger_phone text,
  country text,
  city text,
  heard_from text,
  referred_by text,
  serbian_level text,
  serbian_level_note text,
  family_type text,
  knows_local_script text,
  knows_latin text,
  knows_cyrillic text,
  desired_lessons text[] not null default '{}',
  learning_style text,
  parent_expectations text,
  activities_sports text,
  likes text,
  teacher_expectations text,
  photo_consent text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);

create index if not exists student_profiles_org_idx on student_profiles(org_id);

do $$ begin
  alter table student_profiles add constraint student_profiles_serbian_level_check
    check (serbian_level is null or serbian_level in ('pocetni', 'srednji', 'napredni', 'maternji'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_family_type_check
    check (family_type is null or family_type in ('jednojezicna', 'dvojezicna', 'trojezicna'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_local_script_check
    check (knows_local_script is null or knows_local_script in ('da', 'ne', 'delimicno'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_latin_check
    check (knows_latin is null or knows_latin in ('da', 'ne', 'delimicno'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_cyrillic_check
    check (knows_cyrillic is null or knows_cyrillic in ('da', 'ne', 'delimicno'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_photo_check
    check (photo_consent is null or photo_consent in ('da', 'ne'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_lessons_check
    check (desired_lessons <@ array['1_individualni', '2_individualna', 'grupni_vikend', 'oba']::text[]);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table student_profiles add constraint student_profiles_lengths_check check (
    (messenger_phone is null or char_length(messenger_phone) <= 80)
    and (country is null or char_length(country) <= 80)
    and (city is null or char_length(city) <= 80)
    and (heard_from is null or char_length(heard_from) <= 200)
    and (referred_by is null or char_length(referred_by) <= 200)
    and (serbian_level_note is null or char_length(serbian_level_note) <= 500)
    and (learning_style is null or char_length(learning_style) <= 4000)
    and (parent_expectations is null or char_length(parent_expectations) <= 4000)
    and (activities_sports is null or char_length(activities_sports) <= 4000)
    and (likes is null or char_length(likes) <= 4000)
    and (teacher_expectations is null or char_length(teacher_expectations) <= 4000)
  );
exception when duplicate_object then null; end $$;

comment on table student_profiles is 'Upisni upitnik. Kontakt roditelja i ime deteta su na students.';
comment on column student_profiles.messenger_phone is 'Telefon za Viber ili WhatsApp, ako treba posebno od parent_phone.';
comment on column student_profiles.serbian_level is 'pocetni, srednji, napredni ili maternji. Slobodan tekst je u serbian_level_note.';
comment on column student_profiles.knows_local_script is 'da, ne ili delimicno. Isto važi za knows_latin i knows_cyrillic.';
comment on column student_profiles.desired_lessons is '1_individualni, 2_individualna, grupni_vikend, oba. Može više.';
comment on column student_profiles.photo_consent is 'da ili ne. Prazno dok roditelj ne odgovori.';

-- Isto pravilo kao students_select: vlasnik, predavač grupe učenika, ili predavač aktivne otvorene grupe.
create or replace function public.can_access_student(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students st
    where st.id = s and (
      is_superadmin()
      or is_owner_of(st.org_id)
      or (
        is_member_of(st.org_id) and (
          teaches_student(st.id)
          or exists (
            select 1 from groups g
            where g.org_id = st.org_id and g.teacher_id = auth.uid() and g.drop_in and g.active
          )
        )
      )
    )
  );
$$;

create or replace function public.student_profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
begin
  select org_id into o from students where id = new.student_id;
  if o is null then
    raise exception 'Učenik ne postoji';
  end if;
  if o is distinct from new.org_id then
    raise exception 'Učenik ne pripada ovoj školi';
  end if;
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists student_profiles_guard on student_profiles;
create trigger student_profiles_guard before insert or update on student_profiles
  for each row execute function public.student_profile_guard();

alter table student_profiles enable row level security;

drop policy if exists student_profiles_select on student_profiles;
create policy student_profiles_select on student_profiles for select
  using (can_access_student(student_id));

drop policy if exists student_profiles_insert on student_profiles;
create policy student_profiles_insert on student_profiles for insert
  with check (
    can_access_student(student_id)
    and (is_superadmin() or is_owner_of(org_id) or is_member_of(org_id))
  );

drop policy if exists student_profiles_update on student_profiles;
create policy student_profiles_update on student_profiles for update
  using (can_access_student(student_id))
  with check (
    can_access_student(student_id)
    and (is_superadmin() or is_owner_of(org_id) or is_member_of(org_id))
  );

drop policy if exists student_profiles_delete on student_profiles;
create policy student_profiles_delete on student_profiles for delete
  using (is_superadmin() or is_owner_of(org_id));

-- Predavač ne može da menja students. Ova funkcija menja samo tri kolone kontakta roditelja.
create or replace function public.update_student_parent_contact(
  p_student uuid,
  p_parent_name text,
  p_parent_phone text,
  p_parent_email text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  n text;
  ph text;
  em text;
begin
  if auth.uid() is null then
    raise exception 'Nema prijave';
  end if;
  if not public.can_access_student(p_student) then
    raise exception 'Nema dozvole za ovog učenika';
  end if;
  n := nullif(btrim(p_parent_name), '');
  ph := nullif(btrim(p_parent_phone), '');
  em := nullif(btrim(p_parent_email), '');
  if n is not null and char_length(n) > 200 then
    raise exception 'Ime roditelja je predugačko';
  end if;
  if ph is not null and char_length(ph) > 80 then
    raise exception 'Telefon roditelja je predugačak';
  end if;
  if em is not null and char_length(em) > 200 then
    raise exception 'Email roditelja je predugačak';
  end if;
  if em is not null and em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Email roditelja nije ispravan';
  end if;
  update students
    set parent_name = n, parent_phone = ph, parent_email = em
    where id = p_student;
end $$;

revoke all on function public.update_student_parent_contact(uuid, text, text, text) from public;
grant execute on function public.update_student_parent_contact(uuid, text, text, text) to authenticated;
