import { addDays, formatMoney } from '@/lib/format';

// Paketi časova: koliko je ostalo učeniku (kupljeno minus odslušano), računato iz prisustva.
export type PackageRow = { student_id: string; group_id: string; classes_total: number; purchased_at: string; expires_at: string | null };
export type PresenceRow = { student_id: string; group_id: string; date: string };

export function packageBalance(packages: PackageRow[], presence: PresenceRow[], today: string): { total: number; used: number; remaining: number; expired: boolean } {
  const live = packages.filter((p) => !p.expires_at || p.expires_at >= today);
  if (live.length === 0) return { total: 0, used: 0, remaining: 0, expired: packages.length > 0 };
  const from = live.map((p) => p.purchased_at).sort()[0];
  const total = live.reduce((a, p) => a + p.classes_total, 0);
  const used = presence.filter((x) => x.date >= from).length;
  return { total, used, remaining: Math.max(0, total - used), expired: false };
}

export type UsagePackage = { id: string; classes_total: number; purchased_at: string; expires_at: string | null };
export type UsageSession = { session_id: string; date: string };

// Stariji paket prvi troši održane časove (prisutan učenik). Čas van perioda paketa ne ulazi.
export function allocateUsage(packages: UsagePackage[], sessions: UsageSession[]): Map<string, number> {
  const sorted = [...packages].sort((a, b) => a.purchased_at.localeCompare(b.purchased_at) || a.id.localeCompare(b.id));
  const used = new Map(sorted.map((p) => [p.id, 0]));
  const list = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.session_id.localeCompare(b.session_id));
  for (const s of list) {
    const p = sorted.find((x) => x.purchased_at <= s.date && (!x.expires_at || x.expires_at >= s.date) && (used.get(x.id) ?? 0) < x.classes_total);
    if (p) used.set(p.id, (used.get(p.id) ?? 0) + 1);
  }
  return used;
}

// 10 časova jednom nedeljno traje 10 nedelja, dvaput nedeljno 5. Svaka druga nedelja računa se kao pola.
export function suggestedExpiry(purchasedAt: string, lessons: number, sessionsPerWeek: number, extraWeeks = 0): string {
  const freq = sessionsPerWeek > 0 ? sessionsPerWeek : 1;
  const weeks = Math.ceil(lessons / freq) + extraWeeks;
  return addDays(purchasedAt, weeks * 7);
}

// Otkazan čas bez nadoknade, u periodu paketa, produžava važenje za nedelju dana. Redom po datumu.
export function expiryAfterCancellations(purchasedAt: string, lessons: number, sessionsPerWeek: number, cancelledWithoutMakeup: string[]): string {
  let end = suggestedExpiry(purchasedAt, lessons, sessionsPerWeek, 0);
  for (const d of [...cancelledWithoutMakeup].sort()) {
    if (d >= purchasedAt && d <= end) end = addDays(end, 7);
  }
  return end;
}

// Posle pretposlednjeg održanog časa (9. od 10) roditelj treba da plati sledeći paket pre poslednjeg.
export function shouldRemindPackage(used: number, total: number, expired: boolean): boolean {
  return !expired && total > 1 && used === total - 1;
}

export function hasNextPackage(all: { id: string; student_id: string; group_id: string; bundle_id: string | null; purchased_at: string }[], current: { id: string; student_id: string; group_id: string; bundle_id: string | null; purchased_at: string }): boolean {
  const bundle = current.bundle_id ?? current.id;
  return all.some((o) => o.student_id === current.student_id && o.group_id === current.group_id && o.id !== current.id && (o.bundle_id ?? o.id) !== bundle && o.purchased_at >= current.purchased_at);
}

export function packageReminderText(o: {
  school: string;
  student: string;
  used: number;
  total: number;
  price: number | null;
  currency: string;
  instructions: string | null;
  bankAccount: string | null;
  link: string | null;
}): string {
  return [
    'Dobar dan!',
    `${o.student}: odslušano je ${o.used} od ${o.total} časova u trenutnom paketu. Molimo vas da uplatite sledeći paket pre poslednjeg časa.`,
    o.price !== null && o.price > 0 ? `Iznos paketa: ${formatMoney(o.price, o.currency)}.` : '',
    o.instructions?.trim() ?? '',
    o.bankAccount ? `Račun: ${o.bankAccount}` : '',
    o.link ? `Detalji: ${o.link}` : '',
    `Ako ste već uplatili, zanemarite poruku. Hvala! ${o.school}`,
  ].filter(Boolean).join('\n\n');
}
