import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { addDays } from '@/lib/format';
import { allocateUsage, suggestedExpiry, type UsageSession } from '@/lib/packages';
import { weeklyFrequency } from '@/lib/schedule';

export type Balance = {
  id: string;
  student_id: string;
  group_id: string;
  name: string;
  group: string;
  total: number;
  used: number;
  remaining: number;
  expired: boolean;
  purchased_at: string;
  expires_at: string | null;
  paid_at: string | null;
  price: number;
  currency: string;
  bundle_id: string | null;
  shared: boolean;
  auto_expires: boolean;
  email: string | null;
  phone: string | null;
  family_id: string | null;
};

type StudentBits = { id: string; first_name: string; last_name: string; active: boolean; parent_email: string | null; email: string | null; parent_phone: string | null; phone: string | null; family_id: string | null };
type PkgRow = {
  id: string;
  student_id: string;
  group_id: string;
  classes_total: number;
  purchased_at: string;
  expires_at: string | null;
  paid_at: string | null;
  price: number;
  currency: string;
  bundle_id: string | null;
  shared: boolean;
  auto_expires: boolean;
  students: Omit<StudentBits, 'id'> | null;
  groups: { name: string } | null;
};

// class_package_students vezuje isti paket i za učenika i za grupu, pa PostgREST vidi dve veze.
// Bez imena spoljnog ključa upit puca i pre nego što vrati prazan katalog (PGRST201).
export const CLASS_PACKAGE_STUDENT_EMBED = 'students!class_packages_student_id_fkey(first_name, last_name, active, parent_email, email, parent_phone, phone, family_id)';
export const CLASS_PACKAGE_GROUP_EMBED = 'groups!class_packages_group_id_fkey(name)';
const PKG_SELECT = `id, student_id, group_id, classes_total, purchased_at, expires_at, paid_at, price, currency, bundle_id, shared, auto_expires, ${CLASS_PACKAGE_STUDENT_EMBED}, ${CLASS_PACKAGE_GROUP_EMBED}`;

// Stanje svakog paketa: održani časovi (učenik prisutan) troše paket, stariji prvi.
export async function packageBalances(db: SupabaseClient, orgId: string, today: string, studentIds?: string[]): Promise<Balance[]> {
  const packages = await loadPackages(db, orgId, studentIds);
  if (packages.length === 0) return [];
  const ids = packages.map((p) => p.id);
  const links = await fetchAll<{ class_package_id: string; student_id: string }>((a, b) => db.from('class_package_students').select('class_package_id, student_id').in('class_package_id', ids).order('student_id').range(a, b));
  const coveredOf = new Map<string, string[]>();
  for (const l of links) coveredOf.set(l.class_package_id, [...(coveredOf.get(l.class_package_id) ?? []), l.student_id]);

  const people = new Map<string, StudentBits>();
  for (const p of packages) if (p.students) people.set(p.student_id, { id: p.student_id, ...p.students });
  const missing = [...new Set(packages.flatMap((p) => coveredIds(p, coveredOf)))].filter((id) => !people.has(id));
  if (missing.length) {
    const extra = await fetchAll<StudentBits>((a, b) => db.from('students').select('id, first_name, last_name, active, parent_email, email, parent_phone, phone, family_id').in('id', missing).order('id').range(a, b));
    for (const s of extra) people.set(s.id, s);
  }

  const groupIds = [...new Set(packages.map((p) => p.group_id))];
  const countStudents = [...new Set(packages.flatMap((p) => coveredIds(p, coveredOf)))];
  const firstPurchase = packages.map((p) => p.purchased_at).sort()[0];
  type A = { student_id: string; session_id: string; sessions: { date: string; group_id: string; status: string } };
  const present = await fetchAll<A>((a, b) => {
    let q = db.from('attendance').select('student_id, session_id, sessions!inner(date, group_id, status)').eq('org_id', orgId).eq('status', 'present').eq('sessions.status', 'held').in('sessions.group_id', groupIds).gte('sessions.date', firstPurchase);
    if (countStudents.length) q = q.in('student_id', countStudents);
    return q.order('session_id').order('student_id').range(a, b);
  });
  const presence = present.map((x) => ({ student_id: x.student_id, group_id: x.sessions.group_id, session_id: x.session_id, date: x.sessions.date }));

  const used = new Map<string, number>();
  const plain = packages.filter((p) => !p.shared);
  const byKey = new Map<string, PkgRow[]>();
  for (const p of plain) byKey.set(`${p.student_id}:${p.group_id}`, [...(byKey.get(`${p.student_id}:${p.group_id}`) ?? []), p]);
  for (const [key, list] of byKey) {
    const [studentId, groupId] = key.split(':');
    const sessions: UsageSession[] = presence.filter((x) => x.student_id === studentId && x.group_id === groupId);
    for (const [id, n] of allocateUsage(list, sessions)) used.set(id, n);
  }
  for (const p of packages.filter((x) => x.shared)) {
    const who = new Set(coveredIds(p, coveredOf));
    const sessions = new Set(presence.filter((x) => who.has(x.student_id) && x.group_id === p.group_id && x.date >= p.purchased_at && (!p.expires_at || x.date <= p.expires_at)).map((x) => x.session_id));
    used.set(p.id, sessions.size);
  }

  const want = studentIds ? new Set(studentIds) : null;
  const out: Balance[] = [];
  for (const p of packages) {
    const n = used.get(p.id) ?? 0;
    const expired = !!(p.expires_at && p.expires_at < today);
    for (const sid of coveredIds(p, coveredOf)) {
      if (want && !want.has(sid)) continue;
      const st = people.get(sid);
      if (!st?.active) continue;
      out.push({
        id: p.id,
        student_id: sid,
        group_id: p.group_id,
        name: `${st.first_name} ${st.last_name}`.trim(),
        group: p.groups?.name ?? '',
        total: p.classes_total,
        used: n,
        remaining: Math.max(0, p.classes_total - n),
        expired,
        purchased_at: p.purchased_at,
        expires_at: p.expires_at,
        paid_at: p.paid_at,
        price: Number(p.price),
        currency: p.currency || 'RSD',
        bundle_id: p.bundle_id,
        shared: p.shared,
        auto_expires: p.auto_expires,
        email: (st.parent_email || st.email || '').trim().toLowerCase() || null,
        phone: st.parent_phone || st.phone,
        family_id: st.family_id,
      });
    }
  }
  return out;
}

