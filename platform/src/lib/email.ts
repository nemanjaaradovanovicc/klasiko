import 'server-only';

// Adresa pošiljaoca ne prima poštu, pa odgovori bez adrese škole idu na podršku.
const SUPPORT_EMAIL = 'klasiko.rs@gmail.com';

// Slanje emaila preko Resend-a. Bez RESEND_API_KEY sve radi, ali se mejlovi ne šalju.
export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(opts: { to: string; subject: string; text: string; replyTo?: string | null }): Promise<{ ok: boolean; error?: string }> {
  if (!emailEnabled()) return { ok: false, error: 'Email nije podešen.' };
  try {
    const r = await fetch(`${process.env.RESEND_API_URL ?? 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [opts.to], subject: opts.subject, text: opts.text, reply_to: opts.replyTo || SUPPORT_EMAIL }),
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Slanje nije uspelo.' };
  }
}
