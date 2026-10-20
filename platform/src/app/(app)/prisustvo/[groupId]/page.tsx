import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { dateLong, fullName, todayISO } from '@/lib/format';
import { Taker } from './taker';
import type { AttStatus } from '../actions';

export const metadata = { title: 'Upis prisustva' };

export default async function TakeAttendance({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ datum?: string; vreme?: string }> }) {
  const ctx = await requireOrg();
  const { groupId } = await params;
  const sp = await searchParams;
  const date = sp.datum && /^\d{4}-\d{2}-\d{2}$/.test(sp.datum) ? sp.datum : todayISO();
  const startTime = sp.vreme && /^\d{2}:\d{2}$/.test(sp.vreme) ? sp.vreme : '00:00';
  const supabase = await createClient();
  const { data: g } = await supabase.from('groups').select('id, name, color').eq('id', groupId).eq('org_id', ctx.org.id).single();
  if (!g) notFound();
  const [{ data: members }, { data: session }] = await Promise.all([
    supabase.from('group_members').select('students(id, first_name, last_name, active)').eq('group_id', groupId),
    supabase.from('sessions').select('id, status, note, attendance(student_id, status)').eq('group_id', groupId).eq('date', date).eq('start_time', startTime + ':00').maybeSingle(),
  ]);
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
      <Taker
        groupId={g.id}
        date={date}
        startTime={startTime}
        students={students}
        initial={initial}
        initialStatus={(session?.status as 'held' | 'cancelled') ?? 'held'}
        initialNote={session?.note ?? ''}
        saved={!!session}
      />
    </>
  );
}
