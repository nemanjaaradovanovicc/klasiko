'use server';

import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isISODate, isPeriod, todayISO } from '@/lib/format';
import { matchRows, statementKeys, type Allocation, type StatementRow, type MatchResult } from '@/lib/match';
import { chunks, fetchAll } from '@/lib/supabase/fetch-all';
import { applyAdvances, createChargesForPeriod, installmentPlan } from '@/lib/charges';

function back(period: string, q: string) {
  return `/uplate?mesec=${period}${q ? '&' + q : ''}`;
}
function parseMoney(v: FormDataEntryValue | null): number | null {
  const raw = String(v ?? '').trim().replace(/\s/g, '');
  if (!raw) return null;
  // „2.990,50” (srpski zapis) ili „2990.5” (polje za broj)
  const x = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : null;
}
function money(v: FormDataEntryValue | null): number | null {
  const x = parseMoney(v);
  return x !== null && x > 0 ? x : null;
}
const cents = (n: number) => Math.round(n * 100) / 100;

// Pravi zaduženja za mesec svim aktivnim učenicima u aktivnim grupama koji ih još nemaju.
export async function generateCharges(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  if (!isPeriod(period)) redirect('/uplate');
  const supabase = await createClient();
  const res = await createChargesForPeriod(supabase, ctx.org, period);
  if (res.error) redirect(back(period, 'err=' + encodeURIComponent(res.error)));
  revalidatePath('/uplate');
  const msg = res.created ? `Napravljeno ${res.created} zaduženja.` : 'Sva zaduženja za ovaj mesec već postoje.';
  redirect(back(period, 'ok=' + encodeURIComponent(msg + (res.skipped ? ` ${res.skipped} učenika preskočeno jer grupa nema cenu.` : ''))));
}

