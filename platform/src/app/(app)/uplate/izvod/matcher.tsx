'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { readSheet } from 'read-excel-file/browser';
import { matchStatement, applyMatches, type StatementRow, type MatchResult, type OpenCharge } from '../actions';

type Cell = string | number | boolean | Date | null;
const FIELDS = [
  { key: 'date', label: 'Datum', re: /datum|date|valut/i },
  { key: 'amount', label: 'Iznos uplate', re: /potra[zž]|uplat|priliv|odobren|credit|iznos/i },
  { key: 'payer', label: 'Uplatilac', re: /nalogodav|uplatil|platil|naziv|partner|ime/i },
  { key: 'purpose', label: 'Svrha', re: /svrh|opis|descr|namen/i },
  { key: 'reference', label: 'Poziv na broj', re: /poziv|refer|model/i },
] as const;
type Key = (typeof FIELDS)[number]['key'];

function parseCsv(text: string): string[][] {
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

function toAmount(v: Cell): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const n = s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return Number(n) || 0;
}
function toDate(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const rsd = (n: number) => new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(n) + ' RSD';

export function Matcher() {
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [map, setMap] = useState<Partial<Record<Key, number>>>({});
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [open, setOpen] = useState<OpenCharge[]>([]);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File) {
    setMsg(null); setResults(null);
    try {
      let data: Cell[][];
      if (/\.xlsx$/i.test(f.name)) data = (await readSheet(f)) as Cell[][];
      else {
        const buf = await f.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('�')) text = new TextDecoder('windows-1250').decode(buf);
        data = parseCsv(text);
      }
      const nonEmpty = data.filter((r) => r.filter((c) => c !== null && String(c).trim() !== '').length >= 2);
      const hIdx = nonEmpty.findIndex((r) => r.some((c) => /datum|iznos|naziv|svrh|uplat/i.test(String(c ?? ''))));
      if (hIdx < 0) return setMsg({ error: 'Nisam pronašao zaglavlje tabele (kolone kao Datum, Iznos, Naziv, Svrha).' });
      const h = nonEmpty[hIdx].map((c) => String(c ?? '').trim());
      const m: Partial<Record<Key, number>> = {};
      for (const fl of FIELDS) {
        const i = h.findIndex((x, idx) => fl.re.test(x) && !Object.values(m).includes(idx));
        if (i >= 0) m[fl.key] = i;
      }
      setHeader(h); setRows(nonEmpty.slice(hIdx + 1)); setMap(m);
    } catch {
      setMsg({ error: 'Fajl nije moguće pročitati. Preuzmi izvod kao Excel (.xlsx) ili CSV.' });
    }
  }

  function build(): StatementRow[] {
    const g = (r: Cell[], k: Key) => (map[k] !== undefined ? r[map[k]!] : null);
    return rows.map((r) => ({ date: toDate(g(r, 'date')), amount: toAmount(g(r, 'amount')), payer: String(g(r, 'payer') ?? ''), purpose: String(g(r, 'purpose') ?? ''), reference: String(g(r, 'reference') ?? '') })).filter((r) => r.amount > 0);
  }

  const run = () => start(async () => {
    const res = await matchStatement(build());
    setResults(res.results); setOpen(res.open);
    const p: Record<number, string> = {}, c: Record<number, boolean> = {};
    res.results.forEach((r, i) => { if (r.chargeId) { p[i] = r.chargeId; c[i] = r.score >= 55; } });
    setPick(p); setChecked(c);
  });

  const apply = () => start(async () => {
    const items = (results ?? []).map((r, i) => ({ r, i })).filter(({ i }) => checked[i] && pick[i]).map(({ r, i }) => ({ chargeId: pick[i], amount: r.row.amount, date: r.row.date, note: r.row.payer || r.row.purpose }));
    const res = await applyMatches(items);
    setMsg(res.ok ? { ok: `Evidentirano ${res.ok} uplata.` } : { error: res.error });
    if (res.ok) setResults(null);
  });

  const selected = Object.entries(checked).filter(([i, v]) => v && pick[Number(i)]).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-4 sm:p-5">
        <p className="text-[14px] font-semibold text-ink-2">U e-bankingu preuzmi izvod ili promet po računu kao <b>Excel</b> ili <b>CSV</b> i izaberi ga ovde. Klasiko predlaže kome pripada svaka uplata: po pozivu na broj iz QR koda, imenu učenika ili roditelja i iznosu. Ti proveriš i potvrdiš.</p>
        <label className="btn mt-4 cursor-pointer">Izaberi izvod<input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      </div>
      {msg?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{msg.error}</div>}
      {msg?.ok && <div className="rounded-xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok">{msg.ok} <Link href="/uplate" className="underline">Pogledaj uplate</Link></div>}

      {rows.length > 0 && !results && (
        <div className="card p-4 sm:p-5">
          <h2 className="text-[17px] font-extrabold text-ink">Kolone izvoda</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FIELDS.map((fl) => (
              <label key={fl.key} className="block">
                <span className="label">{fl.label}</span>
                <select className="input" value={map[fl.key] ?? ''} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === '') delete n[fl.key]; else n[fl.key] = Number(e.target.value); return n; })}>
                  <option value="">—</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Kolona ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-3 text-[13px] font-semibold text-mut">Pronađeno {build().length} uplata (priliva) u izvodu. Isplate i troškovi se preskaču.</p>
          <button className="btn mt-3" onClick={run} disabled={pending || map.amount === undefined}>{pending ? 'Uparujem...' : 'Upari uplate'}</button>
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-2">
          <div className="text-[14px] font-bold text-mut">Prepoznato {results.filter((r) => r.chargeId).length} od {results.length}. Proveri predloge, označi tačne i potvrdi.</div>
          {results.map((r, i) => (
            <div key={i} className={`card p-3.5 ${checked[i] ? 'ring-2 ring-ok/40' : ''}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1F7A4D]" checked={!!checked[i]} disabled={!pick[i]} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} aria-label="Potvrdi uplatu" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-extrabold text-ink">{r.row.payer || 'Nepoznat uplatilac'}</span>
                    <span className="shrink-0 font-extrabold tabular-nums text-ok">{rsd(r.row.amount)}</span>
                  </div>
                  <div className="truncate text-[12px] font-semibold text-mut">{[r.row.date, r.row.purpose, r.row.reference].filter(Boolean).join(' · ')}</div>
                  <select className="input mt-2 h-10" value={pick[i] ?? ''} onChange={(e) => { const v = e.target.value; setPick((p) => ({ ...p, [i]: v })); setChecked((c) => ({ ...c, [i]: !!v })); }}>
                    <option value="">Ne uparuj</option>
                    {open.map((o) => <option key={o.id} value={o.id}>{o.student} · {o.period} · {rsd(o.remaining)}</option>)}
                  </select>
                  <div className={`mt-1 text-[12px] font-bold ${r.chargeId ? (r.score >= 70 ? 'text-ok' : 'text-coral-dark') : 'text-mut'}`}>{r.chargeId ? `Predlog: ${r.reason}${r.score >= 70 ? ' (sigurno)' : ' (proveri)'}` : r.reason}</div>
                </div>
              </div>
            </div>
          ))}
          <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-2 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur lg:bottom-4">
            <button className="btn h-12 flex-1 sm:flex-none" onClick={apply} disabled={pending || selected === 0}>{pending ? 'Čuvam...' : `Evidentiraj ${selected} ${selected === 1 ? 'uplatu' : 'uplata'}`}</button>
            <button className="btn btn-ghost" onClick={() => setResults(null)}>Nazad</button>
          </div>
        </div>
      )}
    </div>
  );
}
