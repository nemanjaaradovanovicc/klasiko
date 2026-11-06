'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { clearAttempts, clientIp, isThrottled, recordAttempt } from '@/lib/throttle';
import { isPendingUser } from '@/lib/signup';

function safeNext(v: FormDataEntryValue | null): string {
  const n = String(v ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export async function login(_: { error?: string; unconfirmed?: boolean } | undefined, formData: FormData): Promise<{ error?: string; unconfirmed?: boolean } | undefined> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (!email || !password) return { error: 'Unesi email i lozinku.' };
  // Prijava ide preko servera, pa Supabase vidi IP servera. Zato pokušaje brojimo ovde, po nalogu i po IP adresi.
  const ip = await clientIp();
  const byEmail = `login:${email}`, byIp = `login-ip:${ip}`;
  if ((await isThrottled(byEmail, 8, 15)) || (await isThrottled(byIp, 40, 15))) {
    return { error: 'Previše neuspešnih pokušaja. Sačekaj 15 minuta ili resetuj lozinku.' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase odbija ovu prijavu samo ako mu je uključena potvrda emaila, zato proveravamo i uspešnu prijavu.
  const unconfirmed = error?.code === 'email_not_confirmed' || (!error && !data.user?.email_confirmed_at && (await isPendingUser(data.user.id)));
  if (unconfirmed) {
    if (!error) await supabase.auth.signOut();
    return { error: 'Email još nije potvrđen. Otvori link iz mejla koji smo ti poslali.', unconfirmed: true };
  }
  if (error) {
    await Promise.all([recordAttempt(byEmail), recordAttempt(byIp)]);
    return { error: 'Pogrešan email ili lozinka.' };
  }
  await clearAttempts(byEmail);
  redirect(safeNext(formData.get('next')));
}
