'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { extendPaidUntil, planPrice, planLabel, defaultDue, needsBilling, nextPeriod, periodText } from '@/lib/billing';
import { normalizeAccount } from '@/lib/ips';
import { todayISO } from '@/lib/format';
import type { Billing, Organization, Plan, PlatformSettings } from '@/lib/types';
import { audit } from '@/lib/audit';

function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
}
function money(v: string | null): number | null {
  if (!v) return null;
  const raw = v.replace(/\s/g, '');
  const x = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null;
}

export async function saveBillingSettings(fd: FormData) {
  await requireSuper();
  const account = s(fd, 'bank_account');
  if (account && !normalizeAccount(account)) redirect('/admin/naplata/podesavanja?err=' + encodeURIComponent('Račun nije ispravan. Primer: 265-0000006877193-37'));
  const db = createAdminClient();
  const { error } = await db.from('platform_settings').update({
    issuer_name: s(fd, 'issuer_name') ?? '',
    issuer_address: s(fd, 'issuer_address'),
    issuer_city: s(fd, 'issuer_city'),
    bank_name: s(fd, 'bank_name'),
    bank_account: account,
    email: s(fd, 'email'),
    phone: s(fd, 'phone'),
    invoice_note: s(fd, 'invoice_note'),
    payment_days: Math.max(1, Math.min(60, Number(s(fd, 'payment_days') ?? 8) || 8)),
    billing_day: Math.max(1, Math.min(28, Number(s(fd, 'billing_day') ?? 10) || 10)),
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  revalidatePath('/', 'layout');
  redirect('/admin/naplata/podesavanja?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=1'));
}

async function nextNumber(db: ReturnType<typeof createAdminClient>, year: string): Promise<string> {
  const { data } = await db.from('invoices').select('number').like('number', `${year}-%`).order('number', { ascending: false }).limit(1);
  const last = data?.[0]?.number ? Number(data[0].number.split('-')[1]) : 0;
  return `${year}-${String(last + 1).padStart(3, '0')}`;
}

// Nova instrukcija za uplatu (nije faktura).
export async function createInvoice(fd: FormData) {
  await requireSuper();
  const orgId = String(fd.get('org_id') || '');
  const db = createAdminClient();
  const [{ data: org }, { data: st }] = await Promise.all([
    db.from('organizations').select('*').eq('id', orgId).single<Organization>(),
    db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  if (!org || !st) redirect('/admin/naplata?err=' + encodeURIComponent('Škola nije pronađena.'));
  const items: { description: string; qty: number; price: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = s(fd, `item_${i}_desc`);
    const price = money(s(fd, `item_${i}_price`));
    const qty = Math.max(1, Number(s(fd, `item_${i}_qty`) ?? 1) || 1);
    if (d && price) items.push({ description: d, qty, price });
  }
  if (items.length === 0) redirect(`/admin/naplata/nova?skola=${orgId}&err=` + encodeURIComponent('Dodaj bar jednu stavku sa iznosom.'));
  const total = items.reduce((a, i) => a + i.qty * i.price, 0);
  const issue = s(fd, 'issue_date') ?? todayISO();
  let id: string | null = null;
  for (let attempt = 0; attempt < 3 && !id; attempt++) {
    const number = await nextNumber(db, issue.slice(0, 4));
    const { data, error } = await db.from('invoices').insert({
      org_id: org.id,
      number,
      issue_date: issue,
      service_date: s(fd, 'service_date') ?? issue,
      due_date: s(fd, 'due_date') ?? defaultDue(st, issue),
      place: st.issuer_city ?? 'Beograd',
      buyer: { name: org.billing_name ?? org.name, address: org.billing_address ?? org.address, city: org.city, email: org.email, phone: org.phone },
      items,
      total,
      note: s(fd, 'note'),
      period_from: s(fd, 'period_from'),
      period_to: s(fd, 'period_to'),
      plan: (s(fd, 'plan') as Plan) ?? org.plan,
      billing: (s(fd, 'billing') as Billing) ?? org.billing,
    }).select('id').single();
    if (data) id = data.id;
    else if (error && !error.message.includes('duplicate')) redirect(`/admin/naplata/nova?skola=${orgId}&err=` + encodeURIComponent(error.message));
  }
  revalidatePath('/admin', 'layout');
  redirect(`/admin/naplata/${id}?ok=nova`);
}

export async function cancelInvoice(fd: FormData) {
  await requireSuper();
  const id = String(fd.get('id'));
  const db = createAdminClient();
  await db.from('invoices').update({ status: 'cancelled' }).eq('id', id).neq('status', 'paid');
  revalidatePath('/admin', 'layout');
  redirect(`/admin/naplata/${id}?ok=ponisteno`);
}

// Evidentira uplatu pretplate i produžava pristup školi.
export async function recordSubscriptionPayment(fd: FormData) {
  const ctx = await requireSuper();
  const orgId = String(fd.get('org_id'));
  const back = s(fd, 'back') ?? `/admin/skole/${orgId}`;
  const db = createAdminClient();
  const { data: org } = await db.from('organizations').select('*').eq('id', orgId).single<Organization>();
  if (!org) redirect(back);
  const fail = (m: string) => redirect(`${back}${back.includes('?') ? '&' : '?'}err=` + encodeURIComponent(m));
  const invoiceId = s(fd, 'invoice_id');
  // Ista instrukcija se ne plaća dvaput, a dvostruki klik ne sme dvaput da produži pretplatu.
  if (invoiceId) {
    const { data: inv } = await db.from('invoices').select('status').eq('id', invoiceId).eq('org_id', orgId).maybeSingle();
    if (!inv) fail('Instrukcija nije pronađena.');
    if (inv?.status === 'paid') fail('Ova instrukcija je već plaćena.');
  }
  const plan = (s(fd, 'plan') as Plan) ?? org.plan;
  const billing = (s(fd, 'billing') as Billing) ?? org.billing;
  const amount = money(s(fd, 'amount')) ?? planPrice(plan, billing);
  const extend = s(fd, 'extend') ?? (billing === 'yearly' ? 'year' : billing === 'lifetime' ? 'lifetime' : 'month');
  const before = org.paid_until;
  const after = extend === 'month' || extend === 'year' ? extendPaidUntil(before, extend) : before;
  const paidAt = s(fd, 'paid_at') ?? todayISO();
  const { data: recent } = await db.from('subscription_payments').select('id').eq('org_id', orgId).eq('amount', amount).eq('paid_at', paidAt).gte('created_at', new Date(Date.now() - 2 * 60000).toISOString()).limit(1);
  if (recent?.length) fail('Ista uplata je upisana pre manje od 2 minuta. Proveri spisak uplata.');

  const { error } = await db.from('subscription_payments').insert({
    org_id: orgId, invoice_id: invoiceId, amount, paid_at: paidAt,
    method: ['bank', 'cash', 'card', 'other'].includes(String(fd.get('method'))) ? String(fd.get('method')) : 'bank',
    plan, billing, paid_until_before: before, paid_until_after: extend === 'lifetime' ? null : after, note: s(fd, 'note'),
  });
  if (error) fail(error.message);
  const { error: oErr } = await db.from('organizations').update({
    status: 'active', plan, billing: extend === 'lifetime' ? 'lifetime' : billing,
    paid_until: extend === 'lifetime' ? null : after,
  }).eq('id', orgId);
  if (oErr) fail('Uplata je upisana, ali pristup nije produžen: ' + oErr.message);
  if (invoiceId) await db.from('invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', invoiceId);
  await audit({ userId: ctx.userId, email: ctx.email }, 'admin.subscription_payment', { orgId, details: { amount, before, after } });
  revalidatePath('/admin', 'layout');
  redirect(`${back}${back.includes('?') ? '&' : '?'}ok=uplata`);
}

// Brisanje uplate vraća „plaćeno do” na staro (ako je ovo poslednja uplata) i ponovo otvara instrukciju.
export async function deleteSubscriptionPayment(fd: FormData) {
  const ctx = await requireSuper();
  const db = createAdminClient();
  const orgId = String(fd.get('org_id'));
  const id = String(fd.get('id'));
  const { data: pay } = await db.from('subscription_payments').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!pay) redirect(`/admin/skole/${orgId}?err=` + encodeURIComponent('Uplata nije pronađena.'));
  const { data: latest } = await db.from('subscription_payments').select('id').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from('subscription_payments').delete().eq('id', id);
  if (error) redirect(`/admin/skole/${orgId}?err=` + encodeURIComponent(error.message));
  let note = 'ok=1';
  if (latest?.id === id) {
    await db.from('organizations').update({ paid_until: pay.paid_until_before }).eq('id', orgId);
  } else {
    note = 'err=' + encodeURIComponent('Uplata je obrisana, ali nije poslednja, pa „plaćeno do” proveri i izmeni ručno.');
  }
  if (pay.invoice_id) await db.from('invoices').update({ status: 'issued', paid_at: null }).eq('id', pay.invoice_id);
  await audit({ userId: ctx.userId, email: ctx.email }, 'admin.subscription_payment_deleted', { orgId, details: { amount: pay.amount, restored: latest?.id === id ? pay.paid_until_before : null } });
  revalidatePath('/admin', 'layout');
  redirect(`/admin/skole/${orgId}?${note}`);
}

function buyerOf(org: Organization) {
  return { name: org.billing_name ?? org.name, address: org.billing_address ?? org.address, city: org.city, email: org.email, phone: org.phone };
}

// Napravi instrukcije za sve škole kojima ističe pristup, a nemaju otvorenu instrukciju.
export async function createInvoicesBulk(fd: FormData) {
  await requireSuper();
  const db = createAdminClient();
  const ids = fd.getAll('org_id').map(String);
  const [{ data: orgs }, { data: open }, { data: st }] = await Promise.all([
    db.from('organizations').select('*').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    db.from('invoices').select('org_id').eq('status', 'issued'),
    db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  const hasOpen = new Set((open ?? []).map((o) => o.org_id));
  const issue = todayISO();
  let made = 0;
  for (const org of (orgs ?? []) as Organization[]) {
    if (hasOpen.has(org.id) || !needsBilling(org, 31)) continue;
    const billing: Billing = org.billing === 'lifetime' ? 'monthly' : org.billing;
    const per = nextPeriod({ ...org, billing });
    const price = planPrice(org.plan, billing);
    for (let attempt = 0; attempt < 3; attempt++) {
      const number = await nextNumber(db, issue.slice(0, 4));
      const { error } = await db.from('invoices').insert({
        org_id: org.id, number, issue_date: issue, service_date: issue,
        due_date: org.paid_until && org.paid_until > issue ? org.paid_until : defaultDue(st!, issue),
        place: st?.issuer_city ?? 'Beograd', buyer: buyerOf(org),
        items: [{ description: `${planLabel(org.plan, billing)}, ${periodText(per.from, per.to)}`, qty: 1, price }],
        total: price, plan: org.plan, billing, period_from: per.from, period_to: per.to,
      });
      if (!error) { made++; break; }
      if (!error.message.includes('duplicate')) break;
    }
  }
  revalidatePath('/admin', 'layout');
  redirect('/admin/naplata?ok=' + encodeURIComponent(made ? `Napravljeno ${made} instrukcija. Pošalji ih školama.` : 'Sve škole već imaju instrukcije.'));
}

// Beleži da je instrukcija poslata (poziva se pri kliku na WhatsApp / Viber / Email).
export async function markInvoiceSent(id: string) {
  await requireSuper();
  const db = createAdminClient();
  await db.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', id).is('sent_at', null);
  revalidatePath('/admin/naplata');
}
