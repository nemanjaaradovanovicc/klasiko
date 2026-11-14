import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(__dirname, '../supabase/migrations');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(path.join(dir, f), 'utf8').replace(/create extension[^;]*;/g, ''));
const db = new PGlite();

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001', ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const OWN_A = 'aaaaaaaa-0000-4000-8000-000000000002', TEA_A = 'aaaaaaaa-0000-4000-8000-000000000003', OWN_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ST_A = 'aaaaaaaa-0000-4000-8000-000000000010', ST_A2 = 'aaaaaaaa-0000-4000-8000-000000000011', ST_B = 'bbbbbbbb-0000-4000-8000-000000000010';
const G_A = 'aaaaaaaa-0000-4000-8000-000000000020';

async function as<T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const fails = async (uid: string, sql: string) => {
  let failed = false;
  try { await as(uid, sql); } catch { failed = true; }
  return failed;
};

beforeAll(async () => {
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  for (const m of migrations) await db.exec(m);
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    insert into auth.users values ('${OWN_A}'), ('${TEA_A}'), ('${OWN_B}');
    insert into organizations (id, name) values ('${ORG_A}', 'A'), ('${ORG_B}', 'B');
    insert into profiles (id, org_id, role, full_name) values ('${OWN_A}', '${ORG_A}', 'owner', 'Vlasnik A'), ('${TEA_A}', '${ORG_A}', 'teacher', 'Predavač A'), ('${OWN_B}', '${ORG_B}', 'owner', 'Vlasnik B');
    insert into students (id, org_id, first_name, discount_pct) values ('${ST_A}', '${ORG_A}', 'Ana', 0), ('${ST_A2}', '${ORG_A}', 'Luka', 0), ('${ST_B}', '${ORG_B}', 'Sara', 0);
    insert into groups (id, org_id, name, teacher_id) values ('${G_A}', '${ORG_A}', 'G1', '${TEA_A}');
    insert into group_members (group_id, student_id, org_id) values ('${G_A}', '${ST_A}', '${ORG_A}');
  `);
});

describe('upisni upitnik', () => {
  it('predavač upisuje upitnik svog učenika, a ne tuđeg ni tuđe škole', async () => {
    const [row] = await as<{ city: string; updated_by: string; photo_consent: string | null }>(TEA_A, `insert into student_profiles (student_id, org_id, city, serbian_level, family_type, knows_local_script, desired_lessons, photo_consent) values ('${ST_A}', '${ORG_A}', 'Beograd', 'pocetni', 'dvojezicna', 'delimicno', array['1_individualni', 'oba'], null) returning city, updated_by, photo_consent`);
    expect(row).toEqual({ city: 'Beograd', updated_by: TEA_A, photo_consent: null });
    expect(await fails(TEA_A, `insert into student_profiles (student_id, org_id, city) values ('${ST_A2}', '${ORG_A}', 'Novi Sad')`)).toBe(true);
    expect(await fails(TEA_A, `insert into student_profiles (student_id, org_id, city) values ('${ST_B}', '${ORG_B}', 'Zagreb')`)).toBe(true);
    expect(await fails(OWN_B, `select student_id from student_profiles`)).toBe(false);
    expect(await as(OWN_B, 'select student_id from student_profiles')).toEqual([]);
  });

  it('odbija nepoznat nivo, saglasnost, čas i predugačak telefon', async () => {
    expect(await fails(OWN_A, `update student_profiles set serbian_level = 'a1' where student_id = '${ST_A}'`)).toBe(true);
    expect(await fails(OWN_A, `update student_profiles set photo_consent = 'mozda' where student_id = '${ST_A}'`)).toBe(true);
    expect(await fails(OWN_A, `update student_profiles set desired_lessons = array['vikend'] where student_id = '${ST_A}'`)).toBe(true);
    expect(await fails(OWN_A, `update student_profiles set messenger_phone = repeat('1', 81) where student_id = '${ST_A}'`)).toBe(true);
    const [kept] = await as<{ serbian_level: string; photo_consent: string | null }>(OWN_A, `select serbian_level, photo_consent from student_profiles where student_id = '${ST_A}'`);
    expect(kept).toEqual({ serbian_level: 'pocetni', photo_consent: null });
  });

  it('predavač ne menja students direktno, a funkcija menja samo kontakt roditelja', async () => {
    expect(await as(TEA_A, `update students set parent_name = 'Tuđe', discount_pct = 40 where id = '${ST_A}' returning id`)).toEqual([]);
    await as(TEA_A, `select update_student_parent_contact('${ST_A}', '  Mama Ana  ', '064111', 'mama@example.com')`);
    const { rows } = await db.query<{ parent_name: string | null; parent_phone: string | null; parent_email: string | null; discount_pct: string; first_name: string }>(`select parent_name, parent_phone, parent_email, discount_pct::text, first_name from students where id = '${ST_A}'`);
    expect(rows[0]).toMatchObject({ parent_name: 'Mama Ana', parent_phone: '064111', parent_email: 'mama@example.com', first_name: 'Ana' });
    expect(Number(rows[0].discount_pct)).toBe(0);
    expect(await fails(TEA_A, `select update_student_parent_contact('${ST_A}', 'X', '1', 'nije-email')`)).toBe(true);
    expect(await fails(TEA_A, `select update_student_parent_contact('${ST_A2}', 'X', '1', 'a@b.co')`)).toBe(true);
    expect(await fails(OWN_B, `select update_student_parent_contact('${ST_A}', 'X', '1', 'a@b.co')`)).toBe(true);
    const { rows: still } = await db.query<{ parent_name: string }>(`select parent_name from students where id = '${ST_A}'`);
    expect(still[0].parent_name).toBe('Mama Ana');
  });

  it('prazan kontakt briše vrednost, a predugačko ime ne prolazi', async () => {
    await as(TEA_A, `select update_student_parent_contact('${ST_A}', '   ', '', '  ')`);
    const { rows } = await db.query<{ parent_name: string | null; parent_phone: string | null; parent_email: string | null }>(`select parent_name, parent_phone, parent_email from students where id = '${ST_A}'`);
    expect(rows[0]).toEqual({ parent_name: null, parent_phone: null, parent_email: null });
    expect(await fails(TEA_A, `select update_student_parent_contact('${ST_A}', repeat('a', 201), null, null)`)).toBe(true);
  });

  it('arhivirana grupa i dalje daje predavaču upitnik, otvorena grupa samo dok je aktivna', async () => {
    await db.exec(`update groups set active = false where id = '${G_A}'`);
    const [row] = await as<{ city: string }>(TEA_A, `update student_profiles set city = 'Niš' where student_id = '${ST_A}' returning city`);
    expect(row.city).toBe('Niš');
    await db.exec(`update groups set active = true where id = '${G_A}'`);

    expect(await as(TEA_A, `select student_id from student_profiles where student_id = '${ST_A2}'`)).toEqual([]);
    await db.exec(`update groups set drop_in = true, active = false where id = '${G_A}'`);
    expect(await fails(TEA_A, `insert into student_profiles (student_id, org_id, city) values ('${ST_A2}', '${ORG_A}', 'Subotica')`)).toBe(true);
    await db.exec(`update groups set active = true where id = '${G_A}'`);
    const [opened] = await as<{ city: string }>(TEA_A, `insert into student_profiles (student_id, org_id, city) values ('${ST_A2}', '${ORG_A}', 'Subotica') returning city`);
    expect(opened.city).toBe('Subotica');
    await db.exec(`update groups set drop_in = false where id = '${G_A}'`);
    expect(await as(TEA_A, `update student_profiles set city = 'Zrenjanin' where student_id = '${ST_A2}' returning student_id`)).toEqual([]);
    const { rows } = await db.query<{ city: string }>(`select city from student_profiles where student_id = '${ST_A2}'`);
    expect(rows[0].city).toBe('Subotica');
  });

  it('predavač ne briše upitnik, a brisanje učenika briše i red', async () => {
    expect(await as(TEA_A, `delete from student_profiles where student_id = '${ST_A}' returning student_id`)).toEqual([]);
    expect((await as(OWN_A, `select student_id from student_profiles where student_id = '${ST_A}'`)).length).toBe(1);
    const [{ id: st }] = await as<{ id: string }>(OWN_A, `insert into students (org_id, first_name) values ('${ORG_A}', 'Privremeni') returning id`);
    await as(OWN_A, `insert into student_profiles (student_id, org_id, country) values ('${st}', '${ORG_A}', 'Srbija')`);
    await as(OWN_A, `delete from students where id = '${st}'`);
    expect(await as(OWN_A, `select student_id from student_profiles where student_id = '${st}'`)).toEqual([]);
  });

  it('anonimni poziv funkcije ne prolazi', async () => {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
    let failed = false;
    try {
      await db.query(`select update_student_parent_contact('${ST_A}', 'X', null, null)`);
    } catch {
      failed = true;
    } finally {
      await db.exec('reset role;');
    }
    expect(failed).toBe(true);
  });
});
