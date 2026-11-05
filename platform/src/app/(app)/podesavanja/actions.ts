'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOrgUser, resetUserPassword, setActive, type Creds } from '@/lib/users';
import { normalizeAccount } from '@/lib/ips';
import { teacherLimitError } from '@/lib/plan';
import { audit } from '@/lib/audit';

function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
}

export async function updateSchool(fd: FormData) {
  const ctx = await requireOwner();
  const account = s(fd, 'bank_account');
  if (account && !normalizeAccount(account)) redirect('/podesavanja?err=' + encodeURIComponent('Tekući račun nije ispravan. Primer: 160-5100000000-99'));
  const fee = s(fd, 'default_fee');
  const day = Number(s(fd, 'fee_due_day') ?? 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      name: s(fd, 'name') ?? ctx.org.name,
      city: s(fd, 'city'),
      address: s(fd, 'address'),
      phone: s(fd, 'phone'),
      email: s(fd, 'email'),
      pib: s(fd, 'pib'),
      mb: s(fd, 'mb'),
      bank_account: account,
      payee_name: s(fd, 'payee_name'),
      default_fee: fee ? Number(fee) : null,
      fee_due_day: Math.min(28, Math.max(1, day || 10)),
    })
    .eq('id', ctx.org.id);
  revalidatePath('/', 'layout');
  redirect('/podesavanja?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'));
}

export async function addRoom(fd: FormData) {
  const ctx = await requireOwner();
  const name = s(fd, 'name');
  if (name) {
    const supabase = await createClient();
    await supabase.from('rooms').insert({ org_id: ctx.org.id, name, capacity: s(fd, 'capacity') ? Number(s(fd, 'capacity')) : null });
  }
  revalidatePath('/podesavanja');
  redirect('/podesavanja?ok=sala#sale');
}

export async function deleteRoom(fd: FormData) {
  const ctx = await requireOwner();
  const supabase = await createClient();
  await supabase.from('rooms').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath('/podesavanja');
  redirect('/podesavanja#sale');
}

async function assertMember(orgId: string, userId: string) {
  const db = createAdminClient();
  const { data } = await db.from('profiles').select('id, role').eq('id', userId).eq('org_id', orgId).single();
  return data;
}

export async function addTeamMember(_: Creds | undefined, fd: FormData): Promise<Creds> {
  const ctx = await requireOwner();
  const fullName = s(fd, 'full_name');
  const email = s(fd, 'email')?.toLowerCase();
  const role = fd.get('role') === 'owner' ? 'owner' : 'teacher';
  if (!fullName || !email) return { error: 'Unesi ime i email.' };
  if (role === 'teacher') {
    const limit = await teacherLimitError(createAdminClient(), ctx.org, ctx.isSuper);
    if (limit) return { error: limit };
  }
  const res = await createOrgUser(ctx.org.id, role, fullName, email, s(fd, 'phone'));
  if (!res.error) await audit({ userId: ctx.userId, email: ctx.email }, 'team.add', { orgId: ctx.org.id, target: email, details: { role } });
  revalidatePath('/podesavanja');
  return res;
}

export async function resetTeamPassword(_: Creds | undefined, fd: FormData): Promise<Creds> {
  const ctx = await requireOwner();
  const userId = String(fd.get('user_id'));
  const member = await assertMember(ctx.org.id, userId);
  if (!member) return { error: 'Korisnik nije iz tvoje škole.' };
  await audit({ userId: ctx.userId, email: ctx.email }, 'team.reset_password', { orgId: ctx.org.id, target: userId });
  return resetUserPassword(userId);
}

export async function toggleTeamMember(fd: FormData) {
  const ctx = await requireOwner();
  const userId = String(fd.get('user_id'));
  if (userId === ctx.userId) redirect('/podesavanja?err=' + encodeURIComponent('Ne možeš da deaktiviraš sebe.'));
  const member = await assertMember(ctx.org.id, userId);
  const active = fd.get('active') === '1';
  if (member) {
    if (active && member.role === 'teacher') {
      const limit = await teacherLimitError(createAdminClient(), ctx.org, ctx.isSuper);
      if (limit) redirect('/podesavanja?err=' + encodeURIComponent(limit) + '#tim');
    }
    await setActive(userId, active);
    await audit({ userId: ctx.userId, email: ctx.email }, 'team.set_active', { orgId: ctx.org.id, target: userId, details: { active } });
  }
  revalidatePath('/podesavanja');
  redirect('/podesavanja?ok=tim#tim');
}

// Automatska naplata i popust za braću i sestre.
export async function updateAutomation(fd: FormData) {
  const ctx = await requireOwner();
  const num = (k: string, min: number, max: number, def: number) => {
    const x = Number(s(fd, k) ?? def);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
  };
  const supabase = await createClient();
  const { error } = await supabase.from('organizations').update({
    auto_charges: fd.get('auto_charges') === 'on',
    auto_charge_day: Math.round(num('auto_charge_day', 1, 28, 1)),
    auto_reminders: fd.get('auto_reminders') === 'on',
    reminder_days_before: Math.round(num('reminder_days_before', 0, 14, 3)),
    sibling_discount_pct: num('sibling_discount_pct', 0, 100, 0),
  }).eq('id', ctx.org.id);
  revalidatePath('/', 'layout');
  redirect('/podesavanja?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=auto') + '#automatika');
}
