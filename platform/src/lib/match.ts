// Uparivanje redova sa izvoda banke sa otvorenim zaduženjima (čista funkcija, bez baze).

export type StatementRow = { date: string | null; amount: number; payer: string; purpose: string; reference: string };
export type MatchCharge = { id: string; period: string; remaining: number; first_name: string; last_name: string; parent_name: string | null; ref_no: number };
export type MatchResult = { row: StatementRow; chargeId: string | null; score: number; reason: string };

export function norm(s: string): string {
  return s.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchRows(rows: StatementRow[], charges: MatchCharge[]): MatchResult[] {
  const used = new Set<string>();
  const results: MatchResult[] = [];
  for (const row of rows.filter((r) => r.amount > 0).slice(0, 1000)) {
    const refText = `${row.reference} ${row.purpose}`;
    const text = ` ${norm(`${row.payer} ${row.purpose}`)} `;
    let best: { c: MatchCharge; score: number; reason: string } | null = null;
    const top = new Map<number, Set<number>>(); // rezultat → različiti učenici sa tim rezultatom
    const consider = (c: MatchCharge, score: number, reason: string) => {
      if (used.has(c.id)) return;
      const s = score + (Math.abs(c.remaining - row.amount) < 0.5 ? 15 : 0);
      top.set(s, (top.get(s) ?? new Set()).add(c.ref_no));
      if (!best || s > best.score || (s === best.score && c.period < best.c.period)) best = { c, score: s, reason };
    };
    for (const c of charges) {
      if (c.remaining <= 0) continue;
      const full = `${c.ref_no}-${c.period.replace('-', '')}`;
      if (refText.replace(/\s/g, '').includes(full)) { consider(c, 100, 'poziv na broj'); continue; }
      if (new RegExp(`(^|\\D)${c.ref_no}(\\D|$)`).test(refText)) { consider(c, 70, 'broj učenika'); continue; }
      const fn = norm(c.first_name), ln = norm(c.last_name);
      if (ln && fn && text.includes(` ${ln} `) && text.includes(fn)) { consider(c, 55, 'ime i prezime'); continue; }
      const pn = c.parent_name ? norm(c.parent_name) : '';
      if (pn && pn.length > 4 && text.includes(pn)) { consider(c, 50, 'ime roditelja'); continue; }
      if (ln && ln.length > 3 && text.includes(` ${ln}`)) consider(c, 30, 'prezime');
    }
    const b = best as { c: MatchCharge; score: number; reason: string } | null;
    // Dva različita učenika sa istim najboljim rezultatom (npr. brat i sestra): predlog, ali bez automatske potvrde.
    if (b && b.score < 100 && (top.get(b.score)?.size ?? 0) > 1) {
      used.add(b.c.id);
      results.push({ row, chargeId: b.c.id, score: Math.min(50, b.score), reason: 'više mogućnosti, proveri' });
      continue;
    }
    if (b && b.score >= 45) {
      used.add(b.c.id);
      results.push({ row, chargeId: b.c.id, score: Math.min(100, b.score), reason: b.reason });
    } else {
      results.push({ row, chargeId: null, score: 0, reason: b ? `moguće: ${b.reason}` : 'nije prepoznato' });
    }
  }
  return results;
}
