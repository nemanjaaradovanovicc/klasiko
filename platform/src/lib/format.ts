export const WEEKDAYS = ['', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota', 'Nedelja'];
export const WEEKDAYS_SHORT = ['', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];
export const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];

export function rsd(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(v) + ' RSD';
}

export function num(n: number | string | null | undefined): string {
  return new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

// Datum u Beogradu, bez obzira na vremensku zonu servera.
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());
}

export function isoWeekday(iso: string): number {
  const d = new Date(iso + 'T12:00:00Z');
  const w = d.getUTCDay();
  return w === 0 ? 7 : w;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStart(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function dateSr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d}. ${m}. ${y}.`;
}

export function dateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[isoWeekday(iso)]}, ${d}. ${MONTHS[m - 1]} ${y}.`;
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7);
}

export function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  const name = MONTHS[m - 1];
  if (!name) return p;
  return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}.`;
}

export function isPeriod(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

// Mesec iz adrese stranice: neispravan (npr. 2026-13) postaje tekući mesec.
export function parsePeriod(v: string | null | undefined): string {
  return isPeriod(v) ? v : currentPeriod();
}

export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Datum iz adrese stranice: neispravan postaje današnji dan.
export function parseDate(v: string | null | undefined): string {
  return isISODate(v) ? v : todayISO();
}

// Jedno pravilo za procenat prisustva svuda u aplikaciji: opravdani izostanci se ne računaju.
export function attendanceStats(rows: { status: string }[]): { present: number; absent: number; excused: number; counted: number; pct: number | null } {
  const present = rows.filter((r) => r.status === 'present').length;
  const absent = rows.filter((r) => r.status === 'absent').length;
  const excused = rows.filter((r) => r.status === 'excused').length;
  const counted = present + absent;
  return { present, absent, excused, counted, pct: counted ? Math.round((present / counted) * 100) : null };
}

export function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function time(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

export function fullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`.trim();
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO + 'T12:00:00Z').getTime() - new Date(fromISO + 'T12:00:00Z').getTime()) / 86400000);
}

// Učenici koji su propustili poslednja 2 ili više časova zaredom (opravdani izostanci prekidaju niz samo ako je bio prisutan).
export function absenceStreaks<T extends { student_id: string; status: string; date: string }>(rows: T[], min = 2): { student_id: string; streak: number; last: T }[] {
  const by = new Map<string, T[]>();
  for (const r of rows) by.set(r.student_id, [...(by.get(r.student_id) ?? []), r]);
  const out: { student_id: string; streak: number; last: T }[] = [];
  for (const [sid, list] of by) {
    list.sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    for (const r of list) {
      if (r.status === 'absent') streak++;
      else if (r.status === 'excused') continue;
      else break;
    }
    if (streak >= min) out.push({ student_id: sid, streak, last: list[0] });
  }
  return out.sort((a, b) => b.streak - a.streak);
}

// Ponoć po beogradskom vremenu kao UTC trenutak (leti +02:00, zimi +01:00).
export function belgradeDayStart(iso: string): string {
  const utcMidnight = new Date(iso + 'T00:00:00Z');
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', hourCycle: 'h23' }).format(utcMidnight));
  return new Date(utcMidnight.getTime() - h * 3600000).toISOString();
}
