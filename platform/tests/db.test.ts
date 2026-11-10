import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Sve migracije na pravom Postgresu, sa zamenom za Supabase auth šemu: RLS i okidači se proveravaju stvarno.
const dir = path.resolve(__dirname, '../supabase/migrations');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(path.join(dir, f), 'utf8').replace(/create extension[^;]*;/g, '')); // gen_random_uuid je ugrađen u Postgres.
const db = new PGlite();

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001', ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const OWN_A = 'aaaaaaaa-0000-4000-8000-000000000002', TEA_A = 'aaaaaaaa-0000-4000-8000-000000000003', OWN_B = 'bbbbbbbb-0000-4000-8000-000000000002', SUP = 'cccccccc-0000-4000-8000-000000000001';
const ST_A = 'aaaaaaaa-0000-4000-8000-000000000010', ST_A2 = 'aaaaaaaa-0000-4000-8000-000000000011', ST_B = 'bbbbbbbb-0000-4000-8000-000000000010';
const G_A = 'aaaaaaaa-0000-4000-8000-000000000020', G_A2 = 'aaaaaaaa-0000-4000-8000-000000000021', G_B = 'bbbbbbbb-0000-4000-8000-000000000020';

// Upit kao prijavljeni korisnik (uloga authenticated, sa RLS-om).
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
    insert into auth.users values ('${OWN_A}'), ('${TEA_A}'), ('${OWN_B}'), ('${SUP}');
    insert into organizations (id, name) values ('${ORG_A}', 'A'), ('${ORG_B}', 'B');
    insert into profiles (id, org_id, role, full_name) values ('${OWN_A}', '${ORG_A}', 'owner', 'Vlasnik A'), ('${TEA_A}', '${ORG_A}', 'teacher', 'Predavač A'), ('${OWN_B}', '${ORG_B}', 'owner', 'Vlasnik B'), ('${SUP}', null, 'superadmin', 'Admin');
    insert into students (id, org_id, first_name) values ('${ST_A}', '${ORG_A}', 'Ana'), ('${ST_A2}', '${ORG_A}', 'Luka'), ('${ST_B}', '${ORG_B}', 'Sara');
    insert into groups (id, org_id, name, teacher_id) values ('${G_A}', '${ORG_A}', 'G1', '${TEA_A}'), ('${G_A2}', '${ORG_A}', 'G2', null), ('${G_B}', '${ORG_B}', 'GB', null);
    insert into group_members (group_id, student_id, org_id) values ('${G_A}', '${ST_A}', '${ORG_A}');
  `);
});

describe('migracije', () => {
  it('mogu da se pokrenu dvaput bez greške', async () => {
    for (const m of migrations.slice(-2)) await db.exec(m);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity");
    expect(rows[0].n).toBe(0); // Svaka tabela ima RLS.
  });
});

describe('izolacija škola', () => {
  it('link za roditelje ne može da pokaže učenika druge škole', async () => {
    // Ovo je bio propust: vlasnik škole B je mogao da napravi link ka učeniku škole A.
    expect(await fails(OWN_B, `insert into parent_links (token, student_id, org_id) values ('napad-link-12345678901', '${ST_A}', '${ORG_B}')`)).toBe(true);
    expect(await fails(OWN_A, `insert into parent_links (token, student_id, org_id) values ('ok-link-1234567890123', '${ST_A}', '${ORG_A}')`)).toBe(false);
  });
  it('dolazak ne može da se upiše za učenika druge škole', async () => {
    expect(await fails(OWN_B, `insert into checkins (org_id, student_id, kind) values ('${ORG_B}', '${ST_A}', 'in')`)).toBe(true);
    expect(await fails(OWN_B, `insert into checkins (org_id, student_id, kind) values ('${ORG_A}', '${ST_A}', 'in')`)).toBe(true);
  });
  it('nove tabele odbijaju mešanje škola', async () => {
    expect(await fails(OWN_B, `insert into group_waitlist (group_id, student_id, org_id) values ('${G_B}', '${ST_A}', '${ORG_B}')`)).toBe(true);
    expect(await fails(OWN_B, `insert into class_packages (group_id, student_id, org_id, classes_total) values ('${G_B}', '${ST_A}', '${ORG_B}', 8)`)).toBe(true);
    expect(await fails(OWN_B, `insert into announcements (group_id, org_id, title) values ('${G_A}', '${ORG_B}', 'x')`)).toBe(true);
    expect(await fails(OWN_B, `insert into reminders (org_id, student_id, channel, kind) values ('${ORG_B}', '${ST_A}', 'email', 'manual')`)).toBe(true);
  });
  it('nadoknada ne može da pokazuje na čas druge škole', async () => {
    const [{ id }] = await as<{ id: string }>(OWN_A, `insert into sessions (org_id, group_id, date, start_time, status) values ('${ORG_A}', '${G_A}', '2026-01-05', '10:00', 'cancelled') returning id`);
    expect(await fails(OWN_B, `insert into sessions (org_id, group_id, date, start_time, status, makeup_for) values ('${ORG_B}', '${G_B}', '2026-01-06', '10:00', 'planned', '${id}')`)).toBe(true);
  });
  it('druga škola ne vidi tuđe podatke u novim tabelama', async () => {
    await as(OWN_A, `insert into announcements (org_id, title) values ('${ORG_A}', 'Samo za A')`);
    await db.exec(`insert into absence_notices (org_id, student_id, date) values ('${ORG_A}', '${ST_A}', '2026-12-01'); insert into audit_log (action, org_id) values ('test', '${ORG_A}');`);
    expect(await as(OWN_B, 'select * from announcements')).toEqual([]);
    expect(await as(OWN_B, 'select * from absence_notices')).toEqual([]);
    expect(await as(OWN_B, 'select * from audit_log')).toEqual([]);
    expect((await as(OWN_A, 'select * from audit_log')).length).toBe(1);
  });
});

describe('prava predavača', () => {
  it('vidi izostanak svog učenika, a ne tuđeg', async () => {
    expect((await as(TEA_A, 'select * from absence_notices')).length).toBe(1);
    await db.exec(`delete from group_members where student_id = '${ST_A}'`);
    expect(await as(TEA_A, 'select * from absence_notices')).toEqual([]);
    await db.exec(`insert into group_members (group_id, student_id, org_id) values ('${G_A}', '${ST_A}', '${ORG_A}')`);
  });
  it('obaveštenje objavljuje samo za svoju grupu', async () => {
    expect(await fails(TEA_A, `insert into announcements (org_id, group_id, title) values ('${ORG_A}', '${G_A}', 'moja grupa')`)).toBe(false);
    expect(await fails(TEA_A, `insert into announcements (org_id, group_id, title) values ('${ORG_A}', '${G_A2}', 'tuđa grupa')`)).toBe(true);
    expect(await fails(TEA_A, `insert into announcements (org_id, title) values ('${ORG_A}', 'svima')`)).toBe(true);
  });
  it('ne vidi dnevnik, zaduženja ni podsetnike', async () => {
    expect(await as(TEA_A, 'select * from audit_log')).toEqual([]);
    expect(await as(TEA_A, 'select * from charges')).toEqual([]);
    expect(await as(TEA_A, 'select * from reminders')).toEqual([]);
  });
  it('poništava samo svoj upis dolaska iz poslednjih sat vremena', async () => {
    const [{ id }] = await as<{ id: string }>(TEA_A, `insert into checkins (org_id, student_id, kind, created_by) values ('${ORG_A}', '${ST_A}', 'in', '${TEA_A}') returning id`);
    const [{ id: old }] = await as<{ id: string }>(TEA_A, `insert into checkins (org_id, student_id, kind, created_by, at) values ('${ORG_A}', '${ST_A}', 'in', '${TEA_A}', now() - interval '2 hours') returning id`);
    expect(await as(TEA_A, `delete from checkins where id = '${old}' returning id`)).toEqual([]);
    expect((await as(TEA_A, `delete from checkins where id = '${id}' returning id`)).length).toBe(1);
  });
});

describe('uplate', () => {
  it('samo mesečna članarina je jedinstvena po mesecu', async () => {
    const insert = (kind: string, group: string | null = G_A) => as(OWN_A, `insert into charges (org_id, student_id, group_id, period, amount, kind) values ('${ORG_A}', '${ST_A}', ${group ? `'${group}'` : 'null'}, '2026-11', 100, '${kind}')`);
    await insert('monthly');
    await expect(insert('monthly')).rejects.toThrow();
    await insert('extra', null);
    await insert('extra', null); // Dva dodatna zaduženja u mesecu su sada dozvoljena.
    await insert('package');
    await insert('package');
  });
  it('isti red izvoda ne može dvaput na isto zaduženje, a može na dva različita i kao avans', async () => {
    const [c1] = await as<{ id: string }>(OWN_A, `insert into charges (org_id, student_id, period, amount, kind) values ('${ORG_A}', '${ST_A}', '2026-10', 100, 'extra') returning id`);
    const [c2] = await as<{ id: string }>(OWN_A, `insert into charges (org_id, student_id, period, amount, kind) values ('${ORG_A}', '${ST_A}', '2026-09', 100, 'extra') returning id`);
    const pay = (charge: string | null) => as(OWN_A, `insert into payments (org_id, student_id, charge_id, amount, statement_hash) values ('${ORG_A}', '${ST_A}', ${charge ? `'${charge}'` : 'null'}, 50, 'hash-1')`);
    await pay(c1.id);
    await expect(pay(c1.id)).rejects.toThrow();
    await pay(c2.id);
    await pay(null);
  });
  it('vlasnik ne može sam da menja paket ni istek pretplate', async () => {
    await as(OWN_A, `update organizations set plan = 'pro', status = 'active', paid_until = '2099-01-01', sibling_discount_pct = 10, auto_charges = true where id = '${ORG_A}'`);
    const { rows } = await db.query<{ plan: string; status: string; paid_until: string | null; sibling_discount_pct: string; auto_charges: boolean }>(`select plan, status, paid_until, sibling_discount_pct, auto_charges from organizations where id = '${ORG_A}'`);
    expect(rows[0]).toMatchObject({ plan: 'start', status: 'trial', paid_until: null, auto_charges: true });
    expect(Number(rows[0].sibling_discount_pct)).toBe(10); // Svoja podešavanja menja.
  });
});

describe('ograničenje pokušaja', () => {
  it('niko osim servera ne čita ni ne piše', async () => {
    expect(await fails(OWN_A, `insert into auth_throttle (key) values ('x')`)).toBe(true);
    expect(await as(OWN_A, 'select * from auth_throttle')).toEqual([]);
  });
});

describe('samostalna registracija', () => {
  it('vlasnik ne može sam da menja poreklo škole ni administrativne oznake', async () => {
    await as(OWN_A, `update organizations set source = 'self', admin_seen_at = '2020-01-01', trial_reminder_key = 'x' where id = '${ORG_A}'`);
    const { rows } = await db.query<{ source: string; admin_seen_at: string | null; trial_reminder_key: string | null }>(`select source, admin_seen_at, trial_reminder_key from organizations where id = '${ORG_A}'`);
    expect(rows[0]).toEqual({ source: 'admin', admin_seen_at: null, trial_reminder_key: null });
  });
});

describe('stari podaci', () => {
  it('migracija vraća časove na predavača grupe i briše upise na tuđu školu', async () => {
    await db.exec(`
      insert into sessions (org_id, group_id, date, start_time, teacher_id) values ('${ORG_A}', '${G_A}', '2026-02-01', '10:00', '${OWN_A}');
      insert into sessions (org_id, group_id, date, start_time, teacher_id) values ('${ORG_A}', '${G_A2}', '2026-02-02', '10:00', '${SUP}');
    `);
    await db.exec(migrations[4]); // 004_dorada
    const { rows } = await db.query<{ date: string; teacher_id: string | null }>(`select to_char(date, 'YYYY-MM-DD') as date, teacher_id from sessions where date in ('2026-02-01', '2026-02-02') order by date`);
    expect(rows).toEqual([{ date: '2026-02-01', teacher_id: TEA_A }, { date: '2026-02-02', teacher_id: null }]);
  });
});

describe('paketi i porodice', () => {
  // Test „stari podaci” ponovo pokreće 004 i vraća staru funkciju provere škole. 006 je vraća.
  beforeAll(async () => {
    await db.exec(migrations.at(-1)!);
  });
  it('predavač ne pravi katalog, a vlasnik pravi', async () => {
    expect(await fails(TEA_A, `insert into lesson_packages (org_id, name, lessons, price, currency) values ('${ORG_A}', '10 časova', 10, 250, 'EUR')`)).toBe(true);
    expect(await fails(OWN_A, `insert into lesson_packages (org_id, name, lessons, price, currency) values ('${ORG_A}', '10 časova', 10, 250, 'EUR')`)).toBe(false);
  });
  it('predavač upisuje paket samo svojoj grupi i vidi samo zaduženja paketa', async () => {
    expect(await fails(TEA_A, `insert into class_packages (org_id, group_id, student_id, classes_total, price, currency) values ('${ORG_A}', '${G_A}', '${ST_A}', 10, 250, 'EUR')`)).toBe(false);
    expect(await fails(TEA_A, `insert into class_packages (org_id, group_id, student_id, classes_total) values ('${ORG_A}', '${G_A2}', '${ST_A2}', 8)`)).toBe(true);
    expect(await fails(TEA_A, `insert into charges (org_id, student_id, group_id, period, amount, kind) values ('${ORG_A}', '${ST_A}', '${G_A}', '2026-08', 100, 'monthly')`)).toBe(true);
    expect(await fails(TEA_A, `insert into charges (org_id, student_id, group_id, period, amount, currency, kind) values ('${ORG_A}', '${ST_A}', '${G_A}', '2026-08', 250, 'EUR', 'package')`)).toBe(false);
    const kinds = await as<{ kind: string }>(TEA_A, 'select kind from charges');
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((r) => r.kind === 'package')).toBe(true);
  });
  it('izmena tuđeg paketa ne prolazi, a paket druge škole ne može da se poveže', async () => {
    const [{ id: other }] = await as<{ id: string }>(OWN_A, `insert into class_packages (org_id, group_id, student_id, classes_total) values ('${ORG_A}', '${G_A2}', '${ST_A2}', 4) returning id`);
    expect(await as(TEA_A, `update class_packages set price = 1 where id = '${other}' returning id`)).toEqual([]);
    const [{ id: foreign }] = await as<{ id: string }>(OWN_B, `insert into lesson_packages (org_id, name, lessons, price) values ('${ORG_B}', 'Tuđi', 4, 10) returning id`);
    expect(await fails(OWN_A, `insert into class_packages (org_id, group_id, student_id, classes_total, package_id) values ('${ORG_A}', '${G_A}', '${ST_A}', 4, '${foreign}')`)).toBe(true);
  });
  it('otvorena grupa daje predavaču spisak dece škole, pa se to gasi', async () => {
    expect(await as<{ id: string }>(TEA_A, `select id from students where id = '${ST_A2}'`)).toEqual([]);
    await db.exec(`update groups set drop_in = true where id = '${G_A}'`);
    expect((await as<{ id: string }>(TEA_A, `select id from students where id = '${ST_A2}'`)).length).toBe(1);
    await db.exec(`update groups set drop_in = false where id = '${G_A}'`);
    expect(await as<{ id: string }>(TEA_A, `select id from students where id = '${ST_A2}'`)).toEqual([]);
  });
  it('više podsetnika bez paketa i dalje može da se upiše', async () => {
    const ins = `insert into reminders (org_id, student_id, channel, kind) values ('${ORG_A}', '${ST_A}', 'whatsapp', 'manual')`;
    expect(await fails(OWN_A, ins)).toBe(false);
    expect(await fails(OWN_A, ins)).toBe(false);
  });
});
