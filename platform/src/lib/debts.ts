import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { familyKey } from '@/lib/families';
import { fullName, periodLabel, rsd } from '@/lib/format';

export type DebtStudent = { id: string; first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; parent_email: string | null; phone: string | null; email: string | null; ref_no: number; family_id: string | null; active: boolean };
export type DebtCharge = { id: string; period: string; due_date: string | null; description: string | null; amount: number; remaining: number; student_id: string };
export type DebtRow = { key: string; students: DebtStudent[]; familyIds: string[]; charges: DebtCharge[]; total: number; oldest: string; phone: string | null; email: string | null; parent: string | null; lastReminder: string | null };

// Ukupan dug po roditelju: sva neplaćena zaduženja sa dospelim ili tekućim mesecom, spojena po porodici.
export async function loadDebts(db: SupabaseClient, orgId: string, upToPeriod: string): Promise<DebtRow[]> {
  type C = { id: string; period: string; due_date: string | null; description: string | null; amount: number; student_id: string; payments: { amount: number }[] };
  const [charges, students, reminders] = await Promise.all([
    fetchAll<C>((a, b) => db.from('charges').select('id, period, due_date, description, amount, student_id, payments(amount)').eq('org_id', orgId).lte('period', upToPeriod).order('period').order('id').range(a, b)),
    fetchAll<DebtStudent>((a, b) => db.from('students').select('id, first_name, last_name, parent_name, parent_phone, parent_email, phone, email, ref_no, family_id, active').eq('org_id', orgId).order('id').range(a, b)),
    fetchAll<{ id: string; student_id: string; sent_at: string }>((a, b) => db.from('reminders').select('id, student_id, sent_at').eq('org_id', orgId).order('sent_at', { ascending: false }).order('id').range(a, b)),
  ]);
  const byId = new Map(students.map((s) => [s.id, s]));
  const lastBy = new Map<string, string>();
  for (const r of reminders) if (!lastBy.has(r.student_id)) lastBy.set(r.student_id, r.sent_at);
  const rows = new Map<string, DebtRow>();
  for (const c of charges) {
    const remaining = Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0);
    if (remaining <= 0) continue;
    const st = byId.get(c.student_id);
    if (!st) continue;
    const key = familyKey(st);
    const row = rows.get(key) ?? { key, students: [], familyIds: [], charges: [], total: 0, oldest: c.period, phone: null, email: null, parent: null, lastReminder: null };
    if (!row.students.some((x) => x.id === st.id)) row.students.push(st);
    row.charges.push({ id: c.id, period: c.period, due_date: c.due_date, description: c.description, amount: Number(c.amount), remaining, student_id: c.student_id });
    row.total += remaining;
    if (c.period < row.oldest) row.oldest = c.period;
    rows.set(key, row);
  }
  // Kontakt, link i poslednji podsetnik važe za celu porodicu, i kad dete sa dugom nema upisan telefon ili email.
  for (const s of students) {
    const row = rows.get(familyKey(s));
    if (!row) continue;
    row.familyIds.push(s.id);
    row.phone ??= s.parent_phone || s.phone;
    row.email ??= s.parent_email || s.email;
    row.parent ??= s.parent_name;
    const last = lastBy.get(s.id);
    if (last && (!row.lastReminder || last > row.lastReminder)) row.lastReminder = last;
  }
  return [...rows.values()].sort((a, b) => a.oldest.localeCompare(b.oldest) || b.total - a.total);
}

export function debtMessage(row: Pick<DebtRow, 'students' | 'charges' | 'total'>, orgName: string, bankAccount: string | null, link?: string | null): string {
  const names = new Map(row.students.map((s) => [s.id, fullName(s)]));
  return [
    `Dobar dan! Podsetnik za uplatu, ${[...names.values()].join(', ')}:`,
    ...row.charges.map((c) => `${periodLabel(c.period)}${row.students.length > 1 ? `, ${names.get(c.student_id)}` : ''}${c.description ? ` (${c.description})` : ''}: ${rsd(c.remaining)}`),
    `Ukupno: ${rsd(row.total)}`,
    bankAccount ? `Račun: ${bankAccount}` : '',
    link ? `QR kod za uplatu i detalji: ${link}` : '',
    `Ako ste već uplatili, zanemarite poruku. Hvala! ${orgName}`,
  ].filter(Boolean).join('\n');
}