export async function addCharge(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  if (!isPeriod(period)) redirect('/uplate');
  const amount = money(fd.get('amount'));
  const studentId = String(fd.get('student_id') || '');
  if (!studentId || amount === null) redirect(back(period, 'err=' + encodeURIComponent('Izaberi učenika i unesi iznos.')));
  const supabase = await createClient();
  const { error } = await supabase.from('charges').insert({
    org_id: ctx.org.id, student_id: studentId, group_id: null, period, amount, kind: 'extra',
    description: String(fd.get('description') || '').trim() || 'Dodatno zaduženje',
    due_date: `${period}-${String(ctx.org.fee_due_day).padStart(2, '0')}`,
  });
  if (!error) await applyAdvances(supabase, ctx.org.id, studentId);
  revalidatePath('/uplate');
  redirect(back(period, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Zaduženje je dodato.')));
}

// Polugodište ili rate: ceo iznos se deli na mesece, za celu grupu ili jednog učenika.
export async function createInstallments(fd: FormData) {
  const ctx = await requireOwner();
  const first = String(fd.get('period') || '');
  if (!isPeriod(first)) redirect('/uplate');
  const total = money(fd.get('total'));
  const count = Number(fd.get('count'));
  const groupId = String(fd.get('group_id') || '');
  const studentId = String(fd.get('student_id') || '');
  const title = String(fd.get('description') || '').trim() || 'Polugodište';
  if (total === null || !Number.isInteger(count) || count < 1 || count > 12) redirect(back(first, 'err=' + encodeURIComponent('Unesi ukupan iznos i broj rata (od 1 do 12).')));
  if (!groupId && !studentId) redirect(back(first, 'err=' + encodeURIComponent('Izaberi grupu ili učenika.')));
  const supabase = await createClient();
  let students: string[] = studentId ? [studentId] : [];
  if (!studentId) {
    const { data } = await supabase.from('group_members').select('student_id, students(active)').eq('group_id', groupId).eq('org_id', ctx.org.id);
    students = ((data ?? []) as unknown as { student_id: string; students: { active: boolean } | null }[]).filter((m) => m.students?.active).map((m) => m.student_id);
  }
  if (students.length === 0) redirect(back(first, 'err=' + encodeURIComponent('U grupi nema aktivnih učenika.')));
  const plan = installmentPlan(total, count, first);
  const rows = students.flatMap((sid) => plan.map((p) => ({
    org_id: ctx.org.id, student_id: sid, group_id: groupId || null, period: p.period, amount: p.amount, kind: 'installment',
    description: count > 1 ? `${title}, ${p.label}` : title, due_date: `${p.period}-${String(ctx.org.fee_due_day).padStart(2, '0')}`,
  })));
  const { error } = await supabase.from('charges').insert(rows);
  if (!error) await applyAdvances(supabase, ctx.org.id);
  revalidatePath('/uplate');
  redirect(back(first, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent(`Napravljeno ${rows.length} rata za ${students.length} učenika.`)));
}

export async function recordPayment(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  if (!isPeriod(period)) redirect('/uplate');
  const chargeId = String(fd.get('charge_id'));
  const supabase = await createClient();
  const { data: ch } = await supabase.from('charges').select('id, student_id, amount, payments(amount)').eq('id', chargeId).eq('org_id', ctx.org.id).single();
  if (!ch) redirect(back(period, 'err=' + encodeURIComponent('Zaduženje nije pronađeno.')));
  const paid = (ch.payments ?? []).reduce((a: number, p: { amount: number }) => a + Number(p.amount), 0);
  const remaining = cents(Math.max(0, Number(ch.amount) - paid));
  const amount = money(fd.get('amount')) ?? remaining;
  if (!(amount > 0)) redirect(back(period, 'err=' + encodeURIComponent('Zaduženje je već plaćeno.')));
  const method = ['cash', 'bank', 'card', 'other'].includes(String(fd.get('method'))) ? String(fd.get('method')) : 'bank';
  const paidAtRaw = String(fd.get('paid_at') || '');
  const base = { org_id: ctx.org.id, student_id: ch.student_id, method, paid_at: isISODate(paidAtRaw) ? paidAtRaw : todayISO(), note: String(fd.get('note') || '').trim() || null, created_by: ctx.userId };
  // Više od duga: razlika ostaje kao avans učenika, ne „nestaje” u jednom zaduženju.
  const onCharge = Math.min(amount, remaining);
  const rows = [
    ...(onCharge > 0 ? [{ ...base, charge_id: ch.id, amount: onCharge }] : []),
    ...(amount > remaining ? [{ ...base, charge_id: null, amount: cents(amount - remaining), note: base.note ?? 'Avans' }] : []),
  ];
  const { error } = await supabase.from('payments').insert(rows);
  revalidatePath('/uplate');
  const msg = amount > remaining ? `Uplata je evidentirana. ${cents(amount - remaining)} RSD je upisano kao avans.` : 'Uplata je evidentirana.';
  redirect(back(period, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent(msg)) + (fd.get('filter') ? `&prikaz=${fd.get('filter')}` : ''));
}

export async function deletePayment(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const supabase = await createClient();
  const { error } = await supabase.from('payments').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath('/uplate');
  redirect(back(isPeriod(period) ? period : '', error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Uplata je obrisana.')));
}

export async function updateCharge(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const id = String(fd.get('id'));
  const supabase = await createClient();
  if (fd.get('delete')) {
    // Zaduženje sa uplatama se ne briše, jer bi uplate ostale bez veze sa njim.
    const { count } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('charge_id', id).eq('org_id', ctx.org.id);
    if (count) redirect(back(period, 'err=' + encodeURIComponent('Ovo zaduženje ima uplate. Prvo obriši uplate, pa zaduženje.')));
    const { error } = await supabase.from('charges').delete().eq('id', id).eq('org_id', ctx.org.id);
    revalidatePath('/uplate');
    redirect(back(period, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Zaduženje je obrisano.')));
  }
  const amount = parseMoney(fd.get('amount'));
  if (amount === null) redirect(back(period, 'err=' + encodeURIComponent('Unesi ispravan iznos.')));
  const { error } = await supabase.from('charges').update({ amount }).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/uplate');
  redirect(back(period, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Iznos je izmenjen.')));
}

// ---------- Uparivanje uplata sa izvoda ----------

export type OpenCharge = { id: string; studentId: string; student: string; period: string; remaining: number; description: string | null };
export type { StatementRow, MatchResult } from '@/lib/match';

const hashKey = (k: string) => createHash('sha256').update(k).digest('hex').slice(0, 40);
const noteFor = (s: string) => ('Izvod: ' + s).slice(0, 200);

export async function matchStatement(input: StatementRow[]): Promise<{ results: MatchResult[]; open: OpenCharge[]; alreadyImported: number; truncated: number; error?: string }> {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const rows = input.filter((r) => r.amount > 0).slice(0, 5000);
  const keys = statementKeys(rows);
  const hashed = rows.map((r, i) => ({ ...r, hash: hashKey(keys[i]) }));

  // Redovi koji su već uvezeni (i oni uvezeni pre uvođenja oznake, po datumu, iznosu i napomeni).
  const seen = new Set<string>();
  for (const part of chunks(hashed.map((r) => r.hash))) {
    const { data } = await supabase.from('payments').select('statement_hash').eq('org_id', ctx.org.id).in('statement_hash', part);
    for (const p of data ?? []) seen.add(p.statement_hash as string);
  }
  const legacy = await fetchAll<{ id: string; paid_at: string; amount: number; note: string }>((a, b) => supabase.from('payments').select('id, paid_at, amount, note').eq('org_id', ctx.org.id).is('statement_hash', null).like('note', 'Izvod: %').order('id').range(a, b));
  const legacyKeys = new Map<string, number>();
  for (const p of legacy) {
    const k = `${p.paid_at}|${Number(p.amount).toFixed(2)}|${p.note}`;
    legacyKeys.set(k, (legacyKeys.get(k) ?? 0) + 1);
  }
  const allFresh = hashed.filter((r) => {
    if (seen.has(r.hash)) return false;
    const k = `${r.date}|${r.amount.toFixed(2)}|${noteFor(r.payer || r.purpose)}`;
    const n = legacyKeys.get(k) ?? 0;
    if (n > 0) { legacyKeys.set(k, n - 1); return false; }
    return true;
  });
  // Odjednom se obrađuje najviše 1000 novih uplata; ostale dolaze na red pri sledećem uvozu istog fajla.
  const fresh = allFresh.slice(0, 1000);

  type C = { id: string; period: string; amount: number; student_id: string; description: string | null; students: { first_name: string; last_name: string; parent_name: string | null; ref_no: number; family_id: string | null } | null; payments: { amount: number }[] };
  const data = await fetchAll<C>((a, b) => supabase
    .from('charges')
    .select('id, period, amount, student_id, description, students(first_name, last_name, parent_name, ref_no, family_id), payments(amount)')
    .eq('org_id', ctx.org.id)
    .order('period')
    .order('id')
    .range(a, b));
  const charges = data
    .filter((c) => c.students)
    .map((c) => ({ ...c, remaining: Math.max(0, cents(Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0))) }))
    .filter((c) => c.remaining > 0);
  const open: OpenCharge[] = charges.map((c) => ({ id: c.id, studentId: c.student_id, student: `${c.students!.first_name} ${c.students!.last_name}`.trim(), period: c.period, remaining: c.remaining, description: c.description }));
  const results = matchRows(fresh, charges.map((c) => ({ id: c.id, period: c.period, remaining: c.remaining, first_name: c.students!.first_name, last_name: c.students!.last_name, parent_name: c.students!.parent_name, ref_no: c.students!.ref_no, family: c.students!.family_id })));
  return { results, open, alreadyImported: hashed.length - allFresh.length, truncated: allFresh.length - fresh.length };
}

export type ApplyItem = { hash: string; total: number; date: string | null; note: string; allocations: Allocation[] };

export async function applyMatches(items: ApplyItem[]): Promise<{ ok?: number; skipped?: number; advance?: number; error?: string }> {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const ids = [...new Set(items.flatMap((i) => i.allocations.map((a) => a.chargeId)))];
  type Ch = { id: string; student_id: string; amount: number; payments: { amount: number }[] };
  const chargeRows: Ch[] = [];
  for (const part of chunks(ids)) {
    const { data } = await supabase.from('charges').select('id, student_id, amount, payments(amount)').eq('org_id', ctx.org.id).in('id', part);
    chargeRows.push(...((data ?? []) as unknown as Ch[]));
  }
  const left = new Map(chargeRows.map((c) => [c.id, Math.max(0, cents(Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0)))]));
  const studentOf = new Map(chargeRows.map((c) => [c.id, c.student_id]));

  const seen = new Set<string>();
  for (const part of chunks(items.map((i) => i.hash))) {
    const { data } = await supabase.from('payments').select('statement_hash').eq('org_id', ctx.org.id).in('statement_hash', part);
    for (const p of data ?? []) seen.add(p.statement_hash as string);
  }

  const rows: Record<string, unknown>[] = [];
  let applied = 0, skipped = 0, advance = 0;
  for (const item of items) {
    const allocs = item.allocations.filter((a) => studentOf.has(a.chargeId) && a.amount > 0);
    if (seen.has(item.hash) || allocs.length === 0) { skipped++; continue; }
    const base = { org_id: ctx.org.id, method: 'bank', paid_at: isISODate(item.date) ? item.date : todayISO(), note: noteFor(item.note), created_by: ctx.userId, statement_hash: item.hash };
    let unspent = cents(item.total);
    for (const a of allocs) {
      const use = cents(Math.min(a.amount, unspent, left.get(a.chargeId) ?? 0));
      if (use <= 0) continue;
      rows.push({ ...base, student_id: studentOf.get(a.chargeId), charge_id: a.chargeId, amount: use });
      left.set(a.chargeId, cents((left.get(a.chargeId) ?? 0) - use));
      unspent = cents(unspent - use);
    }
    // Ostatak uplate je avans prvog učenika: novac je evidentiran, a ne „preplaćeno” zaduženje.
    if (unspent > 0) {
      rows.push({ ...base, student_id: studentOf.get(allocs[0].chargeId), charge_id: null, amount: unspent });
      advance += unspent;
    }
    applied++;
  }
  if (rows.length === 0) return { error: 'Nema novih uplata za upis.', skipped };
  const { error } = await supabase.from('payments').upsert(rows, { onConflict: 'org_id,statement_hash,charge_id', ignoreDuplicates: true });
  if (error) return { error: 'Uplate nisu sačuvane: ' + error.message };
  revalidatePath('/uplate');
  return { ok: applied, skipped, advance };
}

// ---------- Avans ----------

export async function distributeAdvance(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  const moved = await applyAdvances(supabase, ctx.org.id, studentId);
  revalidatePath(`/ucenici/${studentId}`);
  redirect(`/ucenici/${studentId}?` + (moved ? 'ok=avans' : 'err=' + encodeURIComponent('Nema otvorenih zaduženja za raspodelu avansa.')));
}
