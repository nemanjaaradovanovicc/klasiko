// Vercel serverless funkcija: prima zahtev za demo sa sajta i upisuje ga u Supabase (admin panel aplikacije).
// Promenljive okruženja: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const KINDS = ['skola_jezika', 'plesna_skola', 'borilacke', 'sportski_klub', 'edukativni_centar', 'muzicka_skola', 'vrtic', 'ostalo'];

function clip(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max) || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Dozvoljen je samo POST zahtev.' });
  }
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  // Zamka za botove
  if (body.company) return res.status(200).json({ ok: true });

  const name = clip(body.name, 120);
  const phone = clip(body.phone, 40);
  const email = clip(body.email, 200);
  if (!name) return res.status(400).json({ error: 'Unesi ime.' });
  if (!phone || phone.replace(/\D/g, '').length < 6) return res.status(400).json({ error: 'Unesi broj telefona.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Email adresa nije ispravna.' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY nije podešen.');
    return res.status(500).json({ error: 'Slanje trenutno ne radi. Pozovi nas ili piši na WhatsApp.' });
  }
  const plan = clip(body.plan, 20);
  const message = [clip(body.message, 2000), plan ? `Paket: ${plan}` : null].filter(Boolean).join('\n') || null;
  const row = {
    name,
    phone,
    email,
    school: clip(body.school, 160),
    kind: KINDS.includes(body.kind) ? body.kind : null,
    students_count: clip(body.students_count, 40),
    preferred_time: clip(body.preferred_time, 200),
    message,
    source: clip(body.source, 120),
  };
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/demo_requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (r.ok) return res.status(200).json({ ok: true });
    console.error('Supabase greška', r.status, await r.text());
    return res.status(502).json({ error: 'Slanje nije uspelo. Pozovi nas ili piši na WhatsApp.' });
  } catch (err) {
    console.error('Greška pri upisu zahteva', err);
    return res.status(502).json({ error: 'Slanje nije uspelo. Pozovi nas ili piši na WhatsApp.' });
  }
};
