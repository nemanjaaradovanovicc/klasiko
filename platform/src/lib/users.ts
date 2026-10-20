import 'server-only';
import { randomInt } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type Creds = { error?: string; email?: string; password?: string; name?: string };

export function tempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s;
}

// Pravi nalog sa privremenom lozinkom i vezuje ga za školu. Pozivalac mora prethodno da proveri prava.
export async function createOrgUser(orgId: string, role: 'owner' | 'teacher', fullName: string, email: string, phone: string | null): Promise<Creds> {
  const db = createAdminClient();
  const password = tempPassword();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !created.user) {
    const msg = error?.message ?? '';
    return { error: /already|registered|exists/i.test(msg) ? 'Korisnik sa tim emailom već postoji.' : 'Nalog nije napravljen: ' + msg };
  }
  const { error: pErr } = await db.from('profiles').upsert({ id: created.user.id, org_id: orgId, role, full_name: fullName, email, phone, must_change_password: true });
  if (pErr) {
    await db.auth.admin.deleteUser(created.user.id);
    return { error: 'Profil nije sačuvan: ' + pErr.message };
  }
  return { email, password, name: fullName };
}

export async function resetUserPassword(userId: string): Promise<Creds> {
  const db = createAdminClient();
  const password = tempPassword();
  const { data, error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) return { error: 'Lozinka nije resetovana.' };
  await db.from('profiles').update({ must_change_password: true }).eq('id', userId);
  return { email: data.user?.email ?? '', password };
}

export async function setActive(userId: string, active: boolean) {
  const db = createAdminClient();
  await db.from('profiles').update({ active }).eq('id', userId);
  await db.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
}
