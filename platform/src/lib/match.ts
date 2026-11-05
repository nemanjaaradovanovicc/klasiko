// Uparivanje redova sa izvoda banke sa otvorenim zaduženjima (čista funkcija, bez baze).

export type StatementRow = { date: string | null; amount: number; payer: string; purpose: string; reference: string; hash?: string };
export type MatchCharge = { id: string; period: string; remaining: number; first_name: string; last_name: string; parent_name: string | null; ref_no: number; family?: string | null };
export type Allocation = { chargeId: string; amount: number };
export type MatchResult = { row: StatementRow; chargeId: string | null; score: number; reason: string; allocations: Allocation[]; leftover: number };

export function norm(s: string): string {
  return s.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pretraga bez obzira na kvačice: „Petrovic” nalazi „Petrović”, a „Dordje” i „Djordje” nalaze „Đorđe”.
export function matchesSearch(haystack: string, query: string): boolean {
  const hay = norm(haystack);
  const words = norm(query).split(' ').filter(Boolean);
  const hayD = hay.replace(/dj/g, 'd');
  return words.every((w) => hay.includes(w) || hayD.includes(w.replace(/dj/g, 'd')));
}

// Ključ reda izvoda. Dva ista reda u jednom izvodu (ista osoba, isti dan, isti iznos) dobijaju redni broj.
export function statementKeys(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.date ?? '', r.amount.toFixed(2), norm(r.payer), norm(r.purpose), r.reference.replace(/\D/g, '')].join('|');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

const money = (n: number) => Math.round(n * 100) / 100;

// Raspodela uplate: prvo izabrano zaduženje, pa najstarija dugovanja istog učenika, pa braće i sestara.
export function suggestAllocation(amount: number, primary: MatchCharge, charges: MatchCharge[]): { allocations: Allocation[]; leftover: number } {
  const family = (c: MatchCharge) => !!primary.family && c.family === primary.family;
  const others = charges
    .filter((c) => c.id !== primary.id && c.remaining > 0 && (c.ref_no === primary.ref_no || family(c)))
    .sort((a, b) => Number(b.ref_no === primary.ref_no) - Number(a.ref_no === primary.ref_no) || a.period.localeCompare(b.period));
  let left = money(amount);
  const allocations: Allocation[] = [];
  for (const c of [primary, ...others]) {
    if (left <= 0) break;
    const use = money(Math.min(left, c.remaining));
    if (use > 0) {
      allocations.push({ chargeId: c.id, amount: use });
      left = money(left - use);
    }
  }
  return { allocations, leftover: left };
}

const isYearLike = (n: number) => n >= 2000 && n <= 2099;

export function matchRows(rows: StatementRow[], charges: MatchCharge[]): MatchResult[] {
  // Svaki red smanjuje preostali dug, pa sledeći red iz istog izvoda ide na sledeće zaduženje.
  const open = charges.map((c) => ({ ...c }));
  const patterns = new Map<string, { full: RegExp; bare: RegExp }>();
  for (const c of open) {
    patterns.set(c.id, {
      full: new RegExp(`(^|\\D)(?:00)?${c.ref_no}-?${c.period.replace('-', '')}(\\D|$)`),
      bare: new RegExp(`(^|\\D)(?:00)?${c.ref_no}(\\D|$)`),
    });
  }
  const results: MatchResult[] = [];
  for (const row of rows.filter((r) => r.amount > 0).slice(0, 1000)) {
    const reference = row.reference.replace(/\s/g, '');
    const text = ` ${norm(`${row.payer} ${row.purpose}`)} `;
    let best: { c: (typeof open)[number]; score: number; reason: string } | null = null;
    const top = new Map<number, Set<number>>(); // rezultat → različiti učenici sa tim rezultatom
    const consider = (c: (typeof open)[number], score: number, reason: string) => {
      const s = score + (Math.abs(c.remaining - row.amount) < 0.5 ? 15 : 0);
      top.set(s, (top.get(s) ?? new Set()).add(c.ref_no));
      if (!best || s > best.score || (s === best.score && c.period < best.c.period)) best = { c, score: s, reason };
    };
    for (const c of open) {
      if (c.remaining <= 0) continue;
      const p = patterns.get(c.id)!;
      if (p.full.test(reference) || p.full.test(row.purpose.replace(/\s/g, ''))) { consider(c, 100, 'poziv na broj'); continue; }
      // Golo „2026” u svrsi je godina, a ne broj učenika.
      const bareInPurpose = !isYearLike(c.ref_no) && c.ref_no !== Math.round(row.amount) && p.bare.test(row.purpose);
      if (p.bare.test(reference) || bareInPurpose) { consider(c, 70, 'broj učenika'); continue; }
      const fn = norm(c.first_name), ln = norm(c.last_name);
      if (ln && fn && text.includes(` ${ln} `) && text.includes(fn)) { consider(c, 55, 'ime i prezime'); continue; }
      const pn = c.parent_name ? norm(c.parent_name) : '';
      if (pn && pn.length > 4 && text.includes(pn)) { consider(c, 50, 'ime roditelja'); continue; }
      if (ln && ln.length > 3 && text.includes(` ${ln}`)) consider(c, 30, 'prezime');
    }
    const b = best as { c: (typeof open)[number]; score: number; reason: string } | null;
    const take = (reason: string, score: number) => {
      const { allocations, leftover } = suggestAllocation(row.amount, b!.c, open);
      for (const a of allocations) {
        const c = open.find((x) => x.id === a.chargeId)!;
        c.remaining = money(c.remaining - a.amount);
      }
      results.push({ row, chargeId: b!.c.id, score, reason, allocations, leftover });
    };
    // Dva različita učenika sa istim najboljim rezultatom (npr. brat i sestra): predlog, ali bez automatske potvrde.
    if (b && b.score < 100 && (top.get(b.score)?.size ?? 0) > 1) {
      take('više mogućnosti, proveri', Math.min(50, b.score));
      continue;
    }
    if (b && b.score >= 45) {
      take(b.reason, Math.min(100, b.score));
    } else {
      results.push({ row, chargeId: null, score: 0, reason: b ? `moguće: ${b.reason}` : 'nije prepoznato', allocations: [], leftover: row.amount });
    }
  }
  return results;
}
