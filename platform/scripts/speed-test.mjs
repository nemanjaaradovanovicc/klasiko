// Meri vreme učitavanja stranica za prijavljenog vlasnika (privremeni nalog, posle se briše).
// node --env-file=.env.local scripts/speed-test.mjs https://app.klasiko.rs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.argv[2];
const ref = new globalThis.URL(URL).hostname.split('.')[0];
const email = `speed${Date.now()}@klasiko.test`;
const pass = 'Speed-' + Math.random().toString(36).slice(2, 12) + 'A1';
let org, uid;
try {
  ({ data: org } = await admin.from('organizations').insert({ name: 'Speed test' }).select().single());
  const { data } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  uid = data.user.id;
  await admin.from('profiles').insert({ id: uid, org_id: org.id, role: 'owner', full_name: 'Speed', email, must_change_password: false });
  const c = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password: pass });
  const cookie = `sb-${ref}-auth-token=base64-` + Buffer.from(JSON.stringify(s.session)).toString('base64url');
  for (const p of ['/', '/ucenici', '/uplate', '/prisustvo', '/podesavanja']) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const r = await fetch(APP + p, { headers: { cookie }, redirect: 'manual' });
      await r.text();
      times.push(Math.round(performance.now() - t));
      if (i === 0 && r.status !== 200) console.log(p, 'status', r.status);
    }
    console.log(p.padEnd(14), times.join(' ms, ') + ' ms', '| region', (await fetch(APP + p, { headers: { cookie }, redirect: 'manual' })).headers.get('x-vercel-id')?.split('::').slice(0, 2).join('→'));
  }
} finally {
  if (uid) await admin.auth.admin.deleteUser(uid);
  if (org) await admin.from('organizations').delete().eq('id', org.id);
}
