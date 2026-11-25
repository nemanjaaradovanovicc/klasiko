-- Ko je i kada prvi put upisao prisustvo (ili otkazivanje) časa, ko ga je poslednji menjao,
-- i ko je poslednji menjao belešku. Planirani čas (nadoknada) se ne računa dok ne postane održan ili otkazan.
-- Okidač je izvor istine (auth.uid()). Ako nema prijave (servisni ključ), ostaju vrednosti koje je upisao server.
-- Migracija se može pokrenuti više puta.

alter table sessions add column if not exists attendance_recorded_by uuid;
alter table sessions add column if not exists attendance_recorded_at timestamptz;
alter table sessions add column if not exists attendance_updated_by uuid;
alter table sessions add column if not exists attendance_updated_at timestamptz;
alter table sessions add column if not exists note_updated_by uuid;
alter table sessions add column if not exists note_updated_at timestamptz;

do $$ begin
  alter table sessions add constraint sessions_attendance_recorded_by_fkey
    foreign key (attendance_recorded_by) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sessions add constraint sessions_attendance_updated_by_fkey
    foreign key (attendance_updated_by) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sessions add constraint sessions_note_updated_by_fkey
    foreign key (note_updated_by) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

comment on column sessions.attendance_recorded_by is 'Profil koji je prvi upisao prisustvo ili otkazivanje ovog časa.';
comment on column sessions.attendance_recorded_at is 'Kada je prisustvo ili otkazivanje prvi put upisano.';
comment on column sessions.attendance_updated_by is 'Profil koji je poslednji menjao prisustvo ili status časa. Prazno ako nije menjano posle prvog upisa.';
comment on column sessions.attendance_updated_at is 'Kada je prisustvo ili status poslednji put menjano.';
comment on column sessions.note_updated_by is 'Profil koji je poslednji upisao ili izmenio belešku časa.';
comment on column sessions.note_updated_at is 'Kada je beleška poslednji put upisana ili izmenjena. Na prvom upisu isto vreme kao attendance_recorded_at.';

create or replace function public.stamp_session_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  stamp timestamptz := now();
begin
  -- Upis sa tabele attendance već nosi tačne kolone. Ne dirati ih.
  if tg_op = 'UPDATE' and current_setting('klasiko.audit_from_attendance', true) = '1' then
    return new;
  end if;

  -- Nema prijave: zadrži ono što je server uneo (rezerva ako okidač nije jedini put).
  if actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.attendance_recorded_by := null;
    new.attendance_recorded_at := null;
    new.attendance_updated_by := null;
    new.attendance_updated_at := null;
    new.note_updated_by := null;
    new.note_updated_at := null;
    if new.status in ('held', 'cancelled') then
      new.attendance_recorded_by := actor;
      new.attendance_recorded_at := stamp;
      if new.note is not null then
        new.note_updated_by := actor;
        new.note_updated_at := stamp;
      end if;
    end if;
    return new;
  end if;

  new.attendance_recorded_by := old.attendance_recorded_by;
  new.attendance_recorded_at := old.attendance_recorded_at;
  new.attendance_updated_by := old.attendance_updated_by;
  new.attendance_updated_at := old.attendance_updated_at;
  new.note_updated_by := old.note_updated_by;
  new.note_updated_at := old.note_updated_at;

  if new.status in ('held', 'cancelled') and (
    old.attendance_recorded_at is null
    or (old.status is distinct from 'held' and old.status is distinct from 'cancelled')
  ) then
    new.attendance_recorded_by := actor;
    new.attendance_recorded_at := stamp;
    new.attendance_updated_by := null;
    new.attendance_updated_at := null;
    if new.note is not null then
      new.note_updated_by := actor;
      new.note_updated_at := stamp;
    end if;
  elsif new.status in ('held', 'cancelled') and old.status is distinct from new.status then
    new.attendance_updated_by := actor;
    new.attendance_updated_at := stamp;
    if old.note is distinct from new.note then
      new.note_updated_by := actor;
      new.note_updated_at := stamp;
    end if;
  elsif new.status in ('held', 'cancelled') and old.note is distinct from new.note then
    new.note_updated_by := actor;
    new.note_updated_at := stamp;
  end if;

  return new;
