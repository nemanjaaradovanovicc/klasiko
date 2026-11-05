'use server';

import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type EnrollResult = { factorId?: string; qr?: string; secret?: string; error?: string };

export async function startEnroll(): Promise<EnrollResult> {
  const ctx = await getCtx();
  if (!ctx.isSuper) redirect('/');
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Klasiko ${Date.now()}`, issuer: 'Klasiko' });
  if (error || !data) return { error: 'Dvostepena prijava nije pokrenuta: ' + (error?.message ?? '') + ' Proveri da li je TOTP uključen u Supabase podešavanjima.' };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyCode(_: { error?: string } | undefined, fd: FormData): Promise<{ error?: string } | undefined> {
  const ctx = await getCtx();
  if (!ctx.isSuper) redirect('/');
  const code = String(fd.get('code') || '').replace(/\s/g, '');
  const factorId = String(fd.get('factor_id') || '');
  if (!/^\d{6}$/.test(code)) return { error: 'Unesi šestocifreni kod iz aplikacije.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: 'Kod nije tačan. Probaj sledeći kod iz aplikacije.' };
  redirect('/admin');
}
