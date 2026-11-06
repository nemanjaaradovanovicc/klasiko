import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/parent';

export const TRIAL_DAYS = 14;

// Šalje link za potvrdu adrese. Pozivalac odlučuje šta radi ako slanje ne uspe.
export async function sendConfirmationEmail(email: string, name: string, school: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) {
    console.error('Link za potvrdu nije napravljen', error?.message);
    return false;
  }
  const res = await sendEmail({
    to: email,
    subject: 'Potvrdi email i otvori školu u Klasiku',
    text: `Dobar dan, ${name}!\n\nPotvrdi email da bi otvorio/la školu „${school}” u Klasiku:\n\n${APP_URL}/auth/potvrda-mejla?token_hash=${encodeURIComponent(hash)}\n\nProbni period traje ${TRIAL_DAYS} dana, bez kartice i obaveze. Posle potvrde te čekaju prvi koraci, a spisak učenika možeš da uvezeš iz Excel-a.\n\nAko nisi ti otvarao/la nalog, samo zanemari ovu poruku.\n\nKlasiko`,
  });
  if (!res.ok) console.error('Mejl za potvrdu nije poslat', res.error);
  return res.ok;
}

// Samostalno registrovan nalog čiji email još nije potvrđen. Stari nalozi i oni koje pravi admin nikad nisu „na čekanju”.
export async function pendingSignup(email: string): Promise<{ userId: string; orgId: string; name: string; school: string } | null> {
  const db = createAdminClient();
  const { data: profile } = await db.from('profiles').select('id, org_id, full_name, organizations(name, source)').eq('email', email).maybeSingle();
  const org = profile?.organizations as unknown as { name: string; source: string } | null | undefined;
  if (!profile?.org_id || org?.source !== 'self') return null;
  const { data: auth, error } = await db.auth.admin.getUserById(profile.id);
  if (error || !auth.user || auth.user.email_confirmed_at) return null;
  return { userId: profile.id, orgId: profile.org_id, name: profile.full_name, school: org.name };
}

export async function isPendingUser(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('profiles').select('email').eq('id', userId).maybeSingle();
  return !!data?.email && !!(await pendingSignup(data.email));
}

// Nepotvrđen nalog nikad nije ušao u aplikaciju, pa nema podataka. Brišemo ga da tuđa ili pogrešno upisana registracija ne zauzme adresu.
export async function removePendingSignup(email: string): Promise<void> {
  const pending = await pendingSignup(email);
  if (!pending) return;
  const db = createAdminClient();
  await db.auth.admin.deleteUser(pending.userId);
  await db.from('organizations').delete().eq('id', pending.orgId);
}
