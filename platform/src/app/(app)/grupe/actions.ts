'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
}
function n(fd: FormData, k: string): number | null {
  const v = s(fd, k);
  if (v === null) return null;
  const x = Number(v.replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}
function groupData(fd: FormData) {
  return {
    name: s(fd, 'name') ?? '',
    level: s(fd, 'level'),
    teacher_id: s(fd, 'teacher_id'),
    room_id: s(fd, 'room_id'),
    monthly_fee: n(fd, 'monthly_fee'),
    capacity: n(fd, 'capacity'),
    color: s(fd, 'color') ?? '#5B2A86',
  };
}

export async function createGroup(fd: FormData) {
  const ctx = await requireOwner();
  const data = groupData(fd);
  if (!data.name) redirect('/grupe/nova?err=' + encodeURIComponent('Unesi naziv grupe.'));
  const supabase = await createClient();
  const { data: g, error } = await supabase.from('groups').insert({ ...data, org_id: ctx.org.id }).select('id').single();
  if (error || !g) redirect('/grupe/nova?err=' + encodeURIComponent(error?.message ?? 'Greška'));
  const wd = n(fd, 'weekday');
  const st = s(fd, 'start_time');
  const et = s(fd, 'end_time');
  if (wd && st && et) await supabase.from('schedule_slots').insert({ org_id: ctx.org.id, group_id: g.id, weekday: wd, start_time: st, end_time: et, room_id: data.room_id });
  revalidatePath('/grupe');
  redirect(`/grupe/${g.id}?ok=nova`);
}

export async function updateGroup(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('groups').update(groupData(fd)).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/grupe');
  redirect(`/grupe/${id}?${error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'}`);
}

export async function setGroupActive(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  const supabase = await createClient();
  await supabase.from('groups').update({ active: fd.get('active') === '1' }).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/grupe');
  redirect(`/grupe/${id}?ok=1`);
}

export async function deleteGroup(fd: FormData) {
  const ctx = await requireOwner();
  const supabase = await createClient();
  await supabase.from('groups').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath('/grupe');
  redirect('/grupe?ok=obrisana');
}

export async function addSlot(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const wd = n(fd, 'weekday');
  const st = s(fd, 'start_time');
  const et = s(fd, 'end_time');
  if (!wd || !st || !et || et <= st) redirect(`/grupe/${groupId}?err=` + encodeURIComponent('Proveri dan i vreme (kraj mora biti posle početka).'));
  const supabase = await createClient();
  await supabase.from('schedule_slots').insert({ org_id: ctx.org.id, group_id: groupId, weekday: wd, start_time: st, end_time: et, room_id: s(fd, 'room_id') });
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}?ok=termin`);
}

export async function deleteSlot(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const supabase = await createClient();
  await supabase.from('schedule_slots').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}`);
}

export async function addMembers(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const ids = fd.getAll('student_id').map(String).filter(Boolean);
  if (ids.length) {
    const supabase = await createClient();
    await supabase.from('group_members').upsert(ids.map((sid) => ({ group_id: groupId, student_id: sid, org_id: ctx.org.id })));
  }
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}?ok=clanovi`);
}
