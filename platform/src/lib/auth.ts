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
  aal: string;
}

// Dvostepena prijava za admina Klasika je isključena. Uključuje se po želji sa SUPERADMIN_MFA=on.
export function mfaMissing(ctx: Pick<Ctx, 'isSuper' | 'aal'>): boolean {
  return ctx.isSuper && process.env.SUPERADMIN_MFA === 'on' && ctx.aal !== 'aal2';
}

// Jednom po zahtevu: korisnik, profil i trenutna škola.
export const getCtx = cache(async (): Promise<Ctx> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect('/login');
  const userId = claims.sub;

  // Profil i škola u jednom upitu.
  const { data: row } = await supabase.from('profiles').select('*, organizations(*)').eq('id', userId).single();
  if (!row || !row.active) redirect('/login?greska=nalog');
  const { organizations: ownOrg, ...profile } = row as Profile & { organizations: Organization | null };

  const isSuper = profile.role === 'superadmin';
  let org: Organization | null = ownOrg ?? null;
  if (isSuper) {
    org = null;
    const orgId = (await cookies()).get(ORG_COOKIE)?.value;
    if (orgId) {
      const { data } = await supabase.from('organizations').select('*').eq('id', orgId).single<Organization>();
      org = data ?? null;
    }
  }
  return {
    userId,
    email: (claims.email as string | undefined) ?? '',
    profile,
    org,
    isSuper,
    isOwner: isSuper || profile.role === 'owner',
    aal: (claims.aal as string | undefined) ?? 'aal1',
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
  if (mfaMissing(ctx)) redirect('/mfa');
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
  if (mfaMissing(ctx)) redirect('/mfa');
  if (!ctx.isSuper) redirect('/');
  return ctx;
}
