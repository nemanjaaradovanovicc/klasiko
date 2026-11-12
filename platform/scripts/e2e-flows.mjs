// Prolaz kroz prave tokove aplikacije preko server akcija, na lokalnoj testnoj bazi.
// 1) node scripts/local-supabase.mjs
// 2) set -a; . ./.env.test; set +a; npx next build; node --env-file=.env.test node_modules/next/dist/bin/next start -p 3100
// 3) node --env-file=.env.test scripts/e2e-flows.mjs http://localhost:3100 [server sa SUPERADMIN_MFA=on, za proveru dvostepene prijave]
import { readFileSync } from 'node:fs';

if (process.env.SMOKE_TEST_OK !== '1') { console.error('Samo za testnu bazu (SMOKE_TEST_OK=1).'); process.exit(1); }
const APP = process.argv[2] ?? 'http://localhost:3100';
const MFA_APP = process.argv[3];
const NO_EMAIL_APP = process.argv[4]; // Server pokrenut bez RESEND_API_KEY i EMAIL_FROM.
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8')).node;
const ids = new Map(Object.entries(manifest).map(([id, v]) => [v.exportedName, id]));

let failures = 0, passed = 0;
const ok = (cond, msg, extra) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const section = (s) => console.log('\n' + s);

// ---------- Baza kao servis ----------
async function rest(pathQuery, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${pathQuery}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } });
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
const emails = async () => (await fetch(`${SB}/__emails`)).json();

// Akcije bez prijave idu na svoju javnu stranicu; ostale na početnu.
const PAGES = { login: '/login', register: '/registracija', resendConfirmation: '/registracija/potvrda', requestReset: '/zaboravljena-lozinka', changePassword: '/lozinka', startEnroll: '/mfa', verifyCode: '/mfa' };

