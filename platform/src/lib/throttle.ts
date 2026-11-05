import 'server-only';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

// Ograničenje pokušaja u bazi: radi i kad Vercel pokrene više instanci servera.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'nepoznato';
}

export async function isThrottled(key: string, max: number, minutes: number): Promise<boolean> {
  const db = createAdminClient();
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const { count, error } = await db.from('auth_throttle').select('key', { count: 'exact', head: true }).eq('key', key).gte('at', since);
  if (error) return false; // Kvar brojača ne sme da zaključa korisnike.
  return (count ?? 0) >= max;
}

export async function recordAttempt(key: string) {
  await createAdminClient().from('auth_throttle').insert({ key });
}

export async function clearAttempts(key: string) {
  await createAdminClient().from('auth_throttle').delete().eq('key', key);
}

export async function pruneAttempts() {
  await createAdminClient().from('auth_throttle').delete().lt('at', new Date(Date.now() - 2 * 86400000).toISOString());
}