end $$;

drop trigger if exists sessions_stamp_audit on sessions;
create trigger sessions_stamp_audit before insert or update on sessions
  for each row execute function public.stamp_session_audit();

-- Oznake se čuvaju posebnim zahtevom, posle reda časa. Zato prvi paket umetnutih redova
-- (nema starijih oznaka, čas tek upisan) nije naknadna izmena. Okidač je po naredbi, ne po redu.
create or replace function public.stamp_attendance_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  sid uuid;
  prior int;
  fresh boolean;
begin
  if actor is null then
    return null;
  end if;

  perform set_config('klasiko.audit_from_attendance', '1', true);

  if tg_op = 'INSERT' then
    for sid in select distinct session_id from new_marks loop
      fresh := false;
      select count(*) into prior
      from attendance a
      where a.session_id = sid
        and not exists (
          select 1 from new_marks n
          where n.session_id = a.session_id and n.student_id = a.student_id
        );
      select
        s.attendance_updated_at is null
        and (s.attendance_recorded_at is null or s.attendance_recorded_at >= now() - interval '30 seconds')
      into fresh
      from sessions s
      where s.id = sid;
      if prior = 0 and coalesce(fresh, false) then
        update sessions s
        set attendance_recorded_by = coalesce(s.attendance_recorded_by, actor),
            attendance_recorded_at = coalesce(s.attendance_recorded_at, now())
        where s.id = sid and s.status in ('held', 'cancelled');
      else
        update sessions s
        set attendance_recorded_by = coalesce(s.attendance_recorded_by, actor),
            attendance_recorded_at = coalesce(s.attendance_recorded_at, now()),
            attendance_updated_by = actor,
            attendance_updated_at = now()
        where s.id = sid and s.status in ('held', 'cancelled');
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    for sid in
      select distinct n.session_id
      from new_marks n
      join old_marks o on o.session_id = n.session_id and o.student_id = n.student_id
      where n.status is distinct from o.status
    loop
      update sessions s
      set attendance_recorded_by = coalesce(s.attendance_recorded_by, actor),
          attendance_recorded_at = coalesce(s.attendance_recorded_at, now()),
          attendance_updated_by = case
            when s.attendance_recorded_at is null or s.attendance_recorded_at = now() then s.attendance_updated_by
            else actor
          end,
          attendance_updated_at = case
            when s.attendance_recorded_at is null or s.attendance_recorded_at = now() then s.attendance_updated_at
            else now()
          end
      where s.id = sid and s.status in ('held', 'cancelled');
    end loop;
  elsif tg_op = 'DELETE' then
    for sid in select distinct session_id from old_marks loop
      update sessions s
      set attendance_updated_by = actor,
          attendance_updated_at = now()
      where s.id = sid
        and s.status in ('held', 'cancelled')
        and s.attendance_recorded_at is not null
        and s.attendance_recorded_at is distinct from now();
    end loop;
  end if;

  perform set_config('klasiko.audit_from_attendance', '', true);
  return null;
end $$;

drop trigger if exists attendance_stamp_audit on attendance;
drop trigger if exists attendance_stamp_audit_ins on attendance;
drop trigger if exists attendance_stamp_audit_upd on attendance;
drop trigger if exists attendance_stamp_audit_del on attendance;
create trigger attendance_stamp_audit_ins after insert on attendance
  referencing new table as new_marks
  for each statement execute function public.stamp_attendance_audit();
create trigger attendance_stamp_audit_upd after update on attendance
  referencing old table as old_marks new table as new_marks
  for each statement execute function public.stamp_attendance_audit();
create trigger attendance_stamp_audit_del after delete on attendance
  referencing old table as old_marks
  for each statement execute function public.stamp_attendance_audit();
