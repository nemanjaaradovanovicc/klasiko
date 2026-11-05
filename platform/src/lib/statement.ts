// Čitanje izvoda iz banke (čiste funkcije, bez baze i pregledača).

export type Cell = string | number | boolean | Date | null;

export const STATEMENT_FIELDS = [
  { key: 'date', label: 'Datum', re: /datum|date|valut/i },
  { key: 'amount', label: 'Iznos uplate', re: /potra[zž]|uplat(?!il)|priliv|odobren|credit|iznos/i },
  { key: 'payer', label: 'Uplatilac', re: /nalogodav|uplatil|platil|naziv|partner|ime/i },
  { key: 'purpose', label: 'Svrha', re: /svrh|opis|descr|namen/i },
  { key: 'reference', label: 'Poziv na broj', re: /poziv|refer|model/i },
] as const;
export type StatementKey = (typeof STATEMENT_FIELDS)[number]['key'];

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// „4.000”, „4.000,00”, „4,000.00” i „4000,5” su svi ispravni zapisi iznosa.
export function toAmount(v: Cell): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  let n: string;
  if (lastComma >= 0 && lastDot >= 0) {
    n = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    n = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    n = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else {
    n = s;
  }
  return Number(n) || 0;
}

export function toDate(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Automatsko prepoznavanje kolona iz zaglavlja izvoda.
export function mapStatementColumns(header: string[]): Partial<Record<StatementKey, number>> {
  const m: Partial<Record<StatementKey, number>> = {};
  for (const fl of STATEMENT_FIELDS) {
    const i = header.findIndex((x, idx) => fl.re.test(x) && !Object.values(m).includes(idx));
    if (i >= 0) m[fl.key] = i;
  }
  return m;
}