// ---------- Korisnik sa kolačićima ----------
class Browser {
  constructor(app = APP) { this.app = app; this.cookies = new Map(); }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
  }
  async get(path, redirect = 'manual') {
    const res = await fetch(this.app + path, { headers: { cookie: this.header() }, redirect });
    this.absorb(res);
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text, headers: res.headers };
  }
  // Prati preusmeravanja kao pregledač i vraća krajnju stranicu.
  async follow(path, max = 12) {
    let cur = path, hops = 0;
    for (;;) {
      const r = await this.get(cur);
      const stream = r.text.match(/NEXT_REDIRECT;[a-z]+;([^;"\\]+);/);
      const next = r.location ?? (r.status === 200 && stream ? stream[1] : null);
      if (!next) return { ...r, path: cur, hops };
      if (++hops > max) return { ...r, path: cur, hops, loop: true };
      cur = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
    }
  }
  // Poziv server akcije sa istim kodiranjem kao React: FormData kao $K, undefined kao $undefined.
  async call(name, ...args) {
    const id = ids.get(name);
    if (!id) throw new Error('Nema akcije ' + name);
    const body = new FormData();
    let n = 1;
    const encoded = args.map((a) => {
      if (a === undefined) return '$undefined';
      if (a && a.__form) {
        const k = n++;
        for (const [key, v] of Object.entries(a.__form)) for (const item of [].concat(v)) body.append(`_${k}_${key}`, String(item));
        return `$K${k}`;
      }
      return a;
    });
    body.append('0', JSON.stringify(encoded));
    const page = PAGES[name] ?? (name.includes('Absence') ? `/r/${args[0].__form.token}` : '/');
    const res = await fetch(this.app + page, { method: 'POST', headers: { 'Next-Action': id, cookie: this.header(), Accept: 'text/x-component' }, body, redirect: 'manual' });
    this.absorb(res);
    const text = await res.text();
    const redirect = res.headers.get('x-action-redirect') ?? res.headers.get('location');
    let value;
    for (const line of text.split('\n')) {
      const m = line.match(/^1:(.*)$/s);
      if (m) { try { value = JSON.parse(m[1]); } catch { value = m[1]; } }
    }
    return { status: res.status, redirect: redirect?.split(';')[0] ?? null, value, text };
  }
}
const form = (o) => ({ __form: o });
// Otvara link iz mejla za potvrdu i klikne dugme, kao pregledač.
async function confirmEmail(browser, text) {
  const hash = decodeURIComponent(text.match(/token_hash=([^\s]+)/)[1]);
  const page = await browser.get(`/auth/potvrda-mejla?token_hash=${encodeURIComponent(hash)}`);
  const act = page.text.match(/\$ACTION_ID_([0-9a-f]+)/)?.[1];
  if (!act) return { page, location: null };
  const body = new FormData();
  body.append(`$ACTION_ID_${act}`, '');
  body.append('token_hash', hash);
  const res = await fetch(`${browser.app}/auth/potvrda-mejla`, { method: 'POST', headers: { cookie: browser.header() }, body, redirect: 'manual' });
  browser.absorb(res);
  return { page, location: res.headers.get('location') };
}
const q = (s) => decodeURIComponent(String(s ?? '').replace(/\+/g, ' '));

// ---------- Tokovi ----------
await rest('auth_throttle?key=like.*', { method: 'DELETE' }); // Ranija pokretanja ne smeju da blokiraju ovo.
const tag = Date.now();
const ownerEmail = `vlasnik${tag}@klasiko.test`;
const owner = new Browser();

section('Registracija i prijava');
{
  const mailsBefore = (await emails()).length;
  const reg = { school: `Škola ${tag}`, kind: 'skola_jezika', name: 'Vesna Vlasnik', phone: '0641112222', email: ownerEmail, password: 'Sifra-12345', terms: 'on', plan: 'start' };
  const r = await owner.call('register', undefined, form(reg));
  ok(r.redirect === '/registracija/potvrda', 'posle registracije traži potvrdu emaila', r.redirect);
  const waiting = await owner.get('/registracija/potvrda');
  ok(waiting.status === 200 && waiting.text.includes('Proveri email'), 'stranica za potvrdu je javna');
  const [pending] = await rest(`organizations?email=eq.${encodeURIComponent(ownerEmail)}&select=*`);
  ok(pending.source === 'self' && pending.admin_seen_at === null, 'škola je označena kao samostalna i nova', pending);
  ok(pending.plan === 'start', 'pamti paket izabran na sajtu', pending.plan);
  const blocked = await new Browser().call('login', undefined, form({ email: ownerEmail, password: 'Sifra-12345' }));
  ok(blocked.value?.unconfirmed && !blocked.redirect, 'bez potvrde nema prijave', blocked.value);
  const inside = await owner.follow('/');
  ok(inside.path.startsWith('/login'), 'bez potvrde nema ulaska u aplikaciju', inside.path);
  const redo = await new Browser().call('register', undefined, form({ ...reg, school: `Škola ${tag}`, password: 'Sifra-12345' }));
  ok(redo.redirect === '/registracija/potvrda', 'ponovna registracija zamenjuje nepotvrđen nalog', redo);
  const after = await rest(`organizations?email=eq.${encodeURIComponent(ownerEmail)}&select=id`);
  ok(after.length === 1 && after[0].id !== pending.id, 'ostaje samo nova nepotvrđena škola', after);
  const sent = (await emails()).slice(mailsBefore).filter((m) => m.to[0] === ownerEmail);
  ok(sent.length === 2 && sent[1].subject.includes('Potvrdi email') && sent[1].reply_to === 'klasiko.rs@gmail.com', 'stiže mejl za potvrdu, a odgovori idu na podršku', sent.map((m) => [m.subject, m.reply_to]));
  const dead = await confirmEmail(new Browser(), sent[0].text);
  ok(dead.page.text.includes('Link ne važi') || !dead.location?.endsWith('/'), 'link zamenjenog naloga više ne važi', dead.location);
  const again1 = await new Browser().call('resendConfirmation', undefined, form({ email: ownerEmail }));
  const unknownResend = await new Browser().call('resendConfirmation', undefined, form({ email: `nema${tag}@klasiko.test` }));
  const allSent = (await emails()).slice(mailsBefore).filter((m) => m.to[0] === ownerEmail);
  ok(again1.value?.ok && unknownResend.value?.ok && allSent.length === 3, 'novi link stiže, a odgovor ne otkriva ko ima nalog', allSent.length);
  const conf = await confirmEmail(owner, allSent[2].text);
  ok(conf.page.status === 200 && conf.page.text.includes('Potvrdi i otvori'), 'otvaranje linka ne troši token');
  ok(conf.location === '/' || conf.location?.endsWith('/'), 'potvrda vodi u aplikaciju', conf.location);
  const used = await confirmEmail(new Browser(), allSent[2].text);
  ok(!used.location?.endsWith(`${APP}/`) && used.location !== '/', 'isti link ne radi dvaput', used.location);
  const noFromName = await new Browser().call('register', undefined, form({ school: 'Odbijena', name: 'X', email: `odbijen${tag}@klasiko.test`, password: 'Sifra-12345', terms: 'on' }));
  ok(String(noFromName.value?.error).includes('mejl za potvrdu'), 'ako mejl ne ode, javlja grešku', noFromName.value);
  const rolled = await rest(`organizations?email=eq.${encodeURIComponent(`odbijen${tag}@klasiko.test`)}&select=id`);
  ok(rolled.length === 0, 'i ne ostavlja školu bez vlasnika', rolled);
  const badPlan = await new Browser().call('register', undefined, form({ school: `Paket ${tag}`, name: 'X', email: `paket${tag}@klasiko.test`, password: 'Sifra-12345', terms: 'on', plan: 'constructor' }));
  const [badPlanOrg] = await rest(`organizations?email=eq.${encodeURIComponent(`paket${tag}@klasiko.test`)}&select=plan`);
  ok(badPlan.redirect === '/registracija/potvrda' && badPlanOrg.plan === 'rast', 'nepoznat paket postaje Rast', badPlanOrg);
  await rest('auth_throttle?key=like.*', { method: 'DELETE' });
  const dash = await owner.follow('/');
  ok(dash.status === 200 && dash.text.includes('Prvi koraci'), 'vidi prve korake', dash.path);
  const again = await new Browser().call('register', undefined, form({ school: 'Duplikat', name: 'X', email: ownerEmail, password: 'Sifra-12345', terms: 'on' }));
  ok(String(again.value?.error).includes('već postoji'), 'isti email ne može dvaput', again.value);
  const noTerms = await new Browser().call('register', undefined, form({ school: 'Bez uslova', name: 'X', email: `x${tag}@klasiko.test`, password: 'Sifra-12345' }));
  ok(String(noTerms.value?.error).includes('privatnosti'), 'mora da prihvati politiku privatnosti', noTerms.value);
  const orgs = await rest(`organizations?email=eq.${encodeURIComponent(ownerEmail)}&select=*`);
  ok(orgs.length === 1 && orgs[0].status === 'trial', 'škola je u probnom periodu');
}
const [org] = await rest(`organizations?email=eq.${encodeURIComponent(ownerEmail)}&select=*`);
const orgQ = `org_id=eq.${org.id}`;
const fail = new Browser();
{
  const anon = await new Browser().get('/uplate?mesec=2026-11');
  ok(anon.status === 307 && anon.location?.includes('next=%2Fuplate'), 'bez prijave pamti kuda je krenuo', anon.location);
  const r = await fail.call('login', undefined, form({ email: ownerEmail, password: 'Sifra-12345', next: '/uplate/dugovanja' }));
  ok(r.redirect === '/uplate/dugovanja', 'posle prijave ide tamo gde je krenuo', r.redirect);
  const evil = await new Browser().call('login', undefined, form({ email: ownerEmail, password: 'Sifra-12345', next: '//zli.example' }));
  ok(evil.redirect === '/', 'ne preusmerava na tuđ sajt', evil.redirect);
  const bad = new Browser();
  let msg;
  for (let i = 0; i < 9; i++) msg = (await bad.call('login', undefined, form({ email: `meta${tag}@klasiko.test`, password: 'pogresna' }))).value?.error;
  ok(String(msg).includes('Previše'), 'posle 8 neuspeha prijava se blokira', msg);
}

section('Grupe, učenici, limiti');
const { value: teacherCreds } = await owner.call('addTeamMember', undefined, form({ full_name: 'Petar Predavač', email: `pred${tag}@klasiko.test`, role: 'teacher' }));
ok(!!teacherCreds?.password, 'predavač je napravljen', teacherCreds);
const [teacherProfile] = await rest(`profiles?email=eq.${encodeURIComponent(`pred${tag}@klasiko.test`)}&select=id`);
const g1r = await owner.call('createGroup', form({ name: 'Engleski', teacher_id: teacherProfile.id, monthly_fee: '4000', capacity: '2', fee_type: 'monthly', weekday: '1', start_time: '17:00', end_time: '18:00' }));
const groupId = g1r.redirect?.match(/grupe\/([\w-]+)/)?.[1];
ok(!!groupId, 'grupa je napravljena', g1r.redirect);
const conflict = await owner.call('createGroup', form({ name: 'Nemački', teacher_id: teacherProfile.id, monthly_fee: '3000', fee_type: 'monthly', weekday: '1', start_time: '17:30', end_time: '18:30' }));
ok(q(conflict.redirect).includes('preklapa'), 'upozorenje kad se predavaču preklapaju termini', conflict.redirect);
const student = async (first, last, extra = {}) => {
  const r = await owner.call('createStudent', form({ first_name: first, last_name: last, joined_at: '2026-01-05', ...extra }));
  return { id: r.redirect?.match(/ucenici\/([\w-]+)/)?.[1], redirect: r.redirect };
};
const ana = await student('Ana', 'Petrović', { parent_name: 'Marija Petrović', parent_phone: '0641234567', parent_email: 'marija@klasiko.test', group_id: groupId });
const luka = await student('Luka', 'Petrović', { parent_name: 'Marija Petrović', parent_phone: '+381 64 123 4567', group_id: groupId });
const mina = await student('Mina', 'Ilić', { parent_phone: '0659998888', group_id: groupId });
ok(!!ana.id && !!luka.id && !!mina.id, 'tri učenika');
ok(mina.redirect.includes('ok=cekanje'), 'treći učenik ide na listu čekanja jer je grupa puna', mina.redirect);
ok((await rest(`group_waitlist?student_id=eq.${mina.id}`)).length === 1, 'zapis na listi čekanja postoji');
{
  const page = await owner.get(`/grupe/${groupId}`);
  ok(page.status === 200 && page.text.includes('Lista čekanja'), 'grupa prikazuje listu čekanja');
  const full = await owner.call('promoteFromWaitlist', form({ group_id: groupId, student_id: mina.id }));
  ok(q(full.redirect).includes('popunjena'), 'dok nema mesta ne može da se upiše', full.redirect);
  await owner.call('removeFromGroup', form({ student_id: luka.id, group_id: groupId, back: `/grupe/${groupId}` }));
  await owner.call('promoteFromWaitlist', form({ group_id: groupId, student_id: mina.id }));
  ok((await rest(`group_members?group_id=eq.${groupId}&student_id=eq.${mina.id}`)).length === 1, 'kad se oslobodi mesto, upisuje se');
  await rest(`groups?id=eq.${groupId}`, { method: 'PATCH', body: JSON.stringify({ capacity: 10 }) });
  await owner.call('addToGroup', form({ student_id: luka.id, group_id: groupId }));
}
{
  const search = await owner.get('/ucenici?q=petrovic');
  ok(search.text.includes('Ana') && search.text.includes('Luka') && !search.text.includes('Mina'), 'pretraga „petrovic” nalazi „Petrović”');
  const imp = await owner.call('importStudents', [
    { first_name: 'Ana', last_name: 'Petrovic', parent_phone: '064 123 4567' },
    { first_name: 'Novi', last_name: 'Učenik', parent_phone: '0601234567', birth_date: '2015-03-14', group: 'Engleski' },
    { first_name: 'Novi', last_name: 'Učenik', parent_phone: '0601234567', birth_date: '2015-03-14' },
    { first_name: 'Loš', last_name: 'Datum', birth_date: '2015-02-31' },
  ]);
  ok(imp.value?.ok === 2 && imp.value?.duplicates === 2, 'uvoz preskače učenike koji već postoje', imp.value);
  const again = await owner.call('importStudents', [{ first_name: 'Novi', last_name: 'Ucenik', parent_phone: '0601234567' }]);
  ok(again.value?.ok === 0 && again.value?.duplicates === 1, 'ponovni uvoz ne pravi duplikate', again.value);
  const all = (await owner.get('/ucenici')).text.replace(/<!-- -->/g, '');
  ok(all.includes('Petar Predavač · 4') && all.includes('Bez predavača · 1'), 'spisak učenika nudi pregled po predavaču sa brojem učenika', all.match(/(Petar Predavač|Bez predavača|Svi) · \d+/g));
  const hers = (await owner.get(`/ucenici?predavac=${teacherProfile.id}`)).text.replace(/<!-- -->/g, '');
  ok(hers.includes('Ana') && hers.includes('Mina') && !hers.includes('Loš'), 'izbor predavača prikazuje samo njegove učenike');
  const none = (await owner.get('/ucenici?predavac=bez')).text.replace(/<!-- -->/g, '');
  ok(none.includes('Loš') && !none.includes('Ana Petrović'), '„Bez predavača” prikazuje učenike van grupa');
  const bogus = (await owner.get('/ucenici?predavac=nepostojeci')).text;
  ok(bogus.includes('Ana') && bogus.includes('Loš'), 'nepoznat predavač u adresi prikazuje sve učenike');
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ plan: 'start' }) });
  const many = Array.from({ length: 60 }, (_, i) => ({ first_name: `Masa${i}`, last_name: 'Test' }));
  const over = await owner.call('importStudents', many);
  ok(String(over.value?.error).includes('do 50'), 'uvoz preko limita paketa se odbija', over.value);
  const start = await rest(`students?${orgQ}&active=eq.true&select=id`);
  await owner.call('importStudents', Array.from({ length: 50 - start.length }, (_, i) => ({ first_name: `Popuna${i}`, last_name: 'Test' })));
  const blocked = await owner.call('createStudent', form({ first_name: 'Višak', last_name: 'Test' }));
  ok(q(blocked.redirect).includes('do 50'), 'novi učenik preko limita se odbija', blocked.redirect);
  await rest(`students?${orgQ}&last_name=eq.Test`, { method: 'DELETE' });
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ plan: 'rast' }) });
}

