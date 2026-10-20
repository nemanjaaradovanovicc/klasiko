import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Organization, Profile } from '@/lib/types';
import { todayISO } from '@/lib/format';

export const ORG_COOKIE = 'klasiko_org';

export interface Ctx {
  userId: string;
  email: string;
  profile: Profile;
  org: Organization | null;
  isSuper: boolean;
  isOwner: boolean; // vlasnik škole ili superadmin unutar škole
}

// Jednom po zahtevu: korisnik, profil i trenutna škola.
export const getCtx = cache(async (): Promise<Ctx> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();
  if (!profile || !profile.active) redirect('/login?greska=nalog');

  const isSuper = profile.role === 'superadmin';
  let orgId = profile.org_id;
  if (isSuper) {
    orgId = (await cookies()).get(ORG_COOKIE)?.value ?? null;
  }
  let org: Organization | null = null;
  if (orgId) {
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).single<Organization>();
    org = data ?? null;
  }
  return {
    userId: user.id,
    email: user.email ?? '',
    profile,
    org,
    isSuper,
    isOwner: isSuper || profile.role === 'owner',
  };
});

export function orgAccess(org: Organization): { ok: boolean; reason?: string; daysLeft?: number } {
  const today = todayISO();
  if (org.status === 'suspended') return { ok: false, reason: 'Nalog škole je pauziran.' };
  if (org.status === 'cancelled') return { ok: false, reason: 'Pretplata je otkazana.' };
  if (org.status === 'trial') {
    if (org.trial_ends_at && org.trial_ends_at < today) return { ok: false, reason: 'Probni period je istekao.' };
    const daysLeft = org.trial_ends_at
      ? Math.round((new Date(org.trial_ends_at + 'T12:00:00Z').getTime() - new Date(today + 'T12:00:00Z').getTime()) / 86400000)
      : undefined;
    return { ok: true, daysLeft };
  }
  if (org.billing !== 'lifetime' && org.paid_until && org.paid_until < today) {
    return { ok: false, reason: 'Pretplata je istekla.' };
  }
  return { ok: true };
}

// Za stranice unutar škole: mora postojati škola i aktivan pristup.
export async function requireOrg(): Promise<Ctx & { org: Organization }> {
  const ctx = await getCtx();
  if (ctx.profile.must_change_password) redirect('/lozinka');
  if (!ctx.org) redirect(ctx.isSuper ? '/admin' : '/login?greska=skola');
  if (!ctx.isSuper && !orgAccess(ctx.org).ok) redirect('/pretplata');
  return ctx as Ctx & { org: Organization };
}

export async function requireOwner(): Promise<Ctx & { org: Organization }> {
  const ctx = await requireOrg();
  if (!ctx.isOwner) redirect('/');
  return ctx;
}

export async function requireSuper(): Promise<Ctx> {
  const ctx = await getCtx();
  if (ctx.profile.must_change_password) redirect('/lozinka');
  if (!ctx.isSuper) redirect('/');
  return ctx;
}
