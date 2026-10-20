-- Klasiko: link za roditelje, poziv na broj za uparivanje uplata, nadoknade, dolasci (QR)

-- Stabilan broj učenika za „poziv na broj” (jedinstven u bazi)
create sequence if not exists student_ref_seq start 1001;
alter table students add column if not exists ref_no bigint not null default nextval('student_ref_seq');
create unique index if not exists students_ref_no_idx on students(ref_no);

-- Lični link za roditelja (bez prijave). Token je tajni ključ; čita ga samo server.
create table if not exists parent_links (
  token text primary key,
  student_id uuid not null references students on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked boolean not null default false
);
create index if not exists parent_links_student_idx on parent_links(student_id);
alter table parent_links enable row level security;
drop policy if exists pl_owner on parent_links;
create policy pl_owner on parent_links for all using (is_superadmin() or is_owner_of(org_id)) with check (is_superadmin() or is_owner_of(org_id));

-- Nadoknada: čas koji zamenjuje otkazani
alter table sessions add column if not exists makeup_for uuid references sessions on delete set null;
alter table sessions add column if not exists end_time time;
create index if not exists sessions_makeup_idx on sessions(makeup_for);

-- Dolasci i odlasci (QR prijava, vrtići i klubovi)
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  student_id uuid not null references students on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  picked_up_by text,
  note text,
  created_by uuid references profiles on delete set null
);
create index if not exists checkins_org_at_idx on checkins(org_id, at desc);
alter table checkins enable row level security;
drop policy if exists ck_select on checkins;
create policy ck_select on checkins for select using (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_student(student_id)));
drop policy if exists ck_insert on checkins;
create policy ck_insert on checkins for insert with check (is_superadmin() or is_owner_of(org_id) or (is_member_of(org_id) and teaches_student(student_id)));
drop policy if exists ck_owner on checkins;
create policy ck_owner on checkins for delete using (is_superadmin() or is_owner_of(org_id));

-- QR kartica za dolazak: poseban token po učeniku (ne otkriva ništa sam po sebi)
alter table students add column if not exists checkin_code text;
create unique index if not exists students_checkin_code_idx on students(checkin_code) where checkin_code is not null;

-- Zakazana nadoknada je „planned” dok se ne upiše prisustvo
alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check check (status in ('held', 'cancelled', 'planned'));
