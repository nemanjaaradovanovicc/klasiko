'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/format';

function back(period: string, q: string) {
  return `/uplate?mesec=${period}${q ? '&' + q : ''}`;
}
function money(v: FormDataEntryValue | null): number | null {
  const raw = String(v ?? '').trim().replace(/\s/g, '');
  // „2.990,50” (srpski zapis) ili „2990.5” (polje za broj)
  const x = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null;
}

// Pravi zaduženja za mesec svim aktivnim učenicima u aktivnim grupama koji ih još nemaju.
export async function generateCharges(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  if (!/^\d{4}-\d{2}$/.test(period)) redirect('/uplate');
  const supabase = await createClient();
  const [{ data: groups }, { data: existing }] = await Promise.all([
    supabase.from('groups').select('id, name, monthly_fee, group_members(student_id, students(id, active, custom_fee, discount_pct))').eq('org_id', ctx.org.id).eq('active', true),
    supabase.from('charges').select('student_id, group_id').eq('org_id', ctx.org.id).eq('period', period),
  ]);
  const have = new Set((existing ?? []).map((c) => `${c.student_id}:${c.group_id}`));
  const due = `${period}-${String(ctx.org.fee_due_day).padStart(2, '0')}`;
  type G = { id: string; name: string; monthly_fee: number | null; group_members: { student_id: string; students: { id: string; active: boolean; custom_fee: number | null; discount_pct: number } | null }[] };
  const rows: { org_id: string; student_id: string; group_id: string; period: string; amount: number; due_date: string; description: string }[] = [];
  let skipped = 0;
  for (const g of (groups ?? []) as unknown as G[]) {
    for (const m of g.group_members) {
      const st = m.students;
      if (!st || !st.active || have.has(`${st.id}:${g.id}`)) continue;
      const base = st.custom_fee ?? g.monthly_fee ?? ctx.org.default_fee;
      if (base === null || base === undefined) { skipped++; continue; }
      const amount = Math.round(Number(base) * (1 - Number(st.discount_pct || 0) / 100));
      rows.push({ org_id: ctx.org.id, student_id: st.id, group_id: g.id, period, amount, due_date: due, description: g.name });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from('charges').insert(rows);
    if (error) redirect(back(period, 'err=' + encodeURIComponent(error.message)));
  }
  revalidatePath('/uplate');
  const msg = rows.length ? `Napravljeno ${rows.length} zaduženja.` : 'Sva zaduženja za ovaj mesec već postoje.';
  redirect(back(period, 'ok=' + encodeURIComponent(msg + (skipped ? ` ${skipped} učenika preskočeno jer grupa nema cenu.` : ''))));
}

export async function addCharge(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const amount = money(fd.get('amount'));
  const studentId = String(fd.get('student_id') || '');
  if (!studentId || amount === null) redirect(back(period, 'err=' + encodeURIComponent('Izaberi učenika i unesi iznos.')));
  const supabase = await createClient();
  const { error } = await supabase.from('charges').insert({
    org_id: ctx.org.id, student_id: studentId, group_id: null, period, amount,
    description: String(fd.get('description') || '').trim() || 'Dodatno zaduženje',
    due_date: `${period}-${String(ctx.org.fee_due_day).padStart(2, '0')}`,
  });
  revalidatePath('/uplate');
  redirect(back(period, error ? 'err=' + encodeURIComponent(error.message.includes('duplicate') ? 'Ovaj učenik već ima dodatno zaduženje za mesec. Izmeni postojeće.' : error.message) : 'ok=' + encodeURIComponent('Zaduženje je dodato.')));
}

export async function recordPayment(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const chargeId = String(fd.get('charge_id'));
  const supabase = await createClient();
  const { data: ch } = await supabase.from('charges').select('id, student_id, amount, payments(amount)').eq('id', chargeId).eq('org_id', ctx.org.id).single();
  if (!ch) redirect(back(period, 'err=' + encodeURIComponent('Zaduženje nije pronađeno.')));
  const paid = (ch.payments ?? []).reduce((a: number, p: { amount: number }) => a + Number(p.amount), 0);
  const remaining = Math.max(0, Number(ch.amount) - paid);
  const amount = money(fd.get('amount')) ?? remaining;
  if (!(amount > 0)) redirect(back(period, 'err=' + encodeURIComponent('Zaduženje je već plaćeno.')));
  const method = ['cash', 'bank', 'card', 'other'].includes(String(fd.get('method'))) ? String(fd.get('method')) : 'bank';
  const { error } = await supabase.from('payments').insert({
    org_id: ctx.org.id, student_id: ch.student_id, charge_id: ch.id, amount, method,
    paid_at: String(fd.get('paid_at') || '') || todayISO(), note: String(fd.get('note') || '').trim() || null, created_by: ctx.userId,
  });
  revalidatePath('/uplate');
  redirect(back(period, error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Uplata je evidentirana.')) + (fd.get('filter') ? `&prikaz=${fd.get('filter')}` : ''));
}

export async function deletePayment(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const supabase = await createClient();
  await supabase.from('payments').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath('/uplate');
  redirect(back(period, 'ok=' + encodeURIComponent('Uplata je obrisana.')));
}

export async function updateCharge(fd: FormData) {
  const ctx = await requireOwner();
  const period = String(fd.get('period'));
  const amount = money(fd.get('amount'));
  const supabase = await createClient();
  if (fd.get('delete')) {
    await supabase.from('charges').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  } else if (amount !== null) {
    await supabase.from('charges').update({ amount }).eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  }
  revalidatePath('/uplate');
  redirect(back(period, 'ok=' + encodeURIComponent(fd.get('delete') ? 'Zaduženje je obrisano.' : 'Iznos je izmenjen.')));
}
