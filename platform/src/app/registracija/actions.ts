'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { addDays, todayISO } from '@/lib/format';
import { KINDS, PLANS } from '@/lib/types';
import { clientIp, isThrottled, recordAttempt } from '@/lib/throttle';
import { emailEnabled, sendEmail } from '@/lib/email';
import { audit } from '@/lib/audit';
import { pendingSignup, removePendingSignup, sendConfirmationEmail, TRIAL_DAYS } from '@/lib/signup';

export type RegisterState = { error?: string } | undefined;
export type ResendState = { ok?: boolean; error?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function register(_: RegisterState, fd: FormData): Promise<RegisterState> {
  const v = (k: string) => String(fd.get(k) ?? '').trim();
  // Zamka za botove: pravi posetioci ne vide ovo polje.
  if (v('company')) redirect('/login');
  const school = v('school'), name = v('name'), phone = v('phone'), email = v('email').toLowerCase(), password = String(fd.get('password') ?? '');
  const kind = Object.hasOwn(KINDS, v('kind')) ? v('kind') : 'ostalo';
  const plan = Object.hasOwn(PLANS, v('plan')) ? v('plan') : 'rast';
  if (!school || !name || !email) return { error: 'Popuni naziv škole, ime i email.' };
  if (!EMAIL_RE.test(email)) return { error: 'Email nije ispravan.' };
  if (password.length < 8) return { error: 'Lozinka mora imati bar 8 znakova.' };
  if (fd.get('terms') !== 'on') return { error: 'Za nastavak prihvati politiku privatnosti i obradu podataka.' };

  const key = `register-ip:${await clientIp()}`;
  if (await isThrottled(key, 5, 60)) return { error: 'Previše prijava sa ove mreže. Probaj ponovo za sat vremena.' };
  await recordAttempt(key);

  // Bez naloga za mejl adresa ne može da se proveri, pa škola kreće odmah (vidi README, Rad bez mejla).
  const mustConfirm = emailEnabled();
  if (mustConfirm) await removePendingSignup(email);

  const db = createAdminClient();
  const { data: org, error: orgErr } = await db.from('organizations').insert({
    name: school, kind, phone: phone || null, email, plan, status: 'trial', source: 'self', trial_ends_at: addDays(todayISO(), TRIAL_DAYS), terms_accepted_at: new Date().toISOString(),
  }).select('id').single();
  if (orgErr || !org) return { error: 'Registracija nije uspela. Probaj ponovo.' };
  const { data: created, error: userErr } = await db.auth.admin.createUser({ email, password, email_confirm: !mustConfirm, user_metadata: { full_name: name } });
  if (userErr || !created.user) {
    await db.from('organizations').delete().eq('id', org.id);
    return { error: /already|registered|exists/i.test(userErr?.message ?? '') ? 'Nalog sa tim emailom već postoji. Prijavi se ili resetuj lozinku.' : 'Nalog nije napravljen. Probaj sa jačom lozinkom.' };
  }
  const rollback = async () => {
    await db.auth.admin.deleteUser(created.user.id);
    await db.from('organizations').delete().eq('id', org.id);
  };
  const { error: profErr } = await db.from('profiles').upsert({ id: created.user.id, org_id: org.id, role: 'owner', full_name: name, email, phone: phone || null, must_change_password: false });
  if (profErr) {
    await rollback();
    return { error: 'Registracija nije uspela. Probaj ponovo.' };
  }

  if (mustConfirm && !(await sendConfirmationEmail(email, name, school))) {
    await rollback(); // Bez mejla korisnik ne bi mogao da uđe, a adresa bi ostala zauzeta.
    return { error: 'Nismo uspeli da pošaljemo mejl za potvrdu. Proveri adresu i probaj ponovo.' };
  }
  await audit({ userId: created.user.id, email }, 'org.register', { orgId: org.id, target: school });

  if (mustConfirm) {
    const { data: st } = await db.from('platform_settings').select('email').eq('id', 1).maybeSingle();
    if (st?.email) await sendEmail({ to: st.email, subject: `Nova škola: ${school}`, text: `${school} (${KINDS[kind]}), paket ${PLANS[plan as keyof typeof PLANS].name}\n${name}, ${email}, ${phone || 'bez telefona'}\nProbni period: ${TRIAL_DAYS} dana\nEmail još nije potvrđen.` });
    redirect('/registracija/potvrda');
  }

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  redirect(signErr ? '/login' : '/');
}

// Isti odgovor bez obzira na to da li nalog postoji, da se ne bi otkrivalo ko ima nalog.
export async function resendConfirmation(_: ResendState, fd: FormData): Promise<ResendState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Unesi ispravan email.' };
  if (!emailEnabled()) return { ok: true };
  const keys = [`confirm:${email}`, `confirm-ip:${await clientIp()}`];
  if ((await isThrottled(keys[0], 3, 60)) || (await isThrottled(keys[1], 10, 60))) return { ok: true };
  await Promise.all(keys.map(recordAttempt));
  const pending = await pendingSignup(email);
  if (pending) await sendConfirmationEmail(email, pending.name, pending.school);
  return { ok: true };
}