section('Zaduženja');
const period = new Date().toISOString().slice(0, 7);
{
  const r = await owner.call('generateCharges', form({ period }));
  ok(q(r.redirect).includes('Napravljeno 4'), 'mesečna zaduženja za 4 učenika u grupi', r.redirect);
  const r2 = await owner.call('generateCharges', form({ period }));
  ok(q(r2.redirect).includes('već postoje'), 'drugi put nema novih', r2.redirect);
  await owner.call('addCharge', form({ period, student_id: ana.id, amount: '500', description: 'Knjiga' }));
  await owner.call('addCharge', form({ period, student_id: ana.id, amount: '700', description: 'Majica' }));
  ok((await rest(`charges?student_id=eq.${ana.id}&kind=eq.extra`)).length === 2, 'dva dodatna zaduženja u istom mesecu');
  const inst = await owner.call('createInstallments', form({ period, student_id: mina.id, total: '10000', count: '3', description: 'Polugodište' }));
  const rate = await rest(`charges?student_id=eq.${mina.id}&kind=eq.installment&order=period`);
  ok(rate.length === 3 && rate.reduce((a, c) => a + Number(c.amount), 0) === 10000, 'rate daju tačan zbir', inst.redirect);
  const bad = await owner.get('/uplate?mesec=2026-13');
  ok(bad.status === 200 && !bad.text.includes('Application error'), '?mesec=2026-13 ne obara stranicu');
}

section('Uparivanje izvoda');
{
  const chs = await rest(`charges?student_id=eq.${ana.id}&kind=eq.monthly&select=id,amount`);
  const row = { date: `${period}-05`, amount: 4000, payer: 'MARIJA PETROVIC', purpose: 'Ana Petrovic clanarina', reference: '' };
  const m1 = await owner.call('matchStatement', [row]);
  const res = m1.value?.results?.[0];
  ok(res?.chargeId && res?.score >= 55, 'izvod: uplata je prepoznata', m1.value);
  const applied = await owner.call('applyMatches', [{ hash: res.row.hash, total: row.amount, date: row.date, note: row.payer, allocations: res.allocations }]);
  ok(applied.value?.ok === 1, 'uplata je upisana', applied.value);
  const m2 = await owner.call('matchStatement', [row]);
  ok(m2.value?.alreadyImported === 1 && m2.value?.results?.length === 0, 'ISTI IZVOD DRUGI PUT: red se preskače, nema duple uplate', m2.value);
  const again = await owner.call('applyMatches', [{ hash: res.row.hash, total: row.amount, date: row.date, note: row.payer, allocations: res.allocations }]);
  ok(!!again.value?.error, 'ni direktan ponovni upis ne prolazi', again.value);
  const paid = await rest(`payments?student_id=eq.${ana.id}&select=amount`);
  ok(paid.length === 1 && Number(paid[0].amount) === 4000, 'u bazi je tačno jedna uplata', paid);
  ok(chs.length === 1 && Number(chs[0].amount) === 4000, 'zaduženje je netaknuto');

  const [sa] = await rest(`students?id=eq.${ana.id}&select=ref_no`);
  const big = { date: `${period}-06`, amount: 6000, payer: 'Neko', purpose: 'x', reference: `${sa.ref_no}-000000` };
  const m3 = await owner.call('matchStatement', [big]);
  const r3 = m3.value.results[0];
  ok(r3.allocations.length === 2 && r3.leftover === 4800, 'veća uplata se deli na otvorena zaduženja, ostatak je avans', r3);
  const a3 = await owner.call('applyMatches', [{ hash: r3.row.hash, total: big.amount, date: big.date, note: big.payer, allocations: r3.allocations }]);
  ok(a3.value?.ok === 1 && a3.value?.advance === 4800, 'avans je upisan', a3.value);
  const page = await owner.get(`/ucenici/${ana.id}`);
  ok(page.text.includes('Avans'), 'kartica učenika prikazuje avans');
  await owner.call('addCharge', form({ period, student_id: ana.id, amount: '1000', description: 'Takmičenje' }));
  const open = await rest(`charges?student_id=eq.${ana.id}&description=eq.Takmičenje&select=id,payments(amount)`);
  ok(Number(open[0].payments[0]?.amount) === 1000, 'avans sam pokriva novo zaduženje', open);

  const cant = await owner.call('updateCharge', form({ period, id: chs[0].id, delete: '1' }));
  ok(q(cant.redirect).includes('ima uplate'), 'zaduženje sa uplatom ne može da se obriše', cant.redirect);
  const zero = await owner.call('updateCharge', form({ period, id: open[0].id, amount: '0' }));
  ok(q(zero.redirect).includes('izmenjen') && Number((await rest(`charges?id=eq.${open[0].id}&select=amount`))[0].amount) === 0, 'iznos 0 je dozvoljen');
  const bad = await owner.call('deleteStudent', form({ id: mina.id }));
  ok(q(bad.redirect).includes('OBRIŠI') && (await rest(`students?id=eq.${mina.id}`)).length === 1, 'brisanje učenika bez potvrde se odbija');
}

