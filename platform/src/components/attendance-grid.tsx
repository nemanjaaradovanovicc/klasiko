import Link from 'next/link';
import { periodLabel, shiftPeriod } from '@/lib/format';

export interface GridSession { id: string; date: string; status: string; attendance: { student_id: string; status: string }[] }

// Mesečni pregled prisustva grupe: učenici u redovima, časovi u kolonama.
export function AttendanceGrid({ students, sessions, period, baseHref }: {
  students: { id: string; name: string }[];
  sessions: GridSession[];
  period: string;
  baseHref: string;
}) {
  const held = sessions.filter((s) => s.status === 'held').sort((a, b) => a.date.localeCompare(b.date));
  const mark = (s: GridSession, sid: string) => s.attendance.find((a) => a.student_id === sid)?.status;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`${baseHref}?mesec=${shiftPeriod(period, -1)}#prisustvo`} className="btn btn-sm btn-soft" aria-label="Prethodni mesec">←</Link>
        <span className="text-[15px] font-extrabold text-ink">{periodLabel(period)}</span>
        <Link href={`${baseHref}?mesec=${shiftPeriod(period, 1)}#prisustvo`} className="btn btn-sm btn-soft" aria-label="Sledeći mesec">→</Link>
      </div>
      {held.length === 0 ? (
        <p className="text-[14px] font-semibold text-mut">U ovom mesecu nema upisanih časova.</p>
      ) : (
        <div className="no-scrollbar -mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
          <table className="border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white pb-2 pr-3 text-left text-[12px] font-extrabold text-mut">Učenik</th>
                {held.map((s) => (
                  <th key={s.id} className="px-1 pb-2 text-center text-[11px] font-extrabold tabular-nums text-mut">{Number(s.date.slice(8, 10))}.</th>
                ))}
                <th className="pb-2 pl-2 text-right text-[12px] font-extrabold text-mut">%</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const marks = held.map((s) => mark(s, st.id));
                const counted = marks.filter((m) => m === 'present' || m === 'absent');
                const pct = counted.length ? Math.round((marks.filter((m) => m === 'present').length / counted.length) * 100) : null;
                return (
                  <tr key={st.id}>
                    <td className="sticky left-0 z-10 max-w-[140px] truncate bg-white py-1 pr-3 font-bold text-ink">{st.name}</td>
                    {marks.map((m, i) => (
                      <td key={i} className="px-1 py-1 text-center">
                        <span className={`inline-grid h-6 w-6 place-items-center rounded-md text-[12px] font-extrabold ${m === 'present' ? 'bg-ok text-white' : m === 'absent' ? 'bg-coral text-white' : m === 'excused' ? 'bg-[#cfc8d8] text-white' : 'bg-soft text-mut/50'}`}>
                          {m === 'present' ? '✓' : m === 'absent' ? '✕' : m === 'excused' ? '–' : '·'}
                        </span>
                      </td>
                    ))}
                    <td className={`py-1 pl-2 text-right font-extrabold tabular-nums ${pct !== null && pct < 70 ? 'text-coral-dark' : 'text-ink'}`}>{pct === null ? '—' : `${pct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[12px] font-semibold text-mut">✓ bio · ✕ nije bio · – opravdano. Procenat ne računa opravdane izostanke.</p>
    </div>
  );
}
