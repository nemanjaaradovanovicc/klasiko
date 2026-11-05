import { PLANS, BILLING_LABEL, type Billing, type Invoice, type Organization, type Plan, type PlatformSettings } from '@/lib/types';
import { addDays, dateSr, rsd, todayISO } from '@/lib/format';
import { ipsPayload } from '@/lib/ips';
import { waUrl } from '@/lib/phone';

export const APP_URL = 'https://app.klasiko.rs';

export function planPrice(plan: Plan, billing: Billing): number {
  const p = PLANS[plan];
  if (billing === 'yearly') return p.yearly;
  if (billing === 'lifetime') return p.lifetime ?? p.yearly;
  return p.monthly;
}

export function planLabel(plan: Plan, billing: Billing): string {
  return `Klasiko pretplata, paket ${PLANS[plan].name}, ${BILLING_LABEL[billing].toLowerCase()}`;
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// Novo „plaćeno do”: od kasnijeg od današnjeg dana i postojećeg datuma.
export function extendPaidUntil(current: string | null, by: 'month' | 'year'): string {
  const today = todayISO();
  const from = current && current > today ? current : today;
  return addMonths(from, by === 'year' ? 12 : 1);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T12:00:00Z').getTime() - new Date(todayISO() + 'T12:00:00Z').getTime()) / 86400000);
}

// Kada školi ističe pristup (probni period ili plaćeno do); null = ne ističe.
export function accessEnds(org: Organization): string | null {
  if (org.status === 'trial') return org.trial_ends_at;
  if (org.status === 'active' && org.billing !== 'lifetime') return org.paid_until;
  return null;
}

export function invoiceQr(s: PlatformSettings, inv: Pick<Invoice, 'number' | 'total' | 'buyer'>): string | null {
  if (!s.bank_account || !s.issuer_name) return null;
  return ipsPayload({ account: s.bank_account, payee: [s.issuer_name, s.issuer_address, s.issuer_city].filter(Boolean).join(', '), amount: Number(inv.total), purpose: `Klasiko uplata ${inv.number}`, payer: inv.buyer?.name });
}

export function planQr(s: PlatformSettings, org: Organization, plan: Plan, billing: Billing): string | null {
  if (!s.bank_account || !s.issuer_name) return null;
  return ipsPayload({ account: s.bank_account, payee: [s.issuer_name, s.issuer_address, s.issuer_city].filter(Boolean).join(', '), amount: planPrice(plan, billing), purpose: `Klasiko ${PLANS[plan].name} ${org.name}`.slice(0, 35), payer: org.billing_name ?? org.name });
}

export function paymentMessage(s: PlatformSettings, inv: Invoice): string {
  return [
    `Dobar dan, šaljem instrukcije za uplatu br. ${inv.number} za Klasiko.`,
    `${inv.items.map((i) => i.description).join('; ')}`,
    `Iznos: ${rsd(inv.total)}${inv.due_date ? `, rok za uplatu: ${dateSr(inv.due_date)}` : ''}`,
    '',
    'Podaci za uplatu:',
    `Primalac: ${[s.issuer_name, s.issuer_address, s.issuer_city].filter(Boolean).join(', ')}`,
    `Račun: ${s.bank_account}${s.bank_name ? ` (${s.bank_name})` : ''}`,
    `Svrha: Klasiko uplata ${inv.number}`,
    '',
    `Instrukcije i QR kod za uplatu vidite ovde: ${APP_URL}/uplata/${inv.id}`,
    'Hvala!',
  ].join('\n');
}

export function defaultDue(s: PlatformSettings, issue: string): string {
  return addDays(issue, s.payment_days || 8);
}

// Period koji pokriva sledeća uplata: od kasnijeg od danas i „plaćeno do”, do produženog datuma.
export function nextPeriod(org: Organization): { from: string; to: string | null } {
  const today = todayISO();
  const from = org.paid_until && org.paid_until > today ? org.paid_until : today;
  if (org.billing === 'lifetime') return { from, to: null };
  return { from, to: extendPaidUntil(org.paid_until, org.billing === 'yearly' ? 'year' : 'month') };
}

export function periodText(from: string, to: string | null): string {
  return to ? `za period ${dateSr(from)} do ${dateSr(to)}` : 'jednokratno (lifetime)';
}

// Škole kojima treba poslati instrukcije: aktivne (ili probne) kojima pristup ističe u narednih `days` dana ili je već istekao.
export function needsBilling(org: Organization, days = 14): boolean {
  if (org.status === 'cancelled' || org.billing === 'lifetime') return false;
  const end = accessEnds(org) ?? (org.status === 'suspended' ? org.paid_until : null);
  if (!end) return org.status === 'active';
  const d = daysUntil(end);
  return d !== null && d <= days;
}

export function waLink(phone: string | null | undefined, text: string): string {
  return waUrl(phone, text);
}