section('Prisustvo i časovi');
const teacher = new Browser();
{
  await teacher.call('login', undefined, form({ email: `pred${tag}@klasiko.test`, password: teacherCreds.password }));
  const forced = await teacher.follow('/');
  ok(forced.path === '/lozinka', 'predavač mora da postavi svoju lozinku', forced.path);
  await teacher.call('changePassword', undefined, form({ password: 'Nova-sifra-1', password2: 'Nova-sifra-1' }));
  const date = `${period}-02`;
  const save = await owner.call('saveAttendance', { groupId, date, startTime: '17:00', status: 'held', note: 'Lekcija 1', marks: { [ana.id]: 'present', [luka.id]: 'absent', [mina.id]: 'excused' } });
  ok(save.value?.ok, 'vlasnik upisuje prisustvo', save.value);
  const [s1] = await rest(`sessions?group_id=eq.${groupId}&date=eq.${date}&select=teacher_id`);
  ok(s1.teacher_id === teacherProfile.id, 'čas se vodi na predavača grupe, ne na vlasnika koji je upisao', s1);
  const sub = await owner.call('saveAttendance', { groupId, date, startTime: '17:00', status: 'held', note: 'Lekcija 1', marks: {}, teacherId: null });
  ok(sub.value?.ok && (await rest(`sessions?group_id=eq.${groupId}&date=eq.${date}&select=teacher_id`))[0].teacher_id === null, 'vlasnik može da izmeni predavača na času');
  await owner.call('saveAttendance', { groupId, date, startTime: '17:00', status: 'held', note: 'Lekcija 1', marks: {}, teacherId: teacherProfile.id });
  const t = await teacher.call('saveAttendance', { groupId, date: `${period}-03`, startTime: '17:00', status: 'cancelled', note: 'bolestan', marks: {} });
  ok(t.value?.ok, 'predavač otkazuje čas', t.value);
  const [c] = await rest(`sessions?group_id=eq.${groupId}&date=eq.${period}-03&select=id`);
  const mk = await teacher.call('scheduleMakeup', form({ session_id: c.id, date: `${period}-04`, start_time: '18:00', end_time: '19:30', back: '/prisustvo' }));
  ok(mk.redirect?.includes('ok=nadoknada'), 'nadoknada je zakazana', mk.redirect);
  const rep1 = await owner.get(`/izvestaji?mesec=${period}`);
  const clean1 = rep1.text.replace(/<!-- -->/g, '');
  ok(clean1.includes('Petar Predavač') && clean1.includes('1 otkazano') && clean1.includes('1 održano'), 'zakazana nadoknada se ne broji kao otkazana', clean1.match(/\d+ (otkazano|održano)/g));
  await teacher.call('saveAttendance', { groupId, date: `${period}-04`, startTime: '18:00', status: 'held', note: 'Nadoknada', marks: { [ana.id]: 'present' } });
  const rep2 = await owner.get(`/izvestaji?mesec=${period}`);
  ok(/2 održano/.test(rep2.text.replace(/<!-- -->/g, '')) && /2,5.{0,10}h/.test(rep2.text.replace(/<!-- -->/g, '')), 'nadoknada od 90 minuta daje ukupno 2,5 sata', rep2.text.replace(/<!-- -->/g, '').match(/[\d,.]+ h/g));
  const noMoney = await teacher.follow('/uplate');
  ok(noMoney.path === '/' && !noMoney.text.includes('Očekivano'), 'predavač ne vidi uplate', noMoney.path);
}

section('Probni časovi');
{
  const clean = (t) => t.replace(/<!-- -->/g, '');
  const day = `${period}-05`;
  const add = await teacher.call('saveTrial', form({ date: day, start_time: '18:30', first_name: 'Proba', last_name: 'Kandidat', phone: '0647770001', group_id: groupId, note: 'Nivo A2' }));
  ok(add.redirect?.includes('ok=upisan'), 'predavač upisuje probni čas', add.redirect);
  const [t1] = await rest(`trial_lessons?${orgQ}&first_name=eq.Proba&select=*`);
  ok(t1?.teacher_id === teacherProfile.id && t1.outcome === 'pending' && t1.group_id === groupId, 'probni čas se vodi na predavača i čeka odluku', t1);
  const noName = await teacher.call('saveTrial', form({ date: day, first_name: ' ' }));
  ok(q(noName.redirect).includes('Unesi ime'), 'bez imena kandidata nema upisa', noName.redirect);
  const [ownerProfile] = await rest(`profiles?email=eq.${encodeURIComponent(ownerEmail)}&select=id`);
  const spoof = await teacher.call('saveTrial', form({ date: day, first_name: 'Tuđi', teacher_id: ownerProfile.id }));
  const [t2] = await rest(`trial_lessons?${orgQ}&first_name=eq.Tu%C4%91i&select=id,teacher_id`);
  ok(spoof.redirect?.includes('ok=upisan') && t2.teacher_id === teacherProfile.id, 'predavač ne može da upiše probni čas na drugoga', t2);
  const noTeacher = await owner.call('saveTrial', form({ date: day, first_name: 'Bez', last_name: 'Predavača' }));
  ok(q(noTeacher.redirect).includes('Izaberi ko je držao'), 'vlasnik mora da izabere predavača', noTeacher.redirect);
  const own = await owner.call('saveTrial', form({ date: day, first_name: 'Vlasnikov', last_name: 'Kandidat', teacher_id: ownerProfile.id }));
  const [t3] = await rest(`trial_lessons?${orgQ}&first_name=eq.Vlasnikov&select=id,teacher_id`);
  ok(own.redirect?.includes('ok=upisan') && t3.teacher_id === ownerProfile.id, 'vlasnik upisuje probni čas koji je sam držao', t3);

  const tPage = clean((await teacher.get(`/probni?mesec=${period}`)).text);
  ok(tPage.includes('Proba Kandidat') && !tPage.includes('Vlasnikov Kandidat'), 'predavač vidi samo svoje probne časove');
  const foreign = await teacher.call('setTrialOutcome', form({ id: t3.id, outcome: 'declined', back: `/probni?mesec=${period}` }));
  ok(q(foreign.redirect).includes('samo svoje') && (await rest(`trial_lessons?id=eq.${t3.id}&select=outcome`))[0].outcome === 'pending', 'predavač ne menja ishod tuđeg probnog časa', foreign.redirect);

  const yes = await teacher.call('setTrialOutcome', form({ id: t1.id, outcome: 'enrolled', back: `/probni?mesec=${period}` }));
  const no = await teacher.call('setTrialOutcome', form({ id: t2.id, outcome: 'declined', back: `/probni?mesec=${period}` }));
  ok(yes.redirect?.includes('ok=ishod') && no.redirect?.includes('ok=ishod'), 'predavač upisuje ishod', [yes.redirect, no.redirect]);
  const evil = await teacher.call('setTrialOutcome', form({ id: t1.id, outcome: 'enrolled', back: '//zli.example' }));
  ok(evil.redirect?.startsWith('/probni'), 'povratna adresa ostaje u aplikaciji', evil.redirect);
  const keep = await teacher.call('deleteTrial', form({ id: t1.id, back: '/probni' }));
  ok(q(keep.redirect).includes('samo vlasnik') && (await rest(`trial_lessons?id=eq.${t1.id}&select=id`)).length === 1, 'predavač ne briše probni čas sa upisanim ishodom', keep.redirect);
  const edit = await teacher.call('saveTrial', form({ id: t1.id, date: day, start_time: '19:00', first_name: 'Proba', last_name: 'Kandidat', phone: '0647770001', email: 'proba@klasiko.test', group_id: groupId }));
  const [t1b] = await rest(`trial_lessons?id=eq.${t1.id}&select=*`);
  ok(edit.redirect?.includes('ok=izmena') && t1b.email === 'proba@klasiko.test' && t1b.start_time.startsWith('19:00') && t1b.outcome === 'enrolled', 'izmena podataka ne dira ishod', t1b);

  const oPage = clean((await owner.get(`/probni?mesec=${period}`)).text);
  ok(oPage.includes('Proba Kandidat') && oPage.includes('Vlasnikov Kandidat') && oPage.includes('Petar Predavač') && oPage.includes('Dodaj u učenike'), 'vlasnik vidi sve probne časove i ko ih je držao');
  ok(/Probnih časova<\/div><div[^>]*>3</.test(oPage) && /Upisalo se<\/div><div[^>]*>1</.test(oPage) && /Nije se upisalo<\/div><div[^>]*>1</.test(oPage) && /Čeka odluku<\/div><div[^>]*>1</.test(oPage) && oPage.includes('50% od onih sa ishodom'), 'brojke za mesec: 3 probna, 1 upisan, 1 nije, 1 čeka', oPage.match(/(Probnih časova|Upisalo se|Nije se upisalo|Čeka odluku)<\/div><div[^>]*>\d+/g));

  const formPage = clean((await owner.get(`/ucenici/novi?probni=${t1.id}`)).text);
  ok(formPage.includes('Upis posle probnog časa') && formPage.includes('value="Proba"') && formPage.includes('value="0647770001"'), 'forma za novog učenika je popunjena iz probnog časa');
  const enroll = await owner.call('createStudent', form({ trial_id: t1.id, first_name: 'Proba', last_name: 'Kandidat', phone: '0647770001', joined_at: day }));
  const newId = enroll.redirect?.match(/ucenici\/([\w-]+)/)?.[1];
  const [t1c] = await rest(`trial_lessons?id=eq.${t1.id}&select=student_id,outcome,outcome_at`);
  ok(!!newId && t1c.student_id === newId && t1c.outcome === 'enrolled' && t1c.outcome_at === t1b.outcome_at, 'novi učenik je povezan sa probnim časom, a datum ishoda ostaje', t1c);
  ok(clean((await owner.get(`/probni?mesec=${period}`)).text).includes('Karton učenika'), 'probni čas vodi na karton učenika');
  const tLink = await teacher.call('saveTrial', form({ id: t1.id, date: day, first_name: 'Proba', last_name: 'Kandidat' }));
  ok(tLink.redirect?.includes('ok=izmena') && (await rest(`trial_lessons?id=eq.${t1.id}&select=student_id`))[0].student_id === newId, 'izmena predavača ne skida vezu sa učenikom');

  const rep = clean((await owner.get(`/izvestaji?mesec=${period}`)).text);
  ok(rep.includes('Svi probni časovi') && rep.includes('1 ukupno') && rep.includes('2 ukupno') && rep.includes('1 upisano') && rep.includes('1 nije upisano') && rep.includes('1 čeka'), 'izveštaj pokazuje probne časove po predavaču', rep.match(/\d+ (ukupno|upisano|nije upisano|čeka)/g));
  ok(!/3 održano/.test(rep), 'probni časovi ne ulaze u redovne časove predavača', rep.match(/\d+ održano/g));
  const other = clean((await owner.get(`/probni?mesec=2020-01`)).text);
  ok(other.includes('Nema probnih časova u ovom mesecu') && !other.includes('Proba Kandidat'), 'drugi mesec je prazan');

  const del = await owner.call('deleteTrial', form({ id: t2.id, back: `/probni?mesec=${period}` }));
  ok(del.redirect?.includes('ok=obrisan') && (await rest(`trial_lessons?id=eq.${t2.id}&select=id`)).length === 0, 'vlasnik briše probni čas', del.redirect);
  await rest(`students?id=eq.${newId}`, { method: 'DELETE' });
  const [t1d] = await rest(`trial_lessons?id=eq.${t1.id}&select=student_id,outcome`);
  ok(t1d.student_id === null && t1d.outcome === 'enrolled', 'brisanje učenika ne briše probni čas', t1d);
}

