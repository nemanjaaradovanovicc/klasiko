import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { packageBalance, type PackageRow, type PresenceRow } from '@/lib/packages';

export type Balance = { student_id: string; group_id: string; name: string; group: string; total: number; used: number; remaining: number; expired: boolean };

// Stanje paketa časova za celu školu ili jednog učenika.
export async function packageBalances(db: SupabaseClient, orgId: string, today: string, studentIds?: string[]): Promise<Balance[]> {
  type Row = PackageRow & { students: { first_name: string; last_name: string; active: boolean } | null; groups: { name: string } | null };
  const packages = await fetchAll<Row>((a, b) => {
    let q = db.from('class_packages').select('id, student_id, group_id, classes_total, purchased_at, expires_at, students(first_name, last_name, active), groups(name)').eq('org_id', orgId);
    if (studentIds) q = q.in('student_id', studentIds);
    return q.order('id').range(a, b);
  });
  if (packages.length === 0) return [];
  const groupIds = [...new Set(packages.map((p) => p.group_id))];
  const firstPurchase = packages.map((p) => p.purchased_at).sort()[0];
  type A = { student_id: string; session_id: string; sessions: { date: string; group_id: string; status: string } };
  const present = await fetchAll<A>((a, b) => {
    let q = db.from('attendance').select('student_id, session_id, sessions!inner(date, group_id, status)').eq('org_id', orgId).eq('status', 'present').eq('sessions.status', 'held').in('sessions.group_id', groupIds).gte('sessions.date', firstPurchase);
    if (studentIds) q = q.in('student_id', studentIds);
    return q.order('session_id').order('student_id').range(a, b);
  });
  const byKey = new Map<string, Row[]>();
  for (const p of packages) byKey.set(`${p.student_id}:${p.group_id}`, [...(byKey.get(`${p.student_id}:${p.group_id}`) ?? []), p]);
  const out: Balance[] = [];
  for (const [key, list] of byKey) {
    const [studentId, groupId] = key.split(':');
    const presence: PresenceRow[] = present.filter((x) => x.student_id === studentId && x.sessions.group_id === groupId).map((x) => ({ student_id: x.student_id, group_id: groupId, date: x.sessions.date }));
    const st = list[0].students;
    if (!st?.active) continue;
    out.push({ student_id: studentId, group_id: groupId, name: `${st.first_name} ${st.last_name}`.trim(), group: list[0].groups?.name ?? '', ...packageBalance(list, presence, today) });
  }
  return out;
}

export async function lowPackages(db: SupabaseClient, orgId: string, today: string): Promise<Balance[]> {
  return (await packageBalances(db, orgId, today)).filter((b) => b.remaining <= 1).sort((a, b) => a.remaining - b.remaining);
}
