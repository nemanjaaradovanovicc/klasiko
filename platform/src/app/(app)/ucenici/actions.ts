'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { newToken } from '@/lib/parent';

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

function studentData(fd: FormData) {
  return {
    first_name: s(fd, 'first_name') ?? '',
    last_name: s(fd, 'last_name') ?? '',
    birth_date: s(fd, 'birth_date'),
    phone: s(fd, 'phone'),
    email: s(fd, 'email'),
    parent_name: s(fd, 'parent_name'),
    parent_phone: s(fd, 'parent_phone'),
    parent_email: s(fd, 'parent_email'),
    notes: s(fd, 'notes'),
    discount_pct: n(fd, 'discount_pct') ?? 0,
    custom_fee: n(fd, 'custom_fee'),
    joined_at: s(fd, 'joined_at') ?? undefined,
  };
}

export async function createStudent(fd: FormData) {
  const ctx = await requireOwner();
  const data = studentData(fd);
  if (!data.first_name) redirect('/ucenici/novi?err=' + encodeURIComponent('Unesi ime.'));
  const supabase = await createClient();
  const { data: st, error } = await supabase.from('students').insert({ ...data, org_id: ctx.org.id }).select('id').single();
  if (error || !st) redirect('/ucenici/novi?err=' + encodeURIComponent('Učenik nije sačuvan: ' + (error?.message ?? '')));
  const groupId = s(fd, 'group_id');
  if (groupId) await supabase.from('group_members').insert({ group_id: groupId, student_id: st.id, org_id: ctx.org.id });
  revalidatePath('/ucenici');
  redirect(fd.get('again') ? '/ucenici/novi?ok=1' : `/ucenici/${st.id}?ok=novi`);
}

export async function updateStudent(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('students').update(studentData(fd)).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/ucenici');
  redirect(`/ucenici/${id}?${error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'}`);
}

export async function setStudentActive(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  const active = fd.get('active') === '1';
  const supabase = await createClient();
  await supabase.from('students').update({ active, left_at: active ? null : new Date().toISOString().slice(0, 10) }).eq('id', id).eq('org_id', ctx.org.id);
  if (!active) await supabase.from('group_members').delete().eq('student_id', id).eq('org_id', ctx.org.id);
  revalidatePath('/ucenici');
  redirect(`/ucenici/${id}?ok=${active ? 'aktivan' : 'ispisan'}`);
}

export async function deleteStudent(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  const supabase = await createClient();
  await supabase.from('students').delete().eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/ucenici');
  redirect('/ucenici?ok=obrisan');
}

export async function addToGroup(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const groupId = String(fd.get('group_id'));
  const back = String(fd.get('back') || `/ucenici/${studentId}`);
  if (groupId) {
    const supabase = await createClient();
    await supabase.from('group_members').upsert({ group_id: groupId, student_id: studentId, org_id: ctx.org.id });
  }
  revalidatePath(back);
  redirect(back);
}

export async function removeFromGroup(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const groupId = String(fd.get('group_id'));
  const back = String(fd.get('back') || `/ucenici/${studentId}`);
  const supabase = await createClient();
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('student_id', studentId).eq('org_id', ctx.org.id);
  revalidatePath(back);
  redirect(back);
}

export type ImportRow = {
  first_name: string;
  last_name?: string;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  group?: string | null;
  notes?: string | null;
};

export async function importStudents(rows: ImportRow[]): Promise<{ ok?: number; groups?: number; error?: string }> {
  const ctx = await requireOwner();
  const clean = rows.filter((r) => r.first_name && String(r.first_name).trim()).slice(0, 2000);
  if (clean.length === 0) return { error: 'Nema redova sa imenom.' };
  const supabase = await createClient();
  const { data: groups } = await supabase.from('groups').select('id,name').eq('org_id', ctx.org.id);
  const byName = new Map((groups ?? []).map((g) => [g.name.trim().toLowerCase(), g.id]));
  let newGroups = 0;
  for (const r of clean) {
    const g = r.group?.trim();
    if (g && !byName.has(g.toLowerCase())) {
      const { data: ng } = await supabase.from('groups').insert({ org_id: ctx.org.id, name: g }).select('id').single();
      if (ng) {
        byName.set(g.toLowerCase(), ng.id);
        newGroups++;
      }
    }
  }
  const payload = clean.map((r) => ({
    org_id: ctx.org.id,
    first_name: String(r.first_name).trim(),
    last_name: (r.last_name ?? '').toString().trim(),
    birth_date: r.birth_date || null,
    phone: r.phone || null,
    email: r.email || null,
    parent_name: r.parent_name || null,
    parent_phone: r.parent_phone || null,
    parent_email: r.parent_email || null,
    notes: r.notes || null,
  }));
  const { data: inserted, error } = await supabase.from('students').insert(payload).select('id');
  if (error || !inserted) return { error: 'Uvoz nije uspeo: ' + (error?.message ?? '') };
  const members = inserted
    .map((st, i) => ({ st, g: clean[i].group?.trim().toLowerCase() }))
    .filter((x) => x.g && byName.has(x.g))
    .map((x) => ({ group_id: byName.get(x.g!)!, student_id: x.st.id, org_id: ctx.org.id }));
  if (members.length) await supabase.from('group_members').insert(members);
  revalidatePath('/ucenici');
  return { ok: inserted.length, groups: newGroups };
}

// Link za roditelje: novi token (stari se poništava).
export async function createParentLink(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  const { data: st } = await supabase.from('students').select('id').eq('id', studentId).eq('org_id', ctx.org.id).single();
  if (!st) redirect('/ucenici');
  await supabase.from('parent_links').update({ revoked: true }).eq('student_id', studentId).eq('org_id', ctx.org.id);
  await supabase.from('parent_links').insert({ token: newToken(), student_id: studentId, org_id: ctx.org.id });
  revalidatePath(`/ucenici/${studentId}`);
  redirect(`/ucenici/${studentId}?ok=link#roditelj`);
}

export async function revokeParentLink(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  await supabase.from('parent_links').update({ revoked: true }).eq('student_id', studentId).eq('org_id', ctx.org.id);
  revalidatePath(`/ucenici/${studentId}`);
  redirect(`/ucenici/${studentId}?ok=ugasen#roditelj`);
}

// Napravi linkove za sve aktivne učenike koji ih nemaju (za slanje izveštaja i podsetnika).
export async function createAllParentLinks() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const [{ data: sts }, { data: links }] = await Promise.all([
    supabase.from('students').select('id').eq('org_id', ctx.org.id).eq('active', true),
    supabase.from('parent_links').select('student_id').eq('org_id', ctx.org.id).eq('revoked', false),
  ]);
  const have = new Set((links ?? []).map((l) => l.student_id));
  const rows = (sts ?? []).filter((s) => !have.has(s.id)).map((s) => ({ token: newToken(), student_id: s.id, org_id: ctx.org.id }));
  if (rows.length) await supabase.from('parent_links').insert(rows);
  revalidatePath('/roditelji');
  redirect('/roditelji?ok=' + encodeURIComponent(rows.length ? `Napravljeno ${rows.length} linkova.` : 'Svi učenici već imaju link.'));
}