section('Dolasci (QR)');
{
  await owner.call('generateCards');
  const [{ checkin_code: code }] = await rest(`students?id=eq.${ana.id}&select=checkin_code`);
  const first = await owner.call('checkinByCode', code, null);
  ok(first.value?.ok && first.value.kind === 'in', 'prvo skeniranje je dolazak', first.value);
  const twice = await owner.call('checkinByCode', code, 'Tata');
  ok(!twice.value?.ok && String(twice.value?.error).includes('2 minuta'), 'slučajno drugo skeniranje se ne upisuje kao odlazak', twice.value);
  const undo = await owner.call('undoCheckin', first.value.id);
  ok(undo.value?.ok && (await rest(`checkins?student_id=eq.${ana.id}`)).length === 0, 'upis može da se poništi', undo.value);
  const page = await teacher.get('/dolasci');
  ok(page.status === 200, 'predavač otvara dolaske');
  const m = await teacher.call('checkinManual', ana.id, 'in', null);
  const u = await teacher.call('undoCheckin', m.value.id);
  ok(u.value?.ok, 'predavač poništava svoj upis', u.value);
  const out = await owner.call('checkinManual', ana.id, 'out', 'Mama');
  ok(out.value?.ok && (await rest(`checkins?id=eq.${out.value.id}&select=picked_up_by`))[0].picked_up_by === 'Mama', 'odlazak beleži ko je preuzeo dete');
}

section('Porodice i link za roditelje');
let token;
{
  const school = await owner.call('updateSchool', form({ name: `Škola ${tag}`, bank_account: '160-5100000000-99', payee_name: 'Škola doo', fee_due_day: '10' }));
  ok(school.redirect?.includes('ok=1'), 'škola upisuje račun za uplate', school.redirect);
  const page = await owner.get('/roditelji');
  ok(page.text.includes('Moguće porodice'), 'predlaže porodicu za isti telefon u različitom zapisu');
  await owner.call('linkAllSuggestedFamilies');
  const [a] = await rest(`students?id=eq.${ana.id}&select=family_id`);
  const [l] = await rest(`students?id=eq.${luka.id}&select=family_id`);
  ok(a.family_id && a.family_id === l.family_id, 'Ana i Luka su porodica');
  await owner.call('createAllParentLinks');
  const links = await rest(`parent_links?${orgQ}&revoked=eq.false&select=token,student_id`);
  ok(links.filter((x) => [ana.id, luka.id].includes(x.student_id)).length === 1, 'porodica dobija jedan link', links);
  token = links.find((x) => [ana.id, luka.id].includes(x.student_id)).token;
  const parent = new Browser();
  const r = await parent.get(`/r/${token}`);
  ok(r.status === 200 && r.text.includes('Ana') && r.text.includes('Luka'), 'roditelj bez prijave vidi oba deteta', r.status);
  ok(r.text.includes('Javi izostanak'), 'može da javi izostanak');
  const bad = await parent.get(`/r/${token}?mesec=2026-13`);
  ok(bad.status === 200, 'pogrešan mesec ne obara stranicu');
  const old = await rest(`charges`, { method: 'POST', body: JSON.stringify({ org_id: org.id, student_id: luka.id, period: '2023-01', amount: 111, kind: 'extra', description: 'Stari dug', due_date: '2023-01-10' }) });
  for (let i = 1; i <= 14; i++) await rest('charges', { method: 'POST', body: JSON.stringify({ org_id: org.id, student_id: luka.id, period: `2024-${String(Math.min(i, 12)).padStart(2, '0')}`, amount: 1, kind: 'extra', description: `Mali ${i}` }) });
  const debt = await parent.get(`/r/${token}`);
  ok(debt.text.includes('Stari dug'), 'stari dug se vidi i kad ima više od 12 zaduženja', old?.[0]?.id);
  ok(debt.text.includes('Plati sve jednom uplatom'), 'jedan QR za ceo dug');
  const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const abs = await parent.call('reportAbsence', form({ token, student_id: luka.id, date: today, note: 'prehlada' }));
  ok(abs.redirect?.includes('javljeno=1'), 'izostanak je javljen', abs.redirect);
  const foreign = await parent.call('reportAbsence', form({ token, student_id: mina.id, date: today }));
  ok(foreign.redirect?.includes('greska=datum') && (await rest(`absence_notices?student_id=eq.${mina.id}`)).length === 0, 'ne može da javi izostanak tuđeg deteta', foreign.redirect);
  const late = await parent.call('reportAbsence', form({ token, student_id: luka.id, date: '2020-01-01' }));
  ok(late.redirect?.includes('greska=datum'), 'datum u prošlosti se odbija', late.redirect);
  const dash = await owner.get('/');
  ok(dash.text.includes('Roditelji su javili izostanak') && dash.text.includes('prehlada'), 'vlasnik vidi javljen izostanak na početnoj');
  const take = await teacher.get(`/prisustvo/${groupId}?datum=${today}&vreme=17:00`);
  ok(take.status === 200 && take.text.includes('Roditelj javio izostanak'), 'predavač vidi javljen izostanak pri upisu');
  const nf = await parent.get('/r/nepostojeci-token-1234567890123');
  ok(nf.status === 404 || nf.text.includes('više ne važi'), 'nepostojeći link ne radi');
  await rest(`parent_links?token=eq.${token}`, { method: 'PATCH', body: JSON.stringify({ expires_at: '2020-01-01T00:00:00Z' }) });
  const exp = await parent.get(`/r/${token}`);
  ok(exp.status === 404 || exp.text.includes('više ne važi'), 'istekao link ne radi', exp.status);
  await rest(`parent_links?token=eq.${token}`, { method: 'PATCH', body: JSON.stringify({ expires_at: '2030-01-01T00:00:00Z' }) });
  await parent.get(`/r/${token}`);
  const [seen] = await rest(`parent_links?token=eq.${token}&select=last_seen_at,expires_at`);
  ok(seen.last_seen_at && seen.expires_at < '2029', 'otvaranje linka pomera rok na godinu dana od danas', seen);
}

