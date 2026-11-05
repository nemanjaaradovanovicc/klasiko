'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { addDays, todayISO } from '@/lib/format';
import { KINDS } from '@/lib/types';
import { clientIp, isThrottled, recordAttempt } from '@/lib/throttle';
import { emailEnabled, sendEmail } from '@/lib/email';
import { audit } from '@/lib/audit';
import { APP_URL } from '@/lib/parent';

export type RegisterState = { error?: string } | undefined;

const TRIAL_DAYS = 14;

export async function register(_: RegisterState, fd: FormData): Promise<RegisterState> {
  const v = (k: string) => String(fd.get(k) ?? '').trim();
  // Zamka za botove: pravi posetioci ne vide ovo polje.
  if (v('company')) redirect('/login');
  const school = v('school'), name = v('name'), phone = v('phone'), email = v('email').toLowerCase(), password = String(fd.get('password') ?? '');
  const kind = KINDS[v('kind')] ? v('kind') : 'ostalo';
  if (!school || !name || !email) return { error: 'Popuni naziv škole, ime i email.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Email nije ispravan.' };
  if (password.length < 8) return { error: 'Lozinka mora imati bar 8 znakova.' };
  if (fd.get('terms') !== 'on') return { error: 'Za nastavak prihvati politiku privatnosti i obradu podataka.' };

  const key = `register-ip:${await clientIp()}`;
  if (await isThrottled(key, 5, 60)) return { error: 'Previše prijava sa ove mreže. Probaj ponovo za sat vremena.' };
  await recordAttempt(key);

  const db = createAdminClient();
  const { data: org, error: orgErr } = await db.from('organizations').insert({
    name: school, kind, phone: phone || null, email, plan: 'rast', status: 'trial', trial_ends_at: addDays(todayISO(), TRIAL_DAYS), terms_accepted_at: new Date().toISOString(),
  }).select('id').single();
  if (orgErr || !org) return { error: 'Registracija nije uspela. Probaj ponovo.' };
  const { data: created, error: userErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (userErr || !created.user) {
    await db.from('organizations').delete().eq('id', org.id);
    return { error: /already|registered|exists/i.test(userErr?.message ?? '') ? 'Nalog sa tim emailom već postoji. Prijavi se ili resetuj lozinku.' : 'Nalog nije napravljen. Probaj sa jačom lozinkom.' };
  }
  const { error: profErr } = await db.from('profiles').upsert({ id: created.user.id, org_id: org.id, role: 'owner', full_name: name, email, phone: phone || null, must_change_password: false });
  if (profErr) {
    await db.auth.admin.deleteUser(created.user.id);
    await db.from('organizations').delete().eq('id', org.id);
    return { error: 'Registracija nije uspela. Probaj ponovo.' };
  }
  await audit({ userId: created.user.id, email }, 'org.register', { orgId: org.id, target: school });

  if (emailEnabled()) {
    await sendEmail({ to: email, subject: 'Dobro došao/la u Klasiko', text: `Dobar dan, ${name}!\n\nŠkola „${school}” je otvorena, a probni period traje ${TRIAL_DAYS} dana, bez kartice i obaveze.\n\nPrijava: ${APP_URL}\n\nPrvi koraci su na početnoj stranici. Spisak učenika možeš da uvezeš iz Excel-a.\n\nKlasiko` });
    const { data: st } = await db.from('platform_settings').select('email').eq('id', 1).maybeSingle();
    if (st?.email) await sendEmail({ to: st.email, subject: `Nova škola: ${school}`, text: `${school} (${KINDS[kind]})\n${name}, ${email}, ${phone || 'bez telefona'}\nProbni period: ${TRIAL_DAYS} dana` });
  }

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  redirect(signErr ? '/login' : '/');
}
