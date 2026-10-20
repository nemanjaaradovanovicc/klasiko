// Test na pravoj bazi: pravi privremene škole i korisnike, proverava prava pristupa i stranice, pa sve briše.
// Pokretanje: node --env-file=.env.local scripts/smoke-test.mjs [http://localhost:3000]
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.argv[2];
const ref = new globalThis.URL(URL).hostname.split('.')[0];
const tag = 'smoke' + Date.now();
const pass = 'Test-' + Math.random().toString(36).slice(2, 12) + 'A1';
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

async function mkUser(email, role, orgId, name) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (error) throw error;
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, org_id: orgId, role, full_name: name, email, must_change_password: false });
  if (e2) throw e2;
  return data.user.id;
}
async function session(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
  if (error) throw error;
  return { c, s: data.session };
}
function cookieFor(s) {
  const val = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url');
  const name = `sb-${ref}-auth-token`;
  if (val.length <= 3180) return `${name}=${val}`;
  const parts = [];
  for (let i = 0, n = 0; i < val.length; i += 3180, n++) parts.push(`${name}.${n}=${val.slice(i, i + 3180)}`);
  return parts.join('; ');
}

const created = { users: [], orgs: [] };
try {
  console.log('Priprema');
  const { data: orgA } = await admin.from('organizations').insert({ name: `${tag} Škola A`, kind: 'skola_jezika', bank_account: '160-5100000000-99', payee_name: 'Škola A', default_fee: 4000 }).select().single();
  const { data: orgB } = await admin.from('organizations').insert({ name: `${tag} Škola B`, kind: 'plesna_skola' }).select().single();
  created.orgs.push(orgA.id, orgB.id);
  const sup = await mkUser(`${tag}-super@klasiko.test`, 'superadmin', null, 'Test Admin');
  const ownA = await mkUser(`${tag}-owna@klasiko.test`, 'owner', orgA.id, 'Vlasnik A');
  const teaA = await mkUser(`${tag}-teaa@klasiko.test`, 'teacher', orgA.id, 'Predavač A');
  const ownB = await mkUser(`${tag}-ownb@klasiko.test`, 'owner', orgB.id, 'Vlasnik B');
  created.users.push(sup, ownA, teaA, ownB);

  const A = await session(`${tag}-owna@klasiko.test`);
  const T = await session(`${tag}-teaa@klasiko.test`);
  const B = await session(`${tag}-ownb@klasiko.test`);

  console.log('Vlasnik A unosi podatke');
  const { data: room } = await A.c.from('rooms').insert({ org_id: orgA.id, name: 'Sala 1' }).select().single();
  ok(!!room, 'sala');
  const { data: g1 } = await A.c.from('groups').insert({ org_id: orgA.id, name: 'Engleski B1', teacher_id: teaA, room_id: room.id, monthly_fee: 4000 }).select().single();
  const { data: g2 } = await A.c.from('groups').insert({ org_id: orgA.id, name: 'Nemački A1', monthly_fee: 3500 }).select().single();
  ok(!!g1 && !!g2, 'grupe');
  const { data: sts, error: stErr } = await A.c.from('students').insert([
    { org_id: orgA.id, first_name: 'Ana', last_name: 'Petrović', parent_phone: '0641234567' },
    { org_id: orgA.id, first_name: 'Luka', last_name: 'Ilić', discount_pct: 10 },
    { org_id: orgA.id, first_name: 'Mina', last_name: 'Popović' },
  ], { defaultToNull: false }).select();
  ok(sts?.length === 3, 'učenici' + (stErr ? ' ' + stErr.message : ''));
  await A.c.from('group_members').insert([
    { group_id: g1.id, student_id: sts[0].id, org_id: orgA.id },
    { group_id: g1.id, student_id: sts[1].id, org_id: orgA.id },
    { group_id: g2.id, student_id: sts[2].id, org_id: orgA.id },
  ]);
  const wd = ((new Date().getUTCDay() + 6) % 7) + 1;
  const { error: slotErr } = await A.c.from('schedule_slots').insert({ org_id: orgA.id, group_id: g1.id, weekday: wd, start_time: '17:00', end_time: '18:00', room_id: room.id });
  ok(!slotErr, 'termin u rasporedu');
  const period = new Date().toISOString().slice(0, 7);
  const { data: ch } = await A.c.from('charges').insert({ org_id: orgA.id, student_id: sts[0].id, group_id: g1.id, period, amount: 4000 }).select().single();
  ok(!!ch, 'zaduženje');
  const { error: payErr } = await A.c.from('payments').insert({ org_id: orgA.id, student_id: sts[0].id, charge_id: ch.id, amount: 4000, method: 'cash' });
  ok(!payErr, 'uplata');

  console.log('Izolacija škola');
  const { data: bSees } = await B.c.from('students').select('id');
  ok((bSees ?? []).length === 0, 'vlasnik B ne vidi učenike škole A');
  const { data: bOrgs } = await B.c.from('organizations').select('id');
  ok(bOrgs?.length === 1 && bOrgs[0].id === orgB.id, 'vlasnik B vidi samo svoju školu');
  const { error: crossErr } = await B.c.from('students').insert({ org_id: orgA.id, first_name: 'Uljez' });
  ok(!!crossErr, 'vlasnik B ne može da upiše učenika u školu A');
  const { data: bStB } = await B.c.from('students').insert({ org_id: orgB.id, first_name: 'Sara' }).select().single();
  const { error: mixErr } = await B.c.from('group_members').insert({ group_id: g1.id, student_id: bStB.id, org_id: orgB.id });
  ok(!!mixErr, 'baza odbija mešanje grupe A i učenika B');

  console.log('Prava predavača');
  const { data: tGroups } = await T.c.from('groups').select('id');
  ok(tGroups?.length === 1 && tGroups[0].id === g1.id, 'predavač vidi samo svoju grupu');
  const { data: tSt } = await T.c.from('students').select('id');
  ok(tSt?.length === 2, 'predavač vidi samo učenike svoje grupe');
  const { data: tPay } = await T.c.from('payments').select('id');
  const { data: tCh } = await T.c.from('charges').select('id');
  ok((tPay ?? []).length === 0 && (tCh ?? []).length === 0, 'predavač ne vidi uplate ni zaduženja');
  const today = new Date().toISOString().slice(0, 10);
  const { data: sess, error: sErr } = await T.c.from('sessions').insert({ org_id: orgA.id, group_id: g1.id, date: today, start_time: '17:00', teacher_id: teaA }).select().single();
  ok(!sErr && !!sess, 'predavač otvara čas svoje grupe');
  const { error: aErr } = await T.c.from('attendance').insert([{ session_id: sess.id, student_id: sts[0].id, org_id: orgA.id, status: 'present' }, { session_id: sess.id, student_id: sts[1].id, org_id: orgA.id, status: 'absent' }]);
  ok(!aErr, 'predavač upisuje prisustvo');
  const { error: tg2 } = await T.c.from('sessions').insert({ org_id: orgA.id, group_id: g2.id, date: today, start_time: '18:00' });
  ok(!!tg2, 'predavač ne može da upiše čas tuđe grupe');
  const { error: tUpd } = await T.c.from('groups').update({ monthly_fee: 1 }).eq('id', g1.id).select();
  const { data: gAfter } = await admin.from('groups').select('monthly_fee').eq('id', g1.id).single();
  ok(Number(gAfter.monthly_fee) === 4000, 'predavač ne može da menja cenu grupe' + (tUpd ? '' : ''));
  const { error: roleErr } = await T.c.from('profiles').update({ role: 'owner' }).eq('id', teaA);
  const { data: tProf } = await admin.from('profiles').select('role').eq('id', teaA).single();
  ok(tProf.role === 'teacher', 'predavač ne može sebi da dodeli ulogu vlasnika' + (roleErr ? '' : ''));
  await A.c.from('organizations').update({ status: 'active', paid_until: '2099-01-01', plan: 'pro' }).eq('id', orgA.id);
  const { data: oAfter } = await admin.from('organizations').select('status, plan').eq('id', orgA.id).single();
  ok(oAfter.status === 'trial' && oAfter.plan === 'start', 'vlasnik ne može sam da promeni paket ili status');

  if (process.env.KEEP_FILE) {
    const fs = await import('fs');
    fs.writeFileSync(process.env.KEEP_FILE, JSON.stringify({ owner: cookieFor(A.s), teacher: cookieFor(T.s), group: g1.id, student: sts[0].id, orgs: created.orgs, users: created.users }));
  }
  if (APP) {
    console.log('Stranice aplikacije (' + APP + ')');
    const pages = { owner: ['/', '/ucenici', `/ucenici/${sts[0].id}`, '/ucenici/novi', '/ucenici/uvoz', '/grupe', `/grupe/${g1.id}`, '/grupe/nova', '/raspored', '/prisustvo', `/prisustvo/${g1.id}?datum=${today}&vreme=17:00`, '/uplate', '/izvestaji', '/podesavanja'],
      teacher: ['/', '/prisustvo', '/raspored', '/grupe', `/grupe/${g1.id}`, `/prisustvo/${g1.id}?datum=${today}&vreme=17:00`] };
    for (const [who, list] of Object.entries(pages)) {
      const ck = cookieFor((who === 'owner' ? A : T).s);
      for (const pth of list) {
        const r = await fetch(APP + pth, { headers: { cookie: ck }, redirect: 'manual' });
        const body = r.status === 200 ? await r.text() : '';
        ok(r.status === 200 && !/Application error|Internal Server Error/i.test(body), `${who} ${pth} → ${r.status}${r.headers.get('location') ? ' ' + r.headers.get('location') : ''}`);
      }
    }
    const tUpl = await fetch(APP + '/uplate', { headers: { cookie: cookieFor(T.s) }, redirect: 'manual' });
    const tBody = tUpl.status === 200 ? await tUpl.text() : '';
    // Sa streaming-om (loading.tsx) preusmerenje stiže u telu odgovora umesto kao 307.
    const redirected = [302, 303, 307].includes(tUpl.status) || /NEXT_REDIRECT|http-equiv="refresh"/.test(tBody);
    ok(redirected && !tBody.includes('Očekivano') && !tBody.includes('4.000 RSD'), 'predavač je preusmeren sa /uplate i ne vidi iznose (' + tUpl.status + ')');
    const S = await session(`${tag}-super@klasiko.test`);
    for (const pth of ['/admin', `/admin/skole/${orgA.id}`, '/admin/zahtevi']) {
      const r = await fetch(APP + pth, { headers: { cookie: cookieFor(S.s) }, redirect: 'manual' });
      ok(r.status === 200, `superadmin ${pth} → ${r.status}`);
    }
    const anon = await fetch(APP + '/ucenici', { redirect: 'manual' });
    ok(anon.status === 307 && (anon.headers.get('location') || '').includes('/login'), 'bez prijave → /login');
  }
} catch (e) {
  console.error('GREŠKA', e);
  failures++;
} finally {
  if (process.env.KEEP_FILE) { console.log('Test podaci zadržani'); process.exit(failures ? 1 : 0); }
  console.log('Brisanje test podataka');
  for (const u of created.users) await admin.auth.admin.deleteUser(u);
  if (created.orgs.length) await admin.from('organizations').delete().in('id', created.orgs);
  console.log(failures ? `\n${failures} provera nije prošlo` : '\nSve provere su prošle');
  process.exit(failures ? 1 : 0);
}