section('Ko duguje, obaveštenja, paketi');
{
  const d = await owner.get('/uplate/dugovanja');
  ok(d.status === 200 && d.text.includes('Ukupan dug') && d.text.includes('Stari dug'), 'ekran „Ko duguje” prikazuje stari dug');
  const old = await owner.get('/uplate/dugovanja?prikaz=stari');
  ok(old.status === 200 && !old.text.includes('Mina Ilić'), 'filter „samo stari dug”');
  const log = await owner.call('logWhatsappReminder', [ana.id, luka.id]);
  ok(log.value?.ok && (await rest(`reminders?student_id=eq.${ana.id}`)).length === 1, 'podsetnik je zabeležen', log.value);
  const before = (await emails()).length;
  const mail = await owner.call('emailAllDebtors');
  const mails = (await emails()).slice(before);
  ok(mail.value?.sent >= 1 && mails.some((m) => m.to[0] === 'marija@klasiko.test' && m.text.includes('Luka') && m.text.includes(`/r/${token}`)) && mails.filter((m) => m.to[0] === 'marija@klasiko.test').length === 1, 'email ide jednom po porodici, na kontakt i link brata ili sestre', mail.value);
  const ann = await owner.call('createAnnouncement', form({ title: 'Ne radimo u petak', body: 'Praznik', send_email: 'on' }));
  ok(q(ann.redirect).includes('objavljeno'), 'obaveštenje je objavljeno', ann.redirect);
  const parent = await new Browser().get(`/r/${token}`);
  ok(parent.text.includes('Ne radimo u petak'), 'roditelj vidi obaveštenje');
  const tAnn = await teacher.call('createAnnouncement', form({ title: 'Svima bez grupe' }));
  ok(q(tAnn.redirect).includes('Izaberi grupu'), 'predavač ne može da objavi svima', tAnn.redirect);
  const tOk = await teacher.call('createAnnouncement', form({ title: 'Domaći za Engleski', group_id: groupId }));
  ok(q(tOk.redirect).includes('objavljeno'), 'predavač objavljuje svojoj grupi', tOk.redirect);

  const pg = await owner.call('createGroup', form({ name: 'Ples paket', monthly_fee: '8000', fee_type: 'package', package_classes: '8' }));
  const pgId = pg.redirect.match(/grupe\/([\w-]+)/)[1];
  const charged = await owner.call('generateCharges', form({ period }));
  await owner.call('addToGroup', form({ student_id: mina.id, group_id: pgId }));
  const buy = await owner.call('buyPackage', form({ student_id: mina.id, group_id: pgId, classes: '8', price: '8000' }));
  ok(buy.redirect?.includes('ok=paket'), 'paket je prodat', buy.redirect);
  const again = await owner.call('buyPackage', form({ student_id: mina.id, group_id: pgId, classes: '2', price: '1000' }));
  ok(again.redirect?.includes('ok=paket'), 'drugi paket istog meseca', again.redirect);
  const today = new Date().toISOString().slice(0, 10);
  await owner.call('saveAttendance', { groupId: pgId, date: today, startTime: '10:00', status: 'held', note: '', marks: { [mina.id]: 'present' } });
  const page = await owner.get(`/ucenici/${mina.id}`);
  ok(page.status === 200 && page.text.replace(/<!-- -->/g, '').includes('ostalo 9 od 10'), 'paket: posle jednog časa ostaje 9 od 10', page.text.replace(/<!-- -->/g, '').match(/ostalo \d+ od \d+/));
  const noMonthly = await owner.call('generateCharges', form({ period }));
  ok((await rest(`charges?student_id=eq.${mina.id}&group_id=eq.${pgId}&kind=eq.monthly`)).length === 0, 'grupa sa paketima ne dobija mesečnu članarinu', [charged.redirect, noMonthly.redirect]);
}

section('Izvoz i dnevnik');
{
  const all = await owner.get('/podesavanja/izvoz');
  const data = JSON.parse(all.text);
  ok(all.headers.get('content-disposition')?.includes('attachment') && data.students.length >= 3 && data.payments.length >= 1, 'izvoz svih podataka škole');
  ok(!all.text.includes('Sara') && data.students.every((s) => s.org_id === org.id), 'izvoz sadrži samo ovu školu');
  const one = await owner.get(`/ucenici/${ana.id}/izvoz`);
  ok(JSON.parse(one.text).ucenik.id === ana.id, 'izvoz jednog učenika');
  const log = await rest(`audit_log?org_id=eq.${org.id}&select=action`);
  ok(log.some((l) => l.action === 'org.export') && log.some((l) => l.action === 'org.register'), 'dnevnik beleži radnje', log);
  const settings = await owner.get('/podesavanja');
  ok(settings.text.includes('Izvezeni svi podaci škole'), 'vlasnik vidi dnevnik u podešavanjima');
  const delOk = await owner.call('deleteStudent', form({ id: mina.id, confirm: 'OBRIŠI' }));
  ok(delOk.redirect?.includes('ok=obrisan') && (await rest(`audit_log?action=eq.student.delete&org_id=eq.${org.id}`)).length === 1, 'potvrđeno brisanje radi i ostaje u dnevniku', delOk.redirect);
}