function coveredIds(p: PkgRow, links: Map<string, string[]>): string[] {
  if (!p.shared) return [p.student_id];
  return [...new Set([p.student_id, ...(links.get(p.id) ?? [])])];
}

async function loadPackages(db: SupabaseClient, orgId: string, studentIds?: string[]): Promise<PkgRow[]> {
  if (!studentIds?.length) {
    return fetchAll<PkgRow>((a, b) => db.from('class_packages').select(PKG_SELECT).eq('org_id', orgId).order('purchased_at').order('id').range(a, b));
  }
  const direct = await fetchAll<PkgRow>((a, b) => db.from('class_packages').select(PKG_SELECT).eq('org_id', orgId).in('student_id', studentIds).order('id').range(a, b));
  const links = await fetchAll<{ class_package_id: string }>((a, b) => db.from('class_package_students').select('class_package_id, student_id').in('student_id', studentIds).order('class_package_id').range(a, b));
  const have = new Set(direct.map((p) => p.id));
  const extraIds = [...new Set(links.map((l) => l.class_package_id))].filter((id) => !have.has(id));
  if (!extraIds.length) return direct;
  const extra = await fetchAll<PkgRow>((a, b) => db.from('class_packages').select(PKG_SELECT).eq('org_id', orgId).in('id', extraIds).order('id').range(a, b));
  return [...direct, ...extra];
}

export async function lowPackages(db: SupabaseClient, orgId: string, today: string): Promise<Balance[]> {
  return (await packageBalances(db, orgId, today)).filter((b) => !b.expired && b.remaining <= 1).sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, 'sr'));
}

// Otkazan čas bez zakazane nadoknade produžava automatski istek za 7 dana. Kad se nadoknada zakaže, produženje se povlači.
export async function syncPackageExtension(db: SupabaseClient, orgId: string, sessionId: string): Promise<void> {
  const { data: session } = await db.from('sessions').select('id, group_id, date, status').eq('id', sessionId).eq('org_id', orgId).maybeSingle();
  if (!session) return;
  const [{ data: makeups }, { data: pkgs }, { data: exts }, { data: slots }] = await Promise.all([
    db.from('sessions').select('id').eq('makeup_for', sessionId).limit(1),
    db.from('class_packages').select('id, purchased_at, expires_at, auto_expires, classes_total').eq('org_id', orgId).eq('group_id', session.group_id),
    db.from('package_extensions').select('class_package_id').eq('session_id', sessionId),
    db.from('schedule_slots').select('recurrence').eq('group_id', session.group_id),
  ]);
  const covered = (makeups ?? []).length > 0;
  const extended = new Set((exts ?? []).map((e) => e.class_package_id));
  const shouldExtend = session.status === 'cancelled' && !covered;
  const freq = weeklyFrequency(slots ?? []);
  for (const p of pkgs ?? []) {
    if (!p.auto_expires || session.date < p.purchased_at) continue;
    const inWindow = !p.expires_at || session.date <= p.expires_at || extended.has(p.id);
    if (shouldExtend && inWindow && !extended.has(p.id)) {
      const base = p.expires_at ?? suggestedExpiry(p.purchased_at, p.classes_total, freq, 0);
      await db.from('class_packages').update({ expires_at: addDays(base, 7) }).eq('id', p.id).eq('org_id', orgId);
      await db.from('package_extensions').insert({ class_package_id: p.id, session_id: sessionId, org_id: orgId });
    } else if (!shouldExtend && extended.has(p.id) && p.expires_at) {
      await db.from('class_packages').update({ expires_at: addDays(p.expires_at, -7) }).eq('id', p.id).eq('org_id', orgId);
      await db.from('package_extensions').delete().eq('class_package_id', p.id).eq('session_id', sessionId);
    }
  }
}
