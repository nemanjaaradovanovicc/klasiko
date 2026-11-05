'use client';

import { useState, useTransition } from 'react';
import { readSheet } from 'read-excel-file/browser';
import Link from 'next/link';
import { importStudents, type ImportRow } from '../actions';
import { downloadXlsx } from '@/lib/excel';
import { isISODate } from '@/lib/format';
import { fixImportedPhone } from '@/lib/phone';

const FIELDS: { key: keyof ImportRow; label: string; match: RegExp }[] = [
  { key: 'first_name', label: 'Ime', match: /^(ime|first|ime učenika|ime ucenika|ime i prezime|učenik|ucenik|name)$/i },
  { key: 'last_name', label: 'Prezime', match: /^(prezime|last|surname)$/i },
  { key: 'birth_date', label: 'Datum rođenja', match: /rođ|rodj|birth/i },
  { key: 'phone', label: 'Telefon', match: /^(telefon|tel|mobilni|phone)$/i },
  { key: 'email', label: 'Email', match: /^(e-?mail|mejl)$/i },
  { key: 'parent_name', label: 'Roditelj', match: /roditelj|staratelj|parent/i },
  { key: 'parent_phone', label: 'Telefon roditelja', match: /telefon rod|tel\. rod|parent phone/i },
  { key: 'parent_email', label: 'Email roditelja', match: /mail rod|parent mail/i },
  { key: 'group', label: 'Grupa', match: /^(grupa|group|nivo)$/i },
  { key: 'notes', label: 'Napomena', match: /napom|beleš|notes/i },
];

type Cell = string | number | boolean | Date | null;

function toISO(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{4})\.?$/);
    const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v.trim();
    // 31. 2. 2015. nije datum: polje ostaje prazno, a uvoz ostalih redova se nastavlja.
    return isISODate(iso) ? iso : null;
  }
  return null;
}

export function Importer() {
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ ok?: number; groups?: number; duplicates?: number; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  async function onFile(f: File) {
    setError('');
    setResult(null);
    try {
      const data = (await readSheet(f)) as Cell[][];
      const nonEmpty = data.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
      if (nonEmpty.length < 2) return setError('Tabela je prazna ili nema zaglavlje.');
      const h = nonEmpty[0].map((c) => String(c ?? '').trim());
      const m: Record<string, number> = {};
      // Prvo uža polja (telefon roditelja), da „Telefon roditelja” ne završi kao ime roditelja.
      [...FIELDS].sort((a, b) => Number(b.key === 'parent_phone' || b.key === 'parent_email') - Number(a.key === 'parent_phone' || a.key === 'parent_email')).forEach((fl) => {
        const i = h.findIndex((x, idx) => fl.match.test(x) && !Object.values(m).includes(idx));
        if (i >= 0) m[fl.key] = i;
      });
      setHeader(h);
      setRows(nonEmpty.slice(1));
      setMap(m);
    } catch {
      setError('Fajl nije moguće pročitati. Sačuvaj ga kao .xlsx i probaj ponovo.');
    }
  }

  function build(): ImportRow[] {
    return rows.map((r) => {
      const get = (k: string) => (map[k] !== undefined ? r[map[k]] : null);
      const str = (k: string) => {
        const v = get(k);
        return v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
      };
      let first = str('first_name') ?? '';
      let last = str('last_name') ?? '';
      if (first && !last && map.last_name === undefined && first.includes(' ')) {
        const parts = first.split(/\s+/);
        first = parts.shift()!;
        last = parts.join(' ');
      }
      return {
        first_name: first,
        last_name: last,
        birth_date: toISO(get('birth_date')),
        phone: fixImportedPhone(str('phone')),
        email: str('email'),
        parent_name: str('parent_name'),
        parent_phone: fixImportedPhone(str('parent_phone')),
        parent_email: str('parent_email'),
        group: str('group'),
        notes: str('notes'),
      };
    });
  }

  const preview = rows.length ? build() : [];
  const valid = preview.filter((r) => r.first_name);
  const badDates = map.birth_date === undefined ? 0 : rows.filter((r, i) => { const c = r[map.birth_date!]; return c !== null && c !== undefined && String(c).trim() !== '' && !preview[i].birth_date; }).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-5">
        <div className="text-[15px] font-semibold text-ink-2">
          Tabela treba da ima zaglavlje u prvom redu, npr. <b>Ime, Prezime, Datum rođenja, Roditelj, Telefon roditelja, Grupa</b>. Grupe koje ne postoje biće napravljene.
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="btn cursor-pointer">
            Izaberi Excel fajl
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => downloadXlsx('klasiko-sablon-ucenici.xlsx', ['Ime', 'Prezime', 'Datum rođenja', 'Telefon', 'Email', 'Roditelj', 'Telefon roditelja', 'Email roditelja', 'Grupa', 'Napomena'], [['Ana', 'Petrović', '14.03.2015', '', '', 'Marija Petrović', '0641234567', '', 'Engleski B1', '']])}
          >
            Preuzmi šablon
          </button>
        </div>
        {error && <div className="mt-3 rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{error}</div>}
      </div>

      {rows.length > 0 && result?.ok === undefined && (
        <div className="card p-5">
          <h2 className="text-[17px] font-extrabold text-ink">Poveži kolone</h2>
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
          <div className="mt-5 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead><tr>{['Ime', 'Prezime', 'Rođen', 'Roditelj', 'Telefon', 'Grupa'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {preview.slice(0, 8).map((r, i) => (
                  <tr key={i} className={r.first_name ? '' : 'opacity-40'}>
                    <td className="td">{r.first_name}</td><td className="td">{r.last_name}</td><td className="td">{r.birth_date}</td>
                    <td className="td">{r.parent_name}</td><td className="td">{r.parent_phone || r.phone}</td><td className="td">{r.group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn" disabled={pending || valid.length === 0 || map.first_name === undefined} onClick={() => start(async () => setResult(await importStudents(valid)))}>
              {pending ? 'Uvozim...' : `Uvezi ${valid.length} učenika`}
            </button>
            <span className="text-[13px] font-semibold text-mut">Prikazano prvih {Math.min(8, preview.length)} od {preview.length} redova. Učenici koji već postoje se preskaču.</span>
            {badDates > 0 && <span className="w-full text-[13px] font-bold text-coral-dark">Neispravan datum rođenja u {badDates} redova: ti redovi se uvoze bez datuma.</span>}
          </div>
        </div>
      )}

      {result?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{result.error}</div>}
      {result?.ok !== undefined && (
        <div className="card p-6 text-center">
          <div className="text-[22px] font-extrabold text-ok">Uvezeno {result.ok} učenika</div>
          {result.duplicates ? <p className="mt-1 font-semibold text-mut">Preskočeno jer već postoje: {result.duplicates}.</p> : null}
          {result.groups ? <p className="mt-1 font-semibold text-mut">Napravljeno novih grupa: {result.groups}. Podesi im cenu i raspored.</p> : null}
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/ucenici" className="btn">Pogledaj učenike</Link>
            <Link href="/grupe" className="btn btn-soft">Grupe</Link>
          </div>
        </div>
      )}
    </div>
  );
}