section('Automatska naplata (cron)');
{
  const denied = await fetch(`${APP}/api/cron/dnevno`);
  ok(denied.status === 401, 'bez tajnog ključa nema pristupa', denied.status);
  const wrong = await fetch(`${APP}/api/cron/dnevno`, { headers: { Authorization: 'Bearer pogresan' } });
  ok(wrong.status === 401, 'pogrešan ključ nema pristupa');
  const auto = await owner.call('updateAutomation', form({ auto_charges: 'on', auto_charge_day: '1', auto_reminders: 'on', reminder_days_before: '14', sibling_discount_pct: '10' }));
  ok(auto.redirect?.includes('ok=auto'), 'škola uključuje automatsku naplatu', auto.redirect);
  // Novi učenik i novi mesec: zaduženja se prave sama. Ovaj mesec je već „obrađen” samo ako je cron već radio.
  const z = await student('Zoran', 'Automatski', { parent_email: 'zoran@klasiko.test', group_id: groupId });
  const cron = () => fetch(`${APP}/api/cron/dnevno`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  const before = (await emails()).length;
  const run1 = await cron();
  ok(run1.errors.length === 0, 'dnevni posao radi bez greške', run1);
  const zc = await rest(`charges?student_id=eq.${z.id}&kind=eq.monthly&select=id,amount,due_date`);
  ok(zc.length === 1, 'novi učenik je automatski zadužen', zc);
  const sent1 = (await emails()).slice(before);
  const zoranDue = zc[0]?.due_date;
  const todayIso = new Date().toISOString().slice(0, 10);
  if (zoranDue >= todayIso) ok(sent1.some((m) => m.to[0] === 'zoran@klasiko.test'), 'podsetnik je poslat pre roka', sent1.map((m) => m.to));
  else ok(true, `rok ${zoranDue} je prošao, podsetnik pre roka ne važi danas`);
  const count1 = (await emails()).length;
  await rest(`charges?id=eq.${zc[0].id}`, { method: 'DELETE' });
  const run2 = await cron();
  ok(run2.charges === 0, 'drugo pokretanje istog meseca ne pravi ništa, ni obrisano zaduženje', run2);
  ok((await emails()).length === count1, 'drugo pokretanje ne šalje iste podsetnike ponovo', (await emails()).length - count1);
  const expired = await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) });
  const run3 = await cron();
  ok(run3.errors.length === 0, 'pauzirana škola se preskače', expired?.[0]?.status);
  const blocked = await owner.follow('/');
  ok(blocked.path === '/pretplata', 'pauzirana škola vidi stranicu za pretplatu', blocked.path);
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'trial' }) });
}

section('Popust za braću i sestre');
{
  const next = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)).toISOString().slice(0, 7);
  await owner.call('generateCharges', form({ period: next }));
  const rows = await rest(`charges?period=eq.${next}&group_id=eq.${groupId}&select=student_id,amount`);
  const by = Object.fromEntries(rows.map((r) => [r.student_id, Number(r.amount)]));
  ok(by[ana.id] === 4000 && by[luka.id] === 3600, 'prvo dete punu cenu, drugo 10% manje', by);
}

section('Reset lozinke');
{
  const before = (await emails()).length;
  const reset = await new Browser().call('requestReset', undefined, form({ email: ownerEmail }));
  ok(reset.value?.ok, 'zahtev za reset', reset.value);
  const unknown = await new Browser().call('requestReset', undefined, form({ email: `nema${tag}@klasiko.test` }));
  ok(unknown.value?.ok, 'isti odgovor i za nepostojeći nalog', unknown.value);
  const mails = (await emails()).slice(before);
  ok(mails.length === 1 && mails[0].to[0] === ownerEmail, 'mejl ide samo postojećem nalogu', mails.length);
  const hash = decodeURIComponent(mails[0].text.match(/token_hash=([^\s]+)/)[1]);
  const b = new Browser();
  const page = await b.get(`/auth/potvrda?token_hash=${encodeURIComponent(hash)}`);
  ok(page.status === 200 && page.text.includes('Nastavi'), 'otvaranje linka ne troši token');
  const conf = await b.get('/auth/potvrda');
  ok(conf.text.includes('Link ne važi'), 'stranica bez tokena javlja da link ne važi');
  const act = page.text.match(/\$ACTION_ID_([0-9a-f]+)/)?.[1];
  const body = new FormData();
  body.append(`$ACTION_ID_${act}`, '');
  body.append('token_hash', hash);
  const res = await fetch(`${APP}/auth/potvrda`, { method: 'POST', body, redirect: 'manual' });
  b.absorb(res);
  ok(res.headers.get('location')?.includes('/lozinka'), 'potvrda vodi na novu lozinku', res.status);
  const change = await b.call('changePassword', undefined, form({ password: 'Sasvim-nova-1', password2: 'Sasvim-nova-1' }));
  ok(change.redirect?.includes('ok=lozinka'), 'nova lozinka je postavljena', change.redirect);
  const login = await new Browser().call('login', undefined, form({ email: ownerEmail, password: 'Sasvim-nova-1' }));
  ok(login.redirect === '/', 'prijava novom lozinkom radi', login.redirect);
}

section('Beskonačno preusmeravanje');
{
  await rest(`profiles?id=eq.${teacherProfile.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  const r = await teacher.follow('/');
  ok(!r.loop && r.path.startsWith('/login?greska=nalog') && r.text.includes('deaktiviran'), 'deaktiviran nalog vidi poruku umesto petlje', { path: r.path, hops: r.hops, loop: r.loop });
  await rest(`profiles?id=eq.${teacherProfile.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
}

section('Naplata pretplate');
{
  const sup = new Browser();
  const email = `admin${tag}@klasiko.test`;
  const uRes = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Admin-sifra-1', email_confirm: true }) });
  const admin = await uRes.json();
  await rest('profiles', { method: 'POST', body: JSON.stringify({ id: admin.id, role: 'superadmin', full_name: 'Admin', email, must_change_password: false }) });
  await sup.call('login', undefined, form({ email, password: 'Admin-sifra-1' }));
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', paid_until: '2030-01-01', billing: 'monthly', plan: 'rast' }) });
  const back = `/admin/skole/${org.id}`;
  const p1 = await sup.call('recordSubscriptionPayment', form({ org_id: org.id, amount: '5990', paid_at: '2026-01-01', extend: 'month', back }));
  ok(p1.redirect?.includes('ok=uplata'), 'uplata pretplate', p1.redirect);
  const [o1] = await rest(`organizations?id=eq.${org.id}&select=paid_until`);
  ok(o1.paid_until === '2030-02-01', 'pretplata je produžena za mesec', o1);
  const twice = await sup.call('recordSubscriptionPayment', form({ org_id: org.id, amount: '5990', paid_at: '2026-01-01', extend: 'month', back }));
  const [o2] = await rest(`organizations?id=eq.${org.id}&select=paid_until`);
  ok(q(twice.redirect).includes('2 minuta') && o2.paid_until === '2030-02-01', 'dvostruki klik ne produžava dvaput', twice.redirect);
  const [pay] = await rest(`subscription_payments?org_id=eq.${org.id}&select=id`);
  await sup.call('deleteSubscriptionPayment', form({ org_id: org.id, id: pay.id }));
  const [o3] = await rest(`organizations?id=eq.${org.id}&select=paid_until`);
  ok(o3.paid_until === '2030-01-01', 'brisanje uplate vraća „plaćeno do”', o3);
  const enter = await sup.call('enterOrg', form({ org_id: org.id }));
  ok(enter.redirect === '/', 'admin ulazi u školu', enter.redirect);
  const log = await rest(`audit_log?org_id=eq.${org.id}&action=eq.admin.enter_org`);
  ok(log.length === 1, 'ulazak admina je u dnevniku školi');
  const d = await sup.follow('/admin/dnevnik');
  ok(d.status === 200 && d.text.includes('ušao u školu'), 'admin vidi dnevnik', d.path);
  await sup.call('exitOrg');
  const list = await sup.follow('/admin');
  ok(list.status === 200 && list.text.includes(ownerEmail) && list.text.includes('Sama se registrovala') && list.text.includes('Poslednja prijava'), 'admin u listi vidi vlasnika, poreklo i prijavu', list.path);
  ok(list.text.includes('Email nije potvrđen'), 'admin vidi nepotvrđen nalog');
  const fresh = await sup.follow('/admin?filter=nove');
  const unseen = await rest(`organizations?admin_seen_at=is.null&id=neq.${org.id}&select=name`);
  ok(fresh.text.includes('Novo') && unseen.every((o) => fresh.text.includes(o.name)), 'filter Nove prikazuje nove škole', unseen.length);
  const onlyAdmin = await sup.follow('/admin?filter=admin');
  ok(!onlyAdmin.text.includes(ownerEmail), 'filter po poreklu sklanja samostalne škole');
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ admin_seen_at: null }) });
  await sup.follow(`/admin/skole/${org.id}`);
  const [seen] = await rest(`organizations?id=eq.${org.id}&select=admin_seen_at`);
  ok(seen.admin_seen_at !== null, 'otvaranje škole skida oznaku Novo', seen);
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'trial' }) });
}

