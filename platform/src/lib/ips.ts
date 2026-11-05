// NBS IPS QR (instant plaćanje): tekst koji banka čita iz QR koda na uplatnici.

export function normalizeAccount(input: string): string | null {
  const digits = input.replace(/[^0-9-]/g, '');
  const parts = digits.split('-').filter(Boolean);
  let out: string;
  if (parts.length === 3) {
    out = parts[0].padStart(3, '0') + parts[1].padStart(13, '0') + parts[2].padStart(2, '0');
  } else {
    out = digits.replace(/-/g, '');
  }
  return /^\d{18}$/.test(out) ? out : null;
}

function clean(s: string, max: number): string {
  return s.replace(/[|\r\n]/g, ' ').trim().slice(0, max);
}

export function ipsPayload(opts: { account: string; payee: string; amount: number; purpose: string; payer?: string; reference?: string }): string | null {
  const acc = normalizeAccount(opts.account);
  if (!acc || !opts.payee || !(opts.amount > 0)) return null;
  const amount = opts.amount.toFixed(2).replace('.', ',');
  const parts = [
    'K:PR',
    'V:01',
    'C:1',
    `R:${acc}`,
    `N:${clean(opts.payee, 70)}`,
    `I:RSD${amount}`,
  ];
  if (opts.payer) parts.push(`P:${clean(opts.payer, 70)}`);
  parts.push('SF:289', `S:${clean(opts.purpose, 35)}`);
  if (opts.reference) parts.push(`RO:00${opts.reference.replace(/[^0-9-]/g, '').slice(0, 22)}`);
  return parts.join('|');
}

// Poziv na broj za ukupan dug porodice ili učenika: broj učenika i nule umesto meseca. Iznos se raspoređuje na sva otvorena zaduženja.
export function familyReference(refNo: number): string {
  return `${refNo}-000000`;
}

// Poziv na broj za članarinu: broj učenika i mesec, npr. 1042-202611. Po njemu se uplata uparuje sa izvoda.
export function studentReference(refNo: number, period: string): string {
  return `${refNo}-${period.replace('-', '')}`;
}
