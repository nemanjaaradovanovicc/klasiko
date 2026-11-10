'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X, Minus } from 'lucide-react';
import { saveAttendance, type AttStatus } from '../actions';

interface S { id: string; name: string }

type Draft = { marks: Record<string, AttStatus>; status: 'held' | 'cancelled'; note: string; teacherId: string };

export function Taker({ groupId, date, startTime, students, initial, initialStatus, initialNote, saved, absences = {}, teachers, initialTeacher = '', dropIn = false, roster = [] }: {
  groupId: string; date: string; startTime: string; students: S[]; initial: Record<string, AttStatus>; initialStatus: 'held' | 'cancelled'; initialNote: string; saved: boolean;
  absences?: Record<string, string>; teachers?: { id: string; full_name: string }[]; initialTeacher?: string;
  dropIn?: boolean; roster?: S[];
}) {
  const [extras, setExtras] = useState<S[]>(() => {
    const known = new Set(students.map((s) => s.id));
    return roster.filter((s) => !known.has(s.id) && initial[s.id]);
  });
  const list = [...students, ...extras];
  const [marks, setMarks] = useState<Record<string, AttStatus>>(() => {
    const m: Record<string, AttStatus> = {};
    // Izostanak koji je roditelj javio unapred se predlaže kao opravdan.
    for (const s of [...students, ...roster.filter((r) => !students.some((x) => x.id === r.id) && initial[r.id])]) {
      m[s.id] = initial[s.id] ?? (absences[s.id] !== undefined ? 'excused' : 'present');
    }
    return m;
  });
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [teacherId, setTeacherId] = useState(initialTeacher);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string; info?: string } | null>(saved ? { ok: true } : null);
  const [pending, start] = useTransition();

  // Nacrt na telefonu: upisano prisustvo ne sme da se izgubi kad nestane internet (sala, podrum, garaža).
  const draftKey = `klasiko_prisustvo_${groupId}_${date}_${startTime}`;
  const dirty = useRef(false);
  const retry = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      setMarks((m) => ({ ...m, ...Object.fromEntries(Object.entries(d.marks).filter(([id]) => id in m)) }));
      setStatus(d.status);
      setNote(d.note);
      if (d.teacherId !== undefined) setTeacherId(d.teacherId);
      dirty.current = true;
      setMsg({ info: 'Vraćen je nesačuvan unos sa ovog uređaja. Proveri i sačuvaj.' });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!dirty.current) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ marks, status, note, teacherId } satisfies Draft)); } catch {}
  }, [draftKey, marks, status, note, teacherId]);

  const touch = () => { dirty.current = true; setMsg(null); };
  const present = Object.values(marks).filter((v) => v === 'present').length;
  const set = (id: string, v: AttStatus) => { touch(); setMarks((m) => ({ ...m, [id]: v })); };
  const save = () => start(async () => {
    try {
      const res = await saveAttendance({ groupId, date, startTime, status, note, marks, ...(teachers ? { teacherId: teacherId || null } : {}) });
      setMsg(res);
      if (res.ok) {
        dirty.current = false;
        retry.current = false;
        try { localStorage.removeItem(draftKey); } catch {}
      }
    } catch {
      // Pad mreže: nacrt ostaje na uređaju i šalje se čim se veza vrati.
      dirty.current = true;
      retry.current = true;
      try { localStorage.setItem(draftKey, JSON.stringify({ marks, status, note, teacherId } satisfies Draft)); } catch {}
      setMsg({ error: 'Nema veze sa serverom. Unos je sačuvan na ovom uređaju i biće poslat čim se veza vrati.' });
    }
  });
  useEffect(() => {
    const onOnline = () => { if (retry.current) save(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });

  const btn = (active: boolean, tone: string) => `grid h-11 w-11 place-items-center rounded-xl transition ${active ? tone : 'bg-soft text-mut hover:bg-soft-2'}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { touch(); setStatus('held'); }} className={`btn btn-sm ${status === 'held' ? '' : 'btn-soft'}`}>Čas je održan</button>
        <button type="button" onClick={() => { touch(); setStatus('cancelled'); }} className={`btn btn-sm ${status === 'cancelled' ? 'btn-coral' : 'btn-soft'}`}>Čas je otkazan</button>
        {status === 'held' && (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { touch(); setMarks(Object.fromEntries(list.map((s) => [s.id, 'present' as AttStatus]))); }}>Svi prisutni</button>
            <span className="ml-auto text-[14px] font-extrabold text-ink">{present} / {list.length} prisutno</span>
          </>
        )}
      </div>

      {dropIn && status === 'held' && (
        <label className="block">
          <span className="label">Dodaj dete samo za ovaj čas</span>
          <select
            className="input"
            value=""
            onChange={(e) => {
              const picked = roster.find((r) => r.id === e.target.value);
              if (!picked || list.some((s) => s.id === picked.id)) return;
              touch();
              setExtras((xs) => [...xs, picked]);
              setMarks((m) => ({ ...m, [picked.id]: absences[picked.id] !== undefined ? 'excused' : 'present' }));
            }}
          >
            <option value="">Izaberi učenika</option>
            {roster.filter((r) => !list.some((s) => s.id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}

      {status === 'held' ? (
        list.length === 0 ? (
          <div className="card p-6 text-center font-semibold text-mut">{dropIn ? 'Niko nije dodat za ovaj čas. Izaberi dete iznad.' : 'U grupi nema učenika.'}</div>
        ) : (
          <ul className="card divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[16px] font-bold ${marks[s.id] === 'present' ? 'text-ink' : 'text-mut'}`}>{s.name}</span>
                  {absences[s.id] !== undefined && <span className="block truncate text-[12px] font-bold text-coral-dark">Roditelj javio izostanak{absences[s.id] ? `: ${absences[s.id]}` : ''}</span>}
                </span>
                <button type="button" aria-label="Prisutan" onClick={() => set(s.id, 'present')} className={btn(marks[s.id] === 'present', 'bg-ok text-white')}><Check size={22} strokeWidth={3} /></button>
                <button type="button" aria-label="Odsutan" onClick={() => set(s.id, 'absent')} className={btn(marks[s.id] === 'absent', 'bg-coral text-white')}><X size={22} strokeWidth={3} /></button>
                <button type="button" aria-label="Opravdano" onClick={() => set(s.id, 'excused')} className={btn(marks[s.id] === 'excused', 'bg-[#8b8394] text-white')}><Minus size={22} strokeWidth={3} /></button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="card p-5 text-[15px] font-semibold text-ink-2">Otkazan čas se ne računa u prisustvo i ne troši paket. Ako nema dogovorene nadoknade, rok paketa se produžava za nedelju dana. Dodaj razlog ispod, npr. „predavač bolestan”.</div>
      )}

      {teachers && (
        <label className="block">
          <span className="label">Čas je držao/la</span>
          <select className="input" value={teacherId} onChange={(e) => { touch(); setTeacherId(e.target.value); }}>
            <option value="">Bez predavača</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label">Beleška o času</span>
        <input className="input" value={note} onChange={(e) => { touch(); setNote(e.target.value); }} placeholder="Šta je rađeno, domaći, napomena..." />
      </label>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur lg:bottom-4">
        <button type="button" className="btn h-12 flex-1 text-base sm:flex-none" onClick={save} disabled={pending}>{pending ? 'Čuvam...' : 'Sačuvaj prisustvo'}</button>
        {msg?.ok && <span className="text-[14px] font-extrabold text-ok">Sačuvano ✓</span>}
        {msg?.error && <span className="text-[14px] font-extrabold text-coral-dark">{msg.error}</span>}
        {msg?.info && <span className="text-[14px] font-extrabold text-brand">{msg.info}</span>}
        <Link href={`/prisustvo?datum=${date}`} className="text-[14px] font-bold text-mut hover:text-brand">Nazad na listu</Link>
      </div>
    </div>
  );
}
