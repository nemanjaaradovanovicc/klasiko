'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { clearAttempts, clientIp, isThrottled, recordAttempt } from '@/lib/throttle';

function safeNext(v: FormDataEntryValue | null): string {
  const n = String(v ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export async function login(_: { error?: string } | undefined, formData: FormData) {
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await Promise.all([recordAttempt(byEmail), recordAttempt(byIp)]);
    return { error: 'Pogrešan email ili lozinka.' };
  }
  await clearAttempts(byEmail);
  redirect(safeNext(formData.get('next')));
}
