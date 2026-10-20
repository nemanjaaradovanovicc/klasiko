'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X, Minus } from 'lucide-react';
import { saveAttendance, type AttStatus } from '../actions';

interface S { id: string; name: string }

export function Taker({ groupId, date, startTime, students, initial, initialStatus, initialNote, saved }: {
  groupId: string; date: string; startTime: string; students: S[]; initial: Record<string, AttStatus>; initialStatus: 'held' | 'cancelled'; initialNote: string; saved: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, AttStatus>>(() => {
    const m: Record<string, AttStatus> = {};
    students.forEach((s) => (m[s.id] = initial[s.id] ?? 'present'));
    return m;
  });
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(saved ? { ok: true } : null);
  const [pending, start] = useTransition();

  const present = Object.values(marks).filter((v) => v === 'present').length;
  const set = (id: string, v: AttStatus) => { setMarks((m) => ({ ...m, [id]: v })); setMsg(null); };
  const save = () => start(async () => setMsg(await saveAttendance({ groupId, date, startTime, status, note, marks })));

  const btn = (active: boolean, tone: string) => `grid h-11 w-11 place-items-center rounded-xl transition ${active ? tone : 'bg-soft text-mut hover:bg-soft-2'}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setStatus('held'); setMsg(null); }} className={`btn btn-sm ${status === 'held' ? '' : 'btn-soft'}`}>Čas je održan</button>
        <button type="button" onClick={() => { setStatus('cancelled'); setMsg(null); }} className={`btn btn-sm ${status === 'cancelled' ? 'btn-coral' : 'btn-soft'}`}>Čas je otkazan</button>
        {status === 'held' && (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMarks(Object.fromEntries(students.map((s) => [s.id, 'present' as AttStatus]))); setMsg(null); }}>Svi prisutni</button>
            <span className="ml-auto text-[14px] font-extrabold text-ink">{present} / {students.length} prisutno</span>
          </>
        )}
      </div>

      {status === 'held' ? (
        students.length === 0 ? (
          <div className="card p-6 text-center font-semibold text-mut">U grupi nema učenika.</div>
        ) : (
          <ul className="card divide-y divide-line">
            {students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`min-w-0 flex-1 truncate text-[16px] font-bold ${marks[s.id] === 'present' ? 'text-ink' : 'text-mut'}`}>{s.name}</span>
                <button type="button" aria-label="Prisutan" onClick={() => set(s.id, 'present')} className={btn(marks[s.id] === 'present', 'bg-ok text-white')}><Check size={22} strokeWidth={3} /></button>
                <button type="button" aria-label="Odsutan" onClick={() => set(s.id, 'absent')} className={btn(marks[s.id] === 'absent', 'bg-coral text-white')}><X size={22} strokeWidth={3} /></button>
                <button type="button" aria-label="Opravdano" onClick={() => set(s.id, 'excused')} className={btn(marks[s.id] === 'excused', 'bg-[#8b8394] text-white')}><Minus size={22} strokeWidth={3} /></button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="card p-5 text-[15px] font-semibold text-ink-2">Otkazan čas se ne računa u prisustvo. Dodaj razlog ispod, npr. „predavač bolestan, nadoknada u četvrtak”.</div>
      )}

      <label className="block">
        <span className="label">Beleška o času</span>
        <input className="input" value={note} onChange={(e) => { setNote(e.target.value); setMsg(null); }} placeholder="Šta je rađeno, domaći, napomena..." />
      </label>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur lg:bottom-4">
        <button type="button" className="btn h-12 flex-1 text-base sm:flex-none" onClick={save} disabled={pending}>{pending ? 'Čuvam...' : 'Sačuvaj prisustvo'}</button>
        {msg?.ok && <span className="text-[14px] font-extrabold text-ok">Sačuvano ✓</span>}
        {msg?.error && <span className="text-[14px] font-extrabold text-coral-dark">{msg.error}</span>}
        <Link href={`/prisustvo?datum=${date}`} className="text-[14px] font-bold text-mut hover:text-brand">Nazad na listu</Link>
      </div>
    </div>
  );
}
