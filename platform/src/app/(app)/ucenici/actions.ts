'use server';

import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { newToken } from '@/lib/parent';
import { isISODate, todayISO } from '@/lib/format';
import { studentLimitError } from '@/lib/plan';
import { freeSeats } from '@/lib/groups';
import { norm } from '@/lib/match';
import { phoneKey } from '@/lib/phone';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { familySuggestions, type FamilyCandidate } from '@/lib/families';
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
function safeBack(v: FormDataEntryValue | null, fallback: string): string {
  const b = String(v || '');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
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
    discount_pct: Math.min(100, Math.max(0, n(fd, 'discount_pct') ?? 0)),
    custom_fee: n(fd, 'custom_fee'),
    joined_at: s(fd, 'joined_at') ?? undefined,
  };
}

export async function createStudent(fd: FormData) {
  const ctx = await requireOwner();
  const data = studentData(fd);
  // Upis posle probnog časa: forma nosi id probnog, pa greška vraća na istu, popunjenu formu.
  const trialRaw = s(fd, 'trial_id');
  const trialId = trialRaw && /^[0-9a-f-]{36}$/i.test(trialRaw) ? trialRaw : null;
  const formErr = (message: string) => `/ucenici/novi?${trialId ? `probni=${trialId}&` : ''}err=` + encodeURIComponent(message);
  if (!data.first_name) redirect(formErr('Unesi ime.'));
  const supabase = await createClient();
  const limit = await studentLimitError(supabase, ctx.org, 1, ctx.isSuper);
  if (limit) redirect(formErr(limit));
  const { data: st, error } = await supabase.from('students').insert({ ...data, org_id: ctx.org.id }).select('id').single();
  if (error || !st) redirect(formErr('Učenik nije sačuvan: ' + (error?.message ?? '')));
  if (trialId) {
    // Probni čas dobija ishod „upisao/la se” i vezu sa kartonom. Datum ranije upisanog ishoda se ne menja.
    const { data: trial } = await supabase.from('trial_lessons').select('outcome, outcome_at').eq('id', trialId).eq('org_id', ctx.org.id).maybeSingle();
    if (trial) {
      await supabase.from('trial_lessons').update({ student_id: st.id, outcome: 'enrolled', outcome_at: trial.outcome === 'enrolled' && trial.outcome_at ? trial.outcome_at : todayISO() }).eq('id', trialId).eq('org_id', ctx.org.id);
      revalidatePath('/probni');
    }
  }
  const groupId = s(fd, 'group_id');
  let waitlisted = false;
  if (groupId) {
    const free = await freeSeats(supabase, groupId, ctx.org.id);
    if (free === 0) {
      await supabase.from('group_waitlist').insert({ group_id: groupId, student_id: st.id, org_id: ctx.org.id });
      waitlisted = true;
    } else {
      await supabase.from('group_members').insert({ group_id: groupId, student_id: st.id, org_id: ctx.org.id });
    }
  }
  revalidatePath('/ucenici');
  redirect(fd.get('again') ? '/ucenici/novi?ok=1' : `/ucenici/${st.id}?ok=${waitlisted ? 'cekanje' : 'novi'}`);
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
  if (active) {
    const limit = await studentLimitError(supabase, ctx.org, 1, ctx.isSuper);
    if (limit) redirect(`/ucenici/${id}?err=` + encodeURIComponent(limit));
  }
  const { error } = await supabase.from('students').update({ active, left_at: active ? null : todayISO() }).eq('id', id).eq('org_id', ctx.org.id);
  if (error) redirect(`/ucenici/${id}?err=` + encodeURIComponent(error.message));
  if (!active) {
    await supabase.from('group_members').delete().eq('student_id', id).eq('org_id', ctx.org.id);
    await supabase.from('group_waitlist').delete().eq('student_id', id).eq('org_id', ctx.org.id);
    // Ispisan učenik: link za roditelje prestaje da važi.
    await supabase.from('parent_links').update({ revoked: true }).eq('student_id', id).eq('org_id', ctx.org.id);
  }
  revalidatePath('/ucenici');
  redirect(`/ucenici/${id}?ok=${active ? 'aktivan' : 'ispisan'}`);
}

