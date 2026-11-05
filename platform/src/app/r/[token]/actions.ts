'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays, isISODate, todayISO } from '@/lib/format';
import { clientIp, isThrottled, recordAttempt } from '@/lib/throttle';

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

async function studentsOfLink(token: string): Promise<{ orgId: string; ids: string[] } | null> {
  if (!TOKEN.test(token)) return null;
  const db = createAdminClient();
  const { data: link } = await db.from('parent_links').select('student_id, org_id, revoked, expires_at').eq('token', token).maybeSingle();
  if (!link || link.revoked || new Date(link.expires_at) < new Date()) return null;
  const { data: st } = await db.from('students').select('id, org_id, family_id').eq('id', link.student_id).eq('org_id', link.org_id).maybeSingle();
  if (!st) return null;
  if (!st.family_id) return { orgId: link.org_id, ids: [st.id] };
  const { data: fam } = await db.from('students').select('id').eq('org_id', link.org_id).eq('family_id', st.family_id).eq('active', true);
  return { orgId: link.org_id, ids: (fam ?? []).map((x) => x.id) };
}

// Roditelj javlja izostanak unapred. Školi se prikazuje na početnoj i pri upisu prisustva.
export async function reportAbsence(fd: FormData) {
  const token = String(fd.get('token') || '');
  const back = `/r/${token}`;
  const access = await studentsOfLink(token);
  if (!access) redirect('/login');
  const studentId = String(fd.get('student_id') || '');
  const date = String(fd.get('date') || '');
  const note = String(fd.get('note') || '').trim().slice(0, 300);
  const today = todayISO();
  if (!access.ids.includes(studentId) || !isISODate(date) || date < today || date > addDays(today, 60)) redirect(`${back}?greska=datum#izostanak`);
  const key = `absence:${token.slice(0, 16)}:${await clientIp()}`;
  if (await isThrottled(key, 20, 60)) redirect(`${back}?greska=pokusaji#izostanak`);
  await recordAttempt(key);
  const db = createAdminClient();
  const { error } = await db.from('absence_notices').upsert({ org_id: access.orgId, student_id: studentId, date, note: note || null }, { onConflict: 'student_id,date' });
  revalidatePath(back);
  redirect(`${back}?${error ? 'greska=upis' : 'javljeno=1'}#izostanak`);
}

export async function cancelAbsence(fd: FormData) {
  const token = String(fd.get('token') || '');
  const access = await studentsOfLink(token);
  if (!access) redirect('/login');
  const db = createAdminClient();
  await db.from('absence_notices').delete().eq('id', String(fd.get('id'))).in('student_id', access.ids).eq('org_id', access.orgId);
  revalidatePath(`/r/${token}`);
  redirect(`/r/${token}#izostanak`);
}
