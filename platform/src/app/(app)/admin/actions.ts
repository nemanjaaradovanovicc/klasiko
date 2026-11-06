'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuper, ORG_COOKIE } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays, todayISO } from '@/lib/format';
import { createOrgUser, resetUserPassword, setActive, tempPassword, type Creds } from '@/lib/users';
import { audit } from '@/lib/audit';


function str(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
}

const who = (ctx: { userId: string; email: string }) => ({ userId: ctx.userId, email: ctx.email });

export async function enterOrg(formData: FormData) {
  const ctx = await requireSuper();
  const id = String(formData.get('org_id') || '');
  await audit(who(ctx), 'admin.enter_org', { orgId: id });
  (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 8 });
  redirect('/');
}

export async function exitOrg() {
  await requireSuper();
  (await cookies()).delete(ORG_COOKIE);
  redirect('/admin');
}

// Nova škola + nalog vlasnika sa privremenom lozinkom.
export async function createOrg(_: Creds | undefined, fd: FormData): Promise<Creds> {
  const ctx = await requireSuper();
  const name = str(fd, 'name');
  const ownerName = str(fd, 'owner_name');
  const email = str(fd, 'owner_email')?.toLowerCase();
  if (!name || !ownerName || !email) return { error: 'Popuni naziv škole, ime i email vlasnika.' };
  const db = createAdminClient();
  const trialDays = Math.max(0, Number(fd.get('trial_days') || 14) || 14);

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({
      name,
      kind: str(fd, 'kind') ?? 'ostalo',
      city: str(fd, 'city'),
      phone: str(fd, 'phone'),
      email,
      plan: str(fd, 'plan') ?? 'start',
      status: 'trial',
      trial_ends_at: addDays(todayISO(), trialDays),
      source: 'admin',
      admin_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (orgErr || !org) return { error: 'Škola nije napravljena: ' + (orgErr?.message ?? '') };

  const password = tempPassword();
  const { data: created, error: userErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: ownerName } });
  if (userErr || !created.user) {
    await db.from('organizations').delete().eq('id', org.id);
    return { error: userErr?.message?.includes('already') ? 'Korisnik sa tim emailom već postoji.' : 'Nalog nije napravljen: ' + (userErr?.message ?? '') };
  }
  const { error: profErr } = await db.from('profiles').upsert({ id: created.user.id, org_id: org.id, role: 'owner', full_name: ownerName, email, phone: str(fd, 'phone'), must_change_password: true });
  if (profErr) {
    await db.auth.admin.deleteUser(created.user.id);
    await db.from('organizations').delete().eq('id', org.id);
    return { error: 'Profil vlasnika nije sačuvan: ' + profErr.message };
  }
  await audit(who(ctx), 'admin.create_org', { orgId: org.id, target: name });

  const demoId = str(fd, 'demo_id');
  if (demoId) await db.from('demo_requests').update({ status: 'trial', org_id: org.id }).eq('id', demoId);

  revalidatePath('/admin');
  return { email, password, name: ownerName };
}

export async function updateOrg(fd: FormData) {
  const ctx = await requireSuper();
  const id = String(fd.get('id'));
  await audit(who(ctx), 'admin.update_org', { orgId: id, details: { plan: str(fd, 'plan'), status: str(fd, 'status'), paid_until: str(fd, 'paid_until') } });
  const db = createAdminClient();
  const { error } = await db
    .from('organizations')
    .update({
      name: str(fd, 'name'),
      kind: str(fd, 'kind'),
      city: str(fd, 'city'),
      phone: str(fd, 'phone'),
      email: str(fd, 'email'),
      billing_name: str(fd, 'billing_name'),
      billing_address: str(fd, 'billing_address'),
      plan: str(fd, 'plan'),
      billing: str(fd, 'billing'),
      status: str(fd, 'status'),
      trial_ends_at: str(fd, 'trial_ends_at'),
      paid_until: str(fd, 'paid_until'),
      admin_notes: str(fd, 'admin_notes'),
    })
    .eq('id', id);
  revalidatePath('/admin');
  redirect(`/admin/skole/${id}?${error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'}`);
}

export async function deleteOrg(fd: FormData) {
  const ctx = await requireSuper();
  const id = String(fd.get('id'));
  if (String(fd.get('confirm') || '') !== 'OBRIŠI') redirect(`/admin/skole/${id}?err=${encodeURIComponent('Za brisanje upiši OBRIŠI.')}`);
  const db = createAdminClient();
  const { data: gone } = await db.from('organizations').select('name').eq('id', id).maybeSingle();
  await audit(who(ctx), 'admin.delete_org', { orgId: id, target: gone?.name ?? id });
  const { data: users } = await db.from('profiles').select('id').eq('org_id', id);
  for (const u of users ?? []) await db.auth.admin.deleteUser(u.id);
  await db.from('organizations').delete().eq('id', id);
  (await cookies()).delete(ORG_COOKIE);
  revalidatePath('/admin');
  redirect('/admin?ok=obrisano');
}

export async function adminAddUser(_: Creds | undefined, fd: FormData): Promise<Creds> {
  await requireSuper();
  const orgId = String(fd.get('org_id'));
  const fullName = str(fd, 'full_name');
  const email = str(fd, 'email')?.toLowerCase();
  const role = fd.get('role') === 'owner' ? 'owner' : 'teacher';
  if (!fullName || !email) return { error: 'Unesi ime i email.' };
  const res = await createOrgUser(orgId, role, fullName, email, str(fd, 'phone'));
  revalidatePath(`/admin/skole/${orgId}`);
  return res;
}

export async function resetPassword(_: Creds | undefined, fd: FormData): Promise<Creds> {
  const ctx = await requireSuper();
  await audit(who(ctx), 'admin.reset_password', { target: String(fd.get('user_id')) });
  return resetUserPassword(String(fd.get('user_id')));
}

export async function setUserActive(fd: FormData) {
  const ctx = await requireSuper();
  await audit(who(ctx), 'admin.set_user_active', { target: String(fd.get('user_id')), details: { active: fd.get('active') === '1' } });
  await setActive(String(fd.get('user_id')), fd.get('active') === '1');
  revalidatePath('/admin', 'layout');
}

export async function updateDemo(fd: FormData) {
  await requireSuper();
  const db = createAdminClient();
  await db
    .from('demo_requests')
    .update({ status: str(fd, 'status') ?? 'new', admin_notes: str(fd, 'admin_notes') })
    .eq('id', String(fd.get('id')));
  revalidatePath('/admin/zahtevi');
}
