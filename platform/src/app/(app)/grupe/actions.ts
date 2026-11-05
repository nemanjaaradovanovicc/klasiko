'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { freeSeats, slotConflicts, type SlotLike } from '@/lib/groups';
import { audit } from '@/lib/audit';

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
  const fee = s(fd, 'fee_type');
  return {
    name: s(fd, 'name') ?? '',
    level: s(fd, 'level'),
    teacher_id: s(fd, 'teacher_id'),
    room_id: s(fd, 'room_id'),
    monthly_fee: n(fd, 'monthly_fee'),
    capacity: n(fd, 'capacity'),
    color: s(fd, 'color') ?? '#5B2A86',
    fee_type: fee === 'package' || fee === 'manual' ? fee : 'monthly',
    package_classes: fee === 'package' ? n(fd, 'package_classes') : null,
  };
}

// Upozorenje ako se novi termin preklapa sa drugim terminom iste sale ili predavača.
async function conflictsFor(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, groupId: string, slot: { weekday: number; start_time: string; end_time: string; room_id: string | null }): Promise<string[]> {
  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase.from('schedule_slots').select('weekday, start_time, end_time, room_id, group_id, groups!inner(name, teacher_id, room_id, active)').eq('org_id', orgId).eq('weekday', slot.weekday).eq('groups.active', true).neq('group_id', groupId),
    supabase.from('groups').select('teacher_id, room_id').eq('id', groupId).eq('org_id', orgId).maybeSingle(),
  ]);
  type R = { weekday: number; start_time: string; end_time: string; room_id: string | null; groups: { name: string; teacher_id: string | null; room_id: string | null } };
  const others: SlotLike[] = ((rows ?? []) as unknown as R[]).map((r) => ({ weekday: r.weekday, start_time: r.start_time, end_time: r.end_time, room_id: r.room_id ?? r.groups.room_id, teacher_id: r.groups.teacher_id, group_name: r.groups.name }));
  return slotConflicts({ ...slot, room_id: slot.room_id ?? me?.room_id ?? null, teacher_id: me?.teacher_id ?? null }, others);
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
  let warn = '';
  if (wd && st && et && et > st) {
    await supabase.from('schedule_slots').insert({ org_id: ctx.org.id, group_id: g.id, weekday: wd, start_time: st, end_time: et, room_id: data.room_id });
    const c = await conflictsFor(supabase, ctx.org.id, g.id, { weekday: wd, start_time: st, end_time: et, room_id: data.room_id });
    if (c.length) warn = '&err=' + encodeURIComponent('Grupa je napravljena, ali se termin preklapa: ' + c.join('; ') + '.');
  }
  revalidatePath('/grupe');
  redirect(`/grupe/${g.id}?ok=nova${warn}`);
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
  const { error } = await supabase.from('groups').update({ active: fd.get('active') === '1' }).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/grupe');
  redirect(`/grupe/${id}?${error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'}`);
}

export async function deleteGroup(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  if (String(fd.get('confirm') || '') !== 'OBRIŠI') redirect(`/grupe/${id}?err=` + encodeURIComponent('Za trajno brisanje upiši OBRIŠI.'));
  const supabase = await createClient();
  const { data: g } = await supabase.from('groups').select('name').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  const { error } = await supabase.from('groups').delete().eq('id', id).eq('org_id', ctx.org.id);
  if (error) redirect(`/grupe/${id}?err=` + encodeURIComponent(error.message));
  await audit({ userId: ctx.userId, email: ctx.email }, 'group.delete', { orgId: ctx.org.id, target: g?.name ?? id });
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
  const roomId = s(fd, 'room_id');
  const { error } = await supabase.from('schedule_slots').insert({ org_id: ctx.org.id, group_id: groupId, weekday: wd, start_time: st, end_time: et, room_id: roomId });
  if (error) redirect(`/grupe/${groupId}?err=` + encodeURIComponent(error.message));
  const c = await conflictsFor(supabase, ctx.org.id, groupId, { weekday: wd, start_time: st, end_time: et, room_id: roomId });
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}?` + (c.length ? 'err=' + encodeURIComponent('Termin je dodat, ali se preklapa: ' + c.join('; ') + '.') : 'ok=termin'));
}

export async function deleteSlot(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const supabase = await createClient();
  await supabase.from('schedule_slots').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}`);
}

// Dodaje učenike dok ima mesta. Ostali idu na listu čekanja.
export async function addMembers(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const ids = fd.getAll('student_id').map(String).filter(Boolean);
  let waiting = 0;
  if (ids.length) {
    const supabase = await createClient();
    const free = await freeSeats(supabase, groupId, ctx.org.id);
    const seat = free === null ? ids : ids.slice(0, free);
    const wait = free === null ? [] : ids.slice(free);
    waiting = wait.length;
    if (seat.length) await supabase.from('group_members').upsert(seat.map((sid) => ({ group_id: groupId, student_id: sid, org_id: ctx.org.id })));
    if (wait.length) await supabase.from('group_waitlist').upsert(wait.map((sid) => ({ group_id: groupId, student_id: sid, org_id: ctx.org.id })));
  }
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}?ok=${waiting ? 'cekanje' : 'clanovi'}`);
}

// Upis sa liste čekanja kad se oslobodi mesto.
export async function promoteFromWaitlist(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  const free = await freeSeats(supabase, groupId, ctx.org.id);
  if (free === 0) redirect(`/grupe/${groupId}?err=` + encodeURIComponent('Grupa je i dalje popunjena.'));
  const { error } = await supabase.from('group_members').upsert({ group_id: groupId, student_id: studentId, org_id: ctx.org.id });
  if (error) redirect(`/grupe/${groupId}?err=` + encodeURIComponent(error.message));
  await supabase.from('group_waitlist').delete().eq('group_id', groupId).eq('student_id', studentId).eq('org_id', ctx.org.id);
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}?ok=clanovi`);
}

export async function removeFromWaitlist(fd: FormData) {
  const ctx = await requireOwner();
  const groupId = String(fd.get('group_id'));
  const supabase = await createClient();
  await supabase.from('group_waitlist').delete().eq('group_id', groupId).eq('student_id', String(fd.get('student_id'))).eq('org_id', ctx.org.id);
  revalidatePath(`/grupe/${groupId}`);
  redirect(`/grupe/${groupId}`);
}