export async function deleteStudent(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id'));
  if (String(fd.get('confirm') || '') !== 'OBRIŠI') redirect(`/ucenici/${id}?err=` + encodeURIComponent('Za trajno brisanje upiši OBRIŠI.'));
  const supabase = await createClient();
  const { data: st } = await supabase.from('students').select('first_name, last_name').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  const { error } = await supabase.from('students').delete().eq('id', id).eq('org_id', ctx.org.id);
  if (error) redirect(`/ucenici/${id}?err=` + encodeURIComponent(error.message));
  await audit({ userId: ctx.userId, email: ctx.email }, 'student.delete', { orgId: ctx.org.id, target: st ? `${st.first_name} ${st.last_name}`.trim() : id });
  revalidatePath('/ucenici');
  redirect('/ucenici?ok=obrisan');
}

export async function addToGroup(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const groupId = String(fd.get('group_id'));
  const back = safeBack(fd.get('back'), `/ucenici/${studentId}`);
  if (groupId) {
    const supabase = await createClient();
    const free = await freeSeats(supabase, groupId, ctx.org.id);
    if (free === 0) {
      await supabase.from('group_waitlist').upsert({ group_id: groupId, student_id: studentId, org_id: ctx.org.id });
      revalidatePath(back);
      redirect(`${back}${back.includes('?') ? '&' : '?'}ok=cekanje`);
    }
    await supabase.from('group_members').upsert({ group_id: groupId, student_id: studentId, org_id: ctx.org.id });
    await supabase.from('group_waitlist').delete().eq('group_id', groupId).eq('student_id', studentId);
  }
  revalidatePath(back);
  redirect(back);
}

