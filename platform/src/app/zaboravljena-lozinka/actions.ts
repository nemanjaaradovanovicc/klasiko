'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { emailEnabled, sendEmail } from '@/lib/email';
import { clientIp, isThrottled, recordAttempt } from '@/lib/throttle';
import { APP_URL } from '@/lib/parent';

export type ResetState = { ok?: boolean; error?: string } | undefined;

// Isti odgovor bez obzira na to da li nalog postoji, da se ne bi otkrivalo ko ima nalog.
export async function requestReset(_: ResetState, fd: FormData): Promise<ResetState> {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Unesi ispravan email.' };
  if (!emailEnabled()) return { error: 'Javi se vlasniku škole ili podršci na WhatsApp i dobićeš novu lozinku.' };
  const keys = [`reset:${email}`, `reset-ip:${await clientIp()}`];
  if ((await isThrottled(keys[0], 3, 60)) || (await isThrottled(keys[1], 10, 60))) return { ok: true };
  await Promise.all(keys.map(recordAttempt));
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email });
  const hash = data?.properties?.hashed_token;
  if (!error && hash) {
    const res = await sendEmail({
      to: email,
      subject: 'Promena lozinke za Klasiko',
      text: `Dobar dan!\n\nZatražena je promena lozinke za tvoj Klasiko nalog. Otvori ovaj link i postavi novu lozinku:\n\n${APP_URL}/auth/potvrda?token_hash=${encodeURIComponent(hash)}\n\nAko nisi ti tražio/la promenu, zanemari ovaj mejl. Lozinka ostaje ista.\n\nKlasiko`,
    });
    if (!res.ok) console.error('Mejl za reset nije poslat', res.error);
  }
  return { ok: true };
}