section('Podsetnik da probni period ističe');
{
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const cron = () => fetch(`${APP}/api/cron/dnevno`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  await rest(`organizations?id=neq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ trial_ends_at: iso(30) }) });
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'trial', trial_ends_at: iso(2), trial_reminder_key: null }) });
  const [{ email: ownerMail }] = await rest(`profiles?org_id=eq.${org.id}&role=eq.owner&select=email&limit=1`);
  const n0 = (await emails()).length;
  const c1 = await cron();
  const m1 = (await emails()).slice(n0).filter((m) => m.subject.includes('Probni period'));
  ok(c1.trialReminders === 1 && m1.length === 1 && m1[0].to[0] === ownerMail && m1[0].subject.includes('za 2 dana'), 'vlasnik dobija podsetnik pre isteka', [c1, m1.map((m) => m.subject)]);
  const c2 = await cron();
  ok(c2.trialReminders === 0, 'drugo pokretanje ne šalje isti podsetnik', c2);
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ trial_ends_at: iso(3) }) });
  ok((await cron()).trialReminders === 1, 'produžen probni period dobija nov podsetnik');
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ trial_ends_at: iso(-1) }) });
  const n1 = (await emails()).length;
  ok((await cron()).trialReminders === 1 && (await emails()).slice(n1).some((m) => m.subject.includes('je istekao')), 'posle isteka stiže poruka da su podaci sačuvani');
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ trial_ends_at: iso(-20), trial_reminder_key: null }) });
  ok((await cron()).trialReminders === 0, 'davno istekli se ne javljaju');
  const [pendingOrg] = await rest(`organizations?email=eq.${encodeURIComponent(`paket${tag}@klasiko.test`)}&select=id`);
  await rest(`organizations?id=eq.${pendingOrg.id}`, { method: 'PATCH', body: JSON.stringify({ trial_ends_at: iso(1) }) });
  ok((await cron()).trialReminders === 0, 'nepotvrđena adresa ne dobija podsetnik');
  const [pendingOwner] = await rest(`profiles?org_id=eq.${pendingOrg.id}&select=id`);
  await fetch(`${SB}/auth/v1/admin/users/${pendingOwner.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email_confirm: true }) });
  await rest(`organizations?id=eq.${org.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', paid_until: '2030-01-01', trial_ends_at: iso(30) }) });
}

if (MFA_APP) {
  section('Dvostepena prijava za admina');
  const email = `mfa${tag}@klasiko.test`;
  const uRes = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Admin-sifra-1', email_confirm: true }) });
  const admin = await uRes.json();
  await rest('profiles', { method: 'POST', body: JSON.stringify({ id: admin.id, role: 'superadmin', full_name: 'Admin', email, must_change_password: false }) });
  const sup = new Browser(MFA_APP);
  await sup.call('login', undefined, form({ email, password: 'Admin-sifra-1' }));
  const blocked = await sup.follow('/admin');
  ok(blocked.path === '/mfa' && blocked.text.includes('Podesi dvostepenu'), 'admin bez koda ne ulazi u /admin', blocked.path);
  const start = await sup.call('startEnroll');
  ok(!!start.value?.factorId && !!start.value?.secret, 'pokretanje podešavanja', start.value);
  const wrong = await sup.call('verifyCode', undefined, form({ factor_id: start.value.factorId, code: '000000' }));
  ok(String(wrong.value?.error).includes('nije tačan'), 'pogrešan kod se odbija', wrong.value);
  const right = await sup.call('verifyCode', undefined, form({ factor_id: start.value.factorId, code: '123456' }));
  ok(right.redirect === '/admin', 'tačan kod otključava', right.redirect);
  const inside = await sup.follow('/admin');
  ok(inside.path === '/admin' && inside.status === 200, 'admin je unutra', inside.path);
  const fresh = new Browser(MFA_APP);
  await fresh.call('login', undefined, form({ email, password: 'Admin-sifra-1' }));
  const again = await fresh.follow('/admin');
  ok(again.path === '/mfa' && !again.text.includes('Podesi dvostepenu'), 'sledeća prijava traži samo kod', again.path);
  const ownerOnMfa = new Browser(MFA_APP);
  await ownerOnMfa.call('login', undefined, form({ email: ownerEmail, password: 'Sasvim-nova-1' }));
  const ownerDash = await ownerOnMfa.follow('/');
  ok(ownerDash.path === '/' && ownerDash.status === 200, 'vlasniku škole se ne traži kod', ownerDash.path);
}

if (NO_EMAIL_APP) {
  section('Rad bez naloga za mejl');
  const count = (await emails()).length;
  const b = new Browser(NO_EMAIL_APP);
  const login = await b.get('/login');
  ok(login.text.includes('wa.me/381638219713') && !login.text.includes('href="/zaboravljena-lozinka"'), 'prijava upućuje na WhatsApp, kao do sada');
  const forgot = await b.get('/zaboravljena-lozinka');
  ok(forgot.status === 200 && forgot.text.includes('Piši podršci na WhatsApp') && !forgot.text.includes('Pošalji link'), 'stranica za lozinku nema formu za mejl');
  const direct = await b.call('requestReset', undefined, form({ email: ownerEmail }));
  ok(String(direct.value?.error).includes('WhatsApp'), 'direktan zahtev za reset vraća uputstvo', direct.value);
  const email = `bezmejla${tag}@klasiko.test`;
  const reg = await b.call('register', undefined, form({ school: `Bez mejla ${tag}`, kind: 'vrtic', name: 'Bojan Bezmejla', email, password: 'Sifra-12345', terms: 'on' }));
  ok(reg.redirect === '/', 'registracija radi', reg);
  const settings = await b.get('/podesavanja');
  ok(settings.status === 200 && !settings.text.includes('auto_reminders') && settings.text.includes('Podsetnike šalješ na WhatsApp'), 'podešavanja ne nude podsetnike mejlom');
  const ann = await b.get('/obavestenja');
  ok(ann.status === 200 && !ann.text.includes('send_email'), 'obaveštenja ne nude slanje mejlom');
  const sent = await b.call('createAnnouncement', form({ title: 'Bez mejla', send_email: 'on' }));
  ok(q(sent.redirect).includes('objavljeno'), 'obaveštenje se objavljuje i bez mejla', sent.redirect);
  const g = await b.call('createGroup', form({ name: 'Mala grupa', monthly_fee: '1000', fee_type: 'monthly' }));
  const gid = g.redirect.match(/grupe\/([\w-]+)/)[1];
  await b.call('createStudent', form({ first_name: 'Duž', last_name: 'Nik', parent_phone: '0641239999', group_id: gid, joined_at: '2026-01-05' }));
  await b.call('generateCharges', form({ period }));
  const debts = await b.get('/uplate/dugovanja');
  ok(debts.status === 200 && debts.text.includes('WhatsApp') && !debts.text.includes('Pošalji email'), '„Ko duguje” nudi samo WhatsApp');
  const none = await b.call('emailAllDebtors');
  ok(String(none.value?.error).includes('nije podešeno'), 'direktan poziv za mejlove se odbija', none.value);
  const cronRes = await fetch(`${NO_EMAIL_APP}/api/cron/dnevno`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  ok(cronRes.errors.length === 0 && cronRes.emails === 0, 'dnevni posao radi i ne šalje mejlove', cronRes);
  ok((await emails()).length === count, 'nijedan mejl nije poslat');
}

console.log(`\nProšlo: ${passed}, palo: ${failures}`);
process.exit(failures ? 1 : 0);
