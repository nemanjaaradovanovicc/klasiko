'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { readSheet } from 'read-excel-file/browser';
import { matchStatement, applyMatches, type StatementRow, type MatchResult, type OpenCharge } from '../actions';
import { STATEMENT_FIELDS as FIELDS, mapStatementColumns, parseCsv, toAmount, toDate, type Cell, type StatementKey as Key } from '@/lib/statement';
import type { Allocation } from '@/lib/match';

const rsd = (n: number) => new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(n) + ' RSD';

export function Matcher() {
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [map, setMap] = useState<Partial<Record<Key, number>>>({});
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [open, setOpen] = useState<OpenCharge[]>([]);
  const [allocs, setAllocs] = useState<Record<number, Allocation[]>>({});
  const [info, setInfo] = useState<{ already: number; truncated: number }>({ already: 0, truncated: 0 });
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
      setHeader(h); setRows(nonEmpty.slice(hIdx + 1)); setMap(mapStatementColumns(h));
    } catch {
      setMsg({ error: 'Fajl nije moguće pročitati. Preuzmi izvod kao Excel (.xlsx) ili CSV.' });
    }
  }

  function build(): StatementRow[] {
    const g = (r: Cell[], k: Key) => (map[k] !== undefined ? r[map[k]!] : null);
    return rows.map((r) => ({ date: toDate(g(r, 'date')), amount: toAmount(g(r, 'amount')), payer: String(g(r, 'payer') ?? ''), purpose: String(g(r, 'purpose') ?? ''), reference: String(g(r, 'reference') ?? '') })).filter((r) => r.amount > 0);
  }

  const run = () => start(async () => {
    try {
      const res = await matchStatement(build());
      setResults(res.results); setOpen(res.open);
      setInfo({ already: res.alreadyImported, truncated: res.truncated });
      const p: Record<number, Allocation[]> = {}, c: Record<number, boolean> = {};
      res.results.forEach((r, i) => { p[i] = r.allocations; if (r.chargeId) c[i] = r.score >= 55; });
      setAllocs(p); setChecked(c);
    } catch {
      setMsg({ error: 'Nema veze sa serverom. Pokušaj ponovo.' });
    }
  });

  const apply = () => start(async () => {
    const items = (results ?? []).map((r, i) => ({ r, i })).filter(({ i }) => checked[i] && (allocs[i] ?? []).some((a) => a.chargeId && a.amount > 0)).map(({ r, i }) => ({
      hash: r.row.hash!, total: r.row.amount, date: r.row.date, note: r.row.payer || r.row.purpose, allocations: allocs[i].filter((a) => a.chargeId && a.amount > 0),
    }));
    try {
      const res = await applyMatches(items);
      setMsg(res.ok ? { ok: `Evidentirano ${res.ok} uplata.${res.advance ? ` Kao avans upisano ${rsd(res.advance)}.` : ''}${res.skipped ? ` Preskočeno jer su već upisane: ${res.skipped}.` : ''}` } : { error: res.error });
      if (res.ok) { setResults(null); setRows([]); }
    } catch {
      setMsg({ error: 'Nema veze sa serverom. Ništa nije upisano, pokušaj ponovo.' });
    }
  });

  const setAlloc = (i: number, idx: number, patch: Partial<Allocation>) => setAllocs((all) => {
    const list = [...(all[i] ?? [])];
    list[idx] = { ...(list[idx] ?? { chargeId: '', amount: 0 }), ...patch };
    return { ...all, [i]: list };
  });
  const selected = Object.entries(checked).filter(([i, v]) => v && (allocs[Number(i)] ?? []).some((a) => a.chargeId)).length;

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
          {info.already > 0 && <div className="rounded-xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok">Preskočeno {info.already} redova koji su već uvezeni ranije, pa se uplate neće duplirati.</div>}
          {info.truncated > 0 && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">Obrađeno je prvih 1000 uplata. Preostalih {info.truncated} uvezi u sledećem koraku istim fajlom.</div>}
          {results.map((r, i) => (
            <div key={i} className={`card p-3.5 ${checked[i] ? 'ring-2 ring-ok/40' : ''}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1F7A4D]" checked={!!checked[i]} disabled={!(allocs[i] ?? []).some((a) => a.chargeId)} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} aria-label="Potvrdi uplatu" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-extrabold text-ink">{r.row.payer || 'Nepoznat uplatilac'}</span>
                    <span className="shrink-0 font-extrabold tabular-nums text-ok">{rsd(r.row.amount)}</span>
                  </div>
                  <div className="truncate text-[12px] font-semibold text-mut">{[r.row.date, r.row.purpose, r.row.reference].filter(Boolean).join(' · ')}</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {(allocs[i]?.length ? allocs[i] : [{ chargeId: '', amount: r.row.amount }]).map((a, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <select className="input h-10 min-w-0 flex-1 basis-56" value={a.chargeId} onChange={(e) => {
                          const v = e.target.value;
                          const rem = open.find((o) => o.id === v)?.remaining ?? 0;
                          setAllocs((all) => {
                            const list = all[i]?.length ? [...all[i]] : [{ chargeId: '', amount: r.row.amount }];
                            const others = list.reduce((x, y, j) => (j === idx ? x : x + Number(y.amount || 0)), 0);
                            const free = Math.max(0, r.row.amount - others);
                            list[idx] = { chargeId: v, amount: v ? Math.min(free, rem) || free : free };
                            return { ...all, [i]: list };
                          });
                          setChecked((c) => ({ ...c, [i]: !!v }));
                        }}>
                          <option value="">Ne uparuj</option>
                          {open.map((o) => <option key={o.id} value={o.id}>{o.student} · {o.period}{o.description ? ` · ${o.description}` : ''} · {rsd(o.remaining)}</option>)}
                        </select>
                        <input type="number" min={0} step="0.01" className="input h-10 w-28" aria-label="Iznos za ovo zaduženje" value={a.amount} onChange={(e) => setAlloc(i, idx, { amount: Number(e.target.value) })} />
                        {idx > 0 && <button type="button" className="text-[13px] font-bold text-coral-dark" onClick={() => setAllocs((all) => ({ ...all, [i]: all[i].filter((_, j) => j !== idx) }))}>ukloni</button>}
                      </div>
                    ))}
                    {(() => {
                      const used = (allocs[i] ?? []).filter((a) => a.chargeId).reduce((x, a) => x + Number(a.amount || 0), 0);
                      const rest = Math.round((r.row.amount - used) * 100) / 100;
                      return (
                        <div className="flex flex-wrap items-center gap-3 text-[12px] font-bold">
                          <button type="button" className="text-brand hover:underline" onClick={() => setAllocs((all) => ({ ...all, [i]: [...(all[i] ?? []), { chargeId: '', amount: Math.max(0, rest) }] }))}>+ Podeli na još jedno zaduženje</button>
                          {used > 0 && rest > 0 && <span className="text-coral-dark">Ostatak {rsd(rest)} ide kao avans učeniku.</span>}
                          {rest < 0 && <span className="text-coral-dark">Raspoređeno je više od uplate za {rsd(-rest)}. Višak se ne upisuje.</span>}
                        </div>
                      );
                    })()}
                  </div>
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
