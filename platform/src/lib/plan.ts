import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, type Organization } from '@/lib/types';

// Provera limita paketa. Vraća poruku ako novi učenici ne staju u paket.
export async function studentLimitError(db: SupabaseClient, org: Pick<Organization, 'id' | 'plan'>, adding: number, isSuper = false): Promise<string | null> {
  const limit = PLANS[org.plan].students;
  if (!limit || isSuper) return null;
  const { count } = await db.from('students').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('active', true);
  const now = count ?? 0;
  if (now + adding <= limit) return null;
  const free = Math.max(0, limit - now);
  return `Paket ${PLANS[org.plan].name} uključuje do ${limit} aktivnih učenika, a sada ih imaš ${now}${adding > 1 ? ` (slobodno još ${free}, a dodaješ ${adding})` : ''}. Za više pređi na veći paket.`;
}

export async function teacherLimitError(db: SupabaseClient, org: Pick<Organization, 'id' | 'plan'>, isSuper = false): Promise<string | null> {
  const limit = PLANS[org.plan].teachers;
  if (!limit || isSuper) return null;
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('active', true).eq('role', 'teacher');
  if ((count ?? 0) < limit) return null;
  return `Paket ${PLANS[org.plan].name} uključuje do ${limit} predavača. Za više pređi na veći paket.`;
}
