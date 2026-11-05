import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { dateLong, fullName, parseDate } from '@/lib/format';
import { Taker } from './taker';
import { ConfirmButton } from '@/components/confirm';
import type { AttStatus } from '../actions';
import { scheduleMakeup, cancelMakeup } from '../actions';
import { Card, Flash } from '@/components/ui';
import { addDays, dateSr, time } from '@/lib/format';

export const metadata = { title: 'Upis prisustva' };

export default async function TakeAttendance({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ datum?: string; vreme?: string; ok?: string; err?: string }> }) {
  const ctx = await requireOrg();
  const { groupId } = await params;
  const sp = await searchParams;
  const date = parseDate(sp.datum);
  const startTime = sp.vreme && /^\d{2}:\d{2}$/.test(sp.vreme) ? sp.vreme : '00:00';
  const supabase = await createClient();
  const { data: g } = await supabase.from('groups').select('id, name, color, teacher_id').eq('id', groupId).eq('org_id', ctx.org.id).single();
  if (!g) notFound();
  const [{ data: members }, { data: session }, { data: notices }, { data: teachers }] = await Promise.all([
    supabase.from('group_members').select('students(id, first_name, last_name, active)').eq('group_id', groupId),
    supabase.from('sessions').select('id, status, note, makeup_for, teacher_id, attendance(student_id, status)').eq('group_id', groupId).eq('date', date).eq('start_time', startTime + ':00').maybeSingle(),
    supabase.from('absence_notices').select('student_id, note').eq('org_id', ctx.org.id).eq('date', date),
    ctx.isOwner ? supabase.from('profiles').select('id, full_name').eq('org_id', ctx.org.id).eq('active', true).order('full_name') : Promise.resolve({ data: null }),
  ]);
  const { data: makeups } = session ? await supabase.from('sessions').select('id, date, start_time, status').eq('makeup_for', session.id) : { data: [] };
  const { data: slot } = await supabase.from('schedule_slots').select('end_time').eq('group_id', groupId).eq('start_time', startTime + ':00').limit(1).maybeSingle();
  const back = `/prisustvo/${groupId}?datum=${date}&vreme=${startTime}`;
  type M = { students: { id: string; first_name: string; last_name: string; active: boolean } | null };
  const students = ((members ?? []) as unknown as M[])
    .map((m) => m.students)
    .filter((s): s is NonNullable<M['students']> => !!s && s.active)
    .map((s) => ({ id: s.id, name: fullName(s) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sr'));
  const initial: Record<string, AttStatus> = {};
  for (const a of (session?.attendance ?? []) as { student_id: string; status: AttStatus }[]) initial[a.student_id] = a.status;

  return (
    <>
      <PageHeader
        title={g.name}
        subtitle={`${dateLong(date)}${startTime !== '00:00' ? ` · ${startTime}` : ''}`}
        back={{ href: `/prisustvo?datum=${date}`, label: 'Prisustvo' }}
      />
      <Flash ok={sp.ok === 'nadoknada' ? 'Nadoknada je zakazana i vidi se u Prisustvu za taj dan.' : undefined} err={sp.err} />
      <Taker
        groupId={g.id}
        date={date}
        startTime={startTime}
        students={students}
        initial={initial}
        initialStatus={session?.status === 'cancelled' ? 'cancelled' : 'held'}
        initialNote={session?.note ?? ''}
        saved={!!session && session.status !== 'planned'}
        absences={Object.fromEntries((notices ?? []).map((n) => [n.student_id, n.note ?? '']))}
        teachers={teachers ?? undefined}
        initialTeacher={session?.teacher_id ?? g.teacher_id ?? ''}
      />
      {session?.status === 'cancelled' && (
        <Card title="Nadoknada" className="mt-6">
          {(makeups ?? []).length > 0 ? (
            <ul className="flex flex-col gap-2">
              {(makeups ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2.5">
                  <a href={`/prisustvo/${groupId}?datum=${m.date}&vreme=${time(m.start_time)}`} className="font-bold text-brand">{dateSr(m.date)} u {time(m.start_time)}{m.status === 'held' ? ' · održana' : ' · zakazana'}</a>
                  {m.status === 'planned' && (
                    <form action={cancelMakeup}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><ConfirmButton message="Otkazati ovu nadoknadu?" className="text-[13px] font-bold text-coral-dark">Otkaži</ConfirmButton></form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <form action={scheduleMakeup} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="session_id" value={session.id} />
              <input type="hidden" name="back" value={back} />
              <label className="block"><span className="label">Datum</span><input className="input" type="date" name="date" defaultValue={addDays(date, 7)} required /></label>
              <label className="block"><span className="label">Od</span><input className="input" type="time" name="start_time" defaultValue={startTime !== '00:00' ? startTime : '17:00'} required /></label>
              <label className="block"><span className="label">Do</span><input className="input" type="time" name="end_time" defaultValue={slot?.end_time ? time(slot.end_time) : ''} /></label>
              <button className="btn">Zakaži nadoknadu</button>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
