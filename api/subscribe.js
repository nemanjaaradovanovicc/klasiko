// Vercel serverless funkcija: prima email sa forme i upisuje ga u MailerLite grupu.
// Potrebne promenljive okruženja (Vercel > Project > Settings > Environment Variables):
//   MAILERLITE_API_KEY   API ključ iz MailerLite naloga (Integrations > API)
//   MAILERLITE_GROUP_ID  ID grupe "Lista čekanja" u MailerLite-u

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Dozvoljen je samo POST zahtev.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  // Zamka za botove: pravi posetioci ne vide ovo polje.
  if (body.company) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Unesi ispravnu email adresu.' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;
  if (!apiKey) {
    console.error('MAILERLITE_API_KEY nije podešen.');
    return res.status(500).json({ error: 'Prijava trenutno ne radi. Pokušaj ponovo kasnije.' });
  }

  const payload = { email };
  if (groupId) payload.groups = [groupId];

  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (r.ok) return res.status(200).json({ ok: true });

    const details = await r.text();
    console.error('MailerLite greška', r.status, details);
    if (r.status === 422) {
      return res.status(400).json({ error: 'Ova email adresa ne može da se prijavi. Proveri da li je ispravna.' });
    }
    return res.status(502).json({ error: 'Prijava trenutno ne radi. Pokušaj ponovo za minut.' });
  } catch (err) {
    console.error('Greška pri pozivu MailerLite-a', err);
    return res.status(502).json({ error: 'Prijava trenutno ne radi. Pokušaj ponovo za minut.' });
  }
};