export async function removeFromGroup(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const groupId = String(fd.get('group_id'));
  const back = safeBack(fd.get('back'), `/ucenici/${studentId}`);
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

// Isti učenik: isto ime i prezime, a datum rođenja ili telefon roditelja se slažu (ili ih nema).
function importKey(r: { first_name: string; last_name?: string | null }) {
  return `${norm(r.first_name)}|${norm(r.last_name ?? '')}`;
}
type Known = { birth: string | null; phone: string };
function sameStudent(a: Known, b: Known) {
  if (a.birth && b.birth) return a.birth === b.birth;
  if (a.phone && b.phone) return a.phone === b.phone;
  return true;
}

export async function importStudents(rows: ImportRow[]): Promise<{ ok?: number; groups?: number; duplicates?: number; error?: string }> {
  const ctx = await requireOwner();
  const clean = rows.filter((r) => r.first_name && String(r.first_name).trim()).slice(0, 2000);
  if (clean.length === 0) return { error: 'Nema redova sa imenom.' };
  const supabase = await createClient();

  const existing = await fetchAll<{ id: string; first_name: string; last_name: string; birth_date: string | null; parent_phone: string | null; phone: string | null }>((a, b) => supabase.from('students').select('id, first_name, last_name, birth_date, parent_phone, phone').eq('org_id', ctx.org.id).order('id').range(a, b));
  const known = new Map<string, Known[]>();
  const remember = (key: string, k: Known) => known.set(key, [...(known.get(key) ?? []), k]);
  for (const e of existing) remember(importKey(e), { birth: e.birth_date, phone: phoneKey(e.parent_phone || e.phone) });
  const fresh: ImportRow[] = [];
  let duplicates = 0;
  for (const r of clean) {
    const key = importKey(r);
    const me: Known = { birth: isISODate(r.birth_date) ? r.birth_date : null, phone: phoneKey(r.parent_phone || r.phone) };
    if ((known.get(key) ?? []).some((k) => sameStudent(k, me))) { duplicates++; continue; }
    remember(key, me);
    fresh.push(r);
  }
  if (fresh.length === 0) return { ok: 0, groups: 0, duplicates };

  const limit = await studentLimitError(supabase, ctx.org, fresh.length, ctx.isSuper);
  if (limit) return { error: limit };

  const { data: groups } = await supabase.from('groups').select('id,name').eq('org_id', ctx.org.id);
  const byName = new Map((groups ?? []).map((g) => [g.name.trim().toLowerCase(), g.id]));
  let newGroups = 0;
  for (const r of fresh) {
    const g = r.group?.trim();
    if (g && !byName.has(g.toLowerCase())) {
      const { data: ng } = await supabase.from('groups').insert({ org_id: ctx.org.id, name: g }).select('id').single();
      if (ng) {
        byName.set(g.toLowerCase(), ng.id);
        newGroups++;
      }
    }
  }
  const payload = fresh.map((r) => ({
    org_id: ctx.org.id,
    first_name: String(r.first_name).trim(),
    last_name: (r.last_name ?? '').toString().trim(),
    birth_date: isISODate(r.birth_date) ? r.birth_date : null,
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
    .map((st, i) => ({ st, g: fresh[i].group?.trim().toLowerCase() }))
    .filter((x) => x.g && byName.has(x.g))
    .map((x) => ({ group_id: byName.get(x.g!)!, student_id: x.st.id, org_id: ctx.org.id }));
  if (members.length) {
    const { error: mErr } = await supabase.from('group_members').insert(members);
    if (mErr) return { ok: inserted.length, groups: newGroups, duplicates, error: 'Učenici su uvezeni, ali nisu dodati u grupe: ' + mErr.message };
  }
  revalidatePath('/ucenici');
  return { ok: inserted.length, groups: newGroups, duplicates };
}

// ---------- Link za roditelje ----------

// Svi učenici iz iste porodice dele jedan link, pa novi link poništava stare za celu porodicu.
async function familyMembers(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, studentId: string): Promise<string[]> {
  const { data: st } = await supabase.from('students').select('id, family_id').eq('id', studentId).eq('org_id', orgId).maybeSingle();
  if (!st) return [];
  if (!st.family_id) return [st.id];
  const { data } = await supabase.from('students').select('id').eq('org_id', orgId).eq('family_id', st.family_id);
  return (data ?? []).map((x) => x.id);
}

export async function createParentLink(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  const ids = await familyMembers(supabase, ctx.org.id, studentId);
  if (ids.length === 0) redirect('/ucenici');
  await supabase.from('parent_links').update({ revoked: true }).in('student_id', ids).eq('org_id', ctx.org.id);
  await supabase.from('parent_links').insert({ token: newToken(), student_id: studentId, org_id: ctx.org.id });
  revalidatePath(`/ucenici/${studentId}`);
  redirect(`/ucenici/${studentId}?ok=link#roditelj`);
}

export async function revokeParentLink(fd: FormData) {
  const ctx = await requireOwner();
  const studentId = String(fd.get('student_id'));
  const supabase = await createClient();
  const ids = await familyMembers(supabase, ctx.org.id, studentId);
  await supabase.from('parent_links').update({ revoked: true }).in('student_id', ids.length ? ids : [studentId]).eq('org_id', ctx.org.id);
  revalidatePath(`/ucenici/${studentId}`);
  redirect(`/ucenici/${studentId}?ok=ugasen#roditelj`);
}

// Napravi linkove za sve aktivne učenike koji ih nemaju. Porodica dobija jedan link.
export async function createAllParentLinks() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const [sts, links] = await Promise.all([
    fetchAll<{ id: string; family_id: string | null }>((a, b) => supabase.from('students').select('id, family_id').eq('org_id', ctx.org.id).eq('active', true).order('id').range(a, b)),
    fetchAll<{ token: string; student_id: string }>((a, b) => supabase.from('parent_links').select('token, student_id').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)),
  ]);
  const have = new Set(links.map((l) => l.student_id));
  const famHave = new Set(sts.filter((x) => x.family_id && have.has(x.id)).map((x) => x.family_id));
  const rows: { token: string; student_id: string; org_id: string }[] = [];
  for (const st of sts) {
    if (have.has(st.id)) continue;
    if (st.family_id) {
      if (famHave.has(st.family_id)) continue;
      famHave.add(st.family_id);
    }
    rows.push({ token: newToken(), student_id: st.id, org_id: ctx.org.id });
  }
  if (rows.length) await supabase.from('parent_links').insert(rows);
  revalidatePath('/roditelji');
  redirect('/roditelji?ok=' + encodeURIComponent(rows.length ? `Napravljeno ${rows.length} linkova.` : 'Svi učenici već imaju link.'));
}

// ---------- Porodice ----------

// Spaja učenike u porodicu. Ako neko već ima porodicu, ostali mu se pridružuju.
export async function linkFamily(fd: FormData) {
  const ctx = await requireOwner();
  const ids = fd.getAll('student_id').map(String).filter(Boolean);
  const back = safeBack(fd.get('back'), '/roditelji');
  if (ids.length < 2) redirect(back);
  const supabase = await createClient();
  const { data } = await supabase.from('students').select('id, family_id').eq('org_id', ctx.org.id).in('id', ids);
  const rows = data ?? [];
  const familyId = rows.find((r) => r.family_id)?.family_id ?? randomUUID();
  await supabase.from('students').update({ family_id: familyId }).eq('org_id', ctx.org.id).in('id', rows.map((r) => r.id));
  // Porodica posle spajanja zadržava jedan link: najnoviji ostaje, ostali se gase.
  const { data: links } = await supabase.from('parent_links').select('token, student_id, created_at').eq('org_id', ctx.org.id).eq('revoked', false).in('student_id', rows.map((r) => r.id)).order('created_at', { ascending: false });
  const stale = (links ?? []).slice(1).map((l) => l.token);
  if (stale.length) await supabase.from('parent_links').update({ revoked: true }).in('token', stale);
  revalidatePath('/roditelji');
  revalidatePath('/ucenici');
  redirect(`${back}${back.includes('?') ? '&' : '?'}ok=` + encodeURIComponent('Povezano. Roditelj sada vidi svu decu na jednom linku.'));
}

export async function unlinkFamily(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('student_id'));
  const supabase = await createClient();
  await supabase.from('students').update({ family_id: null }).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath(`/ucenici/${id}`);
  redirect(`/ucenici/${id}?ok=1`);
}

// Sve očigledne porodice odjednom (isti telefon ili email roditelja).
export async function linkAllSuggestedFamilies() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const sts = await fetchAll<FamilyCandidate>((a, b) => supabase.from('students').select('id, first_name, last_name, parent_phone, parent_email, family_id').eq('org_id', ctx.org.id).eq('active', true).order('id').range(a, b));
  let linked = 0;
  for (const list of familySuggestions(sts)) {
    const familyId = list.find((x) => x.family_id)?.family_id ?? randomUUID();
    await supabase.from('students').update({ family_id: familyId }).eq('org_id', ctx.org.id).in('id', list.map((x) => x.id));
    const { data: links } = await supabase.from('parent_links').select('token').eq('org_id', ctx.org.id).eq('revoked', false).in('student_id', list.map((x) => x.id)).order('created_at', { ascending: false });
    const stale = (links ?? []).slice(1).map((l) => l.token);
    if (stale.length) await supabase.from('parent_links').update({ revoked: true }).in('token', stale);
    linked++;
  }
  revalidatePath('/roditelji');
  redirect('/roditelji?ok=' + encodeURIComponent(linked ? `Povezano porodica: ${linked}.` : 'Nema novih porodica za povezivanje.'));
}

