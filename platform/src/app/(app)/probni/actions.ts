'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isISODate, todayISO } from '@/lib/format';
import { isTrialOutcome } from '@/lib/trials';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(fd: FormData, key: string, max: number): string | null {
  const v = String(fd.get(key) ?? '').trim().slice(0, max);
  return v === '' ? null : v;
}
function safeBack(v: FormDataEntryValue | null): string {
  const b = String(v || '');
  return b === '/probni' || b.startsWith('/probni?') ? b : '/probni';
}
const withParam = (back: string, param: string) => `${back}${back.includes('?') ? '&' : '?'}${param}`;
function fail(back: string, message: string): never {
  return redirect(withParam(back, 'err=' + encodeURIComponent(message)));
}

function refresh() {
  revalidatePath('/probni');
  revalidatePath('/izvestaji');
}

// Upis novog probnog časa ili izmena postojećeg (kad forma pošalje id).
export async function saveTrial(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get('id') || '');
  const date = String(fd.get('date') || '');
  const startRaw = String(fd.get('start_time') || '');
  const firstName = text(fd, 'first_name', 80);
  const formBack = id && UUID.test(id) ? `/probni?izmeni=${id}` : '/probni';
  if (id && !UUID.test(id)) fail('/probni', 'Probni čas nije pronađen.');
  if (!isISODate(date)) fail(formBack, 'Unesi datum probnog časa.');
  if (startRaw && !/^\d{2}:\d{2}$/.test(startRaw)) fail(formBack, 'Vreme nije ispravno.');
  if (!firstName) fail(formBack, 'Unesi ime kandidata.');
  const supabase = await createClient();

  // Probni čas se vodi na onoga ko ga je držao: predavač na sebe, a vlasnik bira predavača.
  let teacherId: string = ctx.userId;
  if (ctx.isOwner) {
    const chosen = String(fd.get('teacher_id') || '');
    const { data: t } = UUID.test(chosen) ? await supabase.from('profiles').select('id').eq('id', chosen).eq('org_id', ctx.org.id).maybeSingle() : { data: null };
    if (!t) fail(formBack, 'Izaberi ko je držao probni čas.');
    teacherId = chosen;
  }

  let groupId: string | null = String(fd.get('group_id') || '') || null;
  if (groupId) {
    const { data: g } = UUID.test(groupId) ? await supabase.from('groups').select('id').eq('id', groupId).eq('org_id', ctx.org.id).maybeSingle() : { data: null };
    if (!g) groupId = null;
  }

  const row = {
    date,
    start_time: startRaw || null,
    teacher_id: teacherId,
    group_id: groupId,
    first_name: firstName,
    last_name: text(fd, 'last_name', 80) ?? '',
    phone: text(fd, 'phone', 40),
    email: text(fd, 'email', 160),
    note: text(fd, 'note', 1000),
  };
  const month = `/probni?mesec=${date.slice(0, 7)}`;
  if (id) {
    const { data, error } = await supabase.from('trial_lessons').update(row).eq('id', id).eq('org_id', ctx.org.id).select('id');
    if (error || !data?.length) fail(formBack, 'Izmene nisu sačuvane. Možeš da menjaš samo svoje probne časove.');
    refresh();
    redirect(`${month}&ok=izmena`);
  }
  const { error } = await supabase.from('trial_lessons').insert({ ...row, org_id: ctx.org.id, created_by: ctx.userId });
  if (error) fail(formBack, 'Probni čas nije sačuvan. Pokušaj ponovo.');
  refresh();
  redirect(`${month}&ok=upisan`);
}

// Ishod posle probnog časa: upisao/la se, nije se upisao/la ili ponovo čeka odluku.
export async function setTrialOutcome(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get('id') || '');
  const outcome = fd.get('outcome');
  const back = safeBack(fd.get('back'));
  if (!UUID.test(id) || !isTrialOutcome(outcome)) fail(back, 'Ishod nije sačuvan.');
  const supabase = await createClient();
  const change: Record<string, string | null> = { outcome: outcome as string, outcome_at: outcome === 'pending' ? null : todayISO() };
  // Ko se nije upisao, nije ni učenik: veza sa kartonom se skida (to sme samo vlasnik, baza čuva vezu ako menja predavač).
  if (outcome === 'declined' && ctx.isOwner) change.student_id = null;
  const { data, error } = await supabase.from('trial_lessons').update(change).eq('id', id).eq('org_id', ctx.org.id).select('id');
  if (error || !data?.length) fail(back, 'Ishod nije sačuvan. Možeš da menjaš samo svoje probne časove.');
  refresh();
  redirect(withParam(back, 'ok=ishod'));
}

export async function deleteTrial(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get('id') || '');
  const back = safeBack(fd.get('back'));
  if (!UUID.test(id)) fail(back, 'Probni čas nije pronađen.');
  const supabase = await createClient();
  const { data, error } = await supabase.from('trial_lessons').delete().eq('id', id).eq('org_id', ctx.org.id).select('id');
  if (error || !data?.length) fail(back, ctx.isOwner ? 'Probni čas nije obrisan.' : 'Probni čas sa upisanim ishodom može da obriše samo vlasnik.');
  refresh();
  redirect(withParam(back, 'ok=obrisan'));
}
