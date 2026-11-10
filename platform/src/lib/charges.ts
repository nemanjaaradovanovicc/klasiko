import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetch-all';

type OrgLike = { id: string; fee_due_day: number; default_fee: number | null; sibling_discount_pct?: number | null; sibling_discount_3_pct?: number | null };

// Prvo dete plaća punu cenu, drugo dobija prvi procenat, treće i svako naredno drugi (ili isti kao drugo ako drugi nije upisan).
export function siblingRate(rank: number, second: number, third: number): number {
  if (rank <= 1) return 0;
  if (rank === 2) return second;
  return third > 0 ? third : second;
}
type GroupRow = { id: string; name: string; monthly_fee: number | null; group_members: { student_id: string; students: { id: string; active: boolean; custom_fee: number | null; discount_pct: number; family_id: string | null; ref_no: number; joined_at: string } | null }[] };

const lastDay = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// Mesečna zaduženja svim aktivnim učenicima u grupama sa mesečnom članarinom koji ih još nemaju.
// Koriste je i dugme na stranici Uplate i automatska naplata.
export async function createChargesForPeriod(db: SupabaseClient, org: OrgLike, period: string): Promise<{ created: number; skipped: number; error?: string }> {
  const [groups, existing] = await Promise.all([
    fetchAll<GroupRow>((a, b) => db.from('groups').select('id, name, monthly_fee, group_members(student_id, students(id, active, custom_fee, discount_pct, family_id, ref_no, joined_at))').eq('org_id', org.id).eq('active', true).eq('fee_type', 'monthly').order('id').range(a, b)),
    fetchAll<{ student_id: string; group_id: string }>((a, b) => db.from('charges').select('student_id, group_id, id').eq('org_id', org.id).eq('period', period).eq('kind', 'monthly').order('id').range(a, b)),
  ]);
  const have = new Set(existing.map((c) => `${c.student_id}:${c.group_id}`));
  const due = `${period}-${String(org.fee_due_day).padStart(2, '0')}`;
  const end = lastDay(period);

  // Popust za braću i sestre: redosled je po broju upisa (ref_no), prvo dete plaća punu cenu.
  const secondPct = Number(org.sibling_discount_pct ?? 0);
  const thirdPct = Number(org.sibling_discount_3_pct ?? 0);
  const familyRefs = new Map<string, Set<number>>();
  if (secondPct > 0 || thirdPct > 0) {
    for (const g of groups) for (const m of g.group_members) {
      const st = m.students;
      if (st?.active && st.family_id) {
        const set = familyRefs.get(st.family_id) ?? new Set<number>();
        set.add(st.ref_no);
        familyRefs.set(st.family_id, set);
      }
    }
  }

  const rows: { org_id: string; student_id: string; group_id: string; period: string; amount: number; due_date: string; description: string; kind: string }[] = [];
  let skipped = 0;
  for (const g of groups) {
    for (const m of g.group_members) {
      const st = m.students;
      if (!st || !st.active || have.has(`${st.id}:${g.id}`) || st.joined_at > end) continue;
      const base = st.custom_fee ?? g.monthly_fee ?? org.default_fee;
      if (base === null || base === undefined) { skipped++; continue; }
      const refs = st.family_id ? [...(familyRefs.get(st.family_id) ?? [])].sort((a, b) => a - b) : [];
      const rank = refs.indexOf(st.ref_no) + 1;
      const sib = siblingRate(rank, secondPct, thirdPct);
      const discount = Math.max(Number(st.discount_pct || 0), sib);
      rows.push({ org_id: org.id, student_id: st.id, group_id: g.id, period, amount: Math.round(Number(base) * (1 - discount / 100)), due_date: due, description: g.name, kind: 'monthly' });
    }
  }
  if (rows.length) {
    const { error } = await db.from('charges').insert(rows);
    if (error) return { created: 0, skipped, error: error.message };
    await applyAdvances(db, org.id);
  }
  return { created: rows.length, skipped };
}

// Avans (uplata bez zaduženja) raspoređuje na otvorena zaduženja učenika, od najstarijeg.
export async function applyAdvances(db: SupabaseClient, orgId: string, studentId?: string): Promise<number> {
  type Adv = { id: string; student_id: string; amount: number; paid_at: string; method: string; note: string | null; created_by: string | null; statement_hash: string | null };
  const advances = await fetchAll<Adv>((a, b) => {
    let q = db.from('payments').select('id, student_id, amount, paid_at, method, note, created_by, statement_hash').eq('org_id', orgId).is('charge_id', null);
    if (studentId) q = q.eq('student_id', studentId);
    return q.order('paid_at').order('id').range(a, b);
  });
  if (advances.length === 0) return 0;
  const ids = [...new Set(advances.map((p) => p.student_id))];
  const { data } = await db.from('charges').select('id, student_id, period, amount, payments(amount)').eq('org_id', orgId).in('student_id', ids).order('period');
  type Ch = { id: string; student_id: string; period: string; amount: number; payments: { amount: number }[] };
  const open = ((data ?? []) as unknown as Ch[]).map((c) => ({ ...c, remaining: Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0) })).filter((c) => c.remaining > 0);
  let moved = 0;
  for (const adv of advances) {
    let left = Number(adv.amount);
    for (const c of open.filter((x) => x.student_id === adv.student_id && x.remaining > 0)) {
      if (left <= 0) break;
      const use = Math.round(Math.min(left, c.remaining) * 100) / 100;
      if (use >= left) {
        const { error } = await db.from('payments').update({ charge_id: c.id, amount: use }).eq('id', adv.id).eq('org_id', orgId);
        if (error) break;
      } else {
        const { error } = await db.from('payments').insert({ org_id: orgId, student_id: adv.student_id, charge_id: c.id, amount: use, paid_at: adv.paid_at, method: adv.method, note: adv.note, created_by: adv.created_by, statement_hash: adv.statement_hash });
        if (error) break;
        const { error: e2 } = await db.from('payments').update({ amount: Math.round((left - use) * 100) / 100 }).eq('id', adv.id).eq('org_id', orgId);
        if (e2) break;
      }
      c.remaining -= use;
      left = Math.round((left - use) * 100) / 100;
      moved++;
    }
  }
  return moved;
}

// Rate ili polugodište: N zaduženja, svako u svom mesecu.
export function installmentPlan(total: number, count: number, firstPeriod: string): { period: string; amount: number; label: string }[] {
  const each = Math.floor(total / count);
  const [y, m] = firstPeriod.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const period = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7);
    return { period, amount: i === count - 1 ? total - each * (count - 1) : each, label: `rata ${i + 1}/${count}` };
  });
}
