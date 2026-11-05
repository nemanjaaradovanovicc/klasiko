import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Select, Badge } from '@/components/ui';
import { GroupFields } from '@/components/group-form';
import { WEEKDAYS, time, fullName, todayISO, isoWeekday } from '@/lib/format';
import type { Group } from '@/lib/types';
import { updateGroup, setGroupActive, deleteGroup, addSlot, deleteSlot, addMembers } from '../actions';
import { removeFromGroup } from '../../ucenici/actions';
import { AttendanceGrid, type GridSession } from '@/components/attendance-grid';
import { parsePeriod, shiftPeriod } from '@/lib/format';
import { ConfirmButton, TypedConfirm } from '@/components/confirm';
import { promoteFromWaitlist, removeFromWaitlist } from '../actions';
import { fetchAll } from '@/lib/supabase/fetch-all';

const OK: Record<string, string> = { '1': 'Sačuvano.', nova: 'Grupa je napravljena. Dodaj učenike i termine.', termin: 'Termin je dodat u raspored.', clanovi: 'Učenici su dodati.', cekanje: 'Grupa je popunjena, pa su učenici bez mesta na listi čekanja.' };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; mesec?: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: g } = await supabase.from('groups').select('*').eq('id', id).eq('org_id', ctx.org.id).single<Group>();
  if (!g) notFound();
  const period = parsePeriod(sp.mesec);
  const [{ data: members }, { data: slots }, { data: teachers }, { data: rooms }, all, { data: monthSessions }, { data: waiting }] = await Promise.all([
    supabase.from('group_members').select('student_id, students(id, first_name, last_name, parent_phone, phone, active)').eq('group_id', id),
    supabase.from('schedule_slots').select('id, weekday, start_time, end_time, rooms(name)').eq('group_id', id).order('weekday').order('start_time'),
    supabase.from('profiles').select('id, full_name').eq('org_id', ctx.org.id).eq('active', true).order('full_name'),
    supabase.from('rooms').select('id, name').eq('org_id', ctx.org.id).order('name'),
    ctx.isOwner ? fetchAll<{ id: string; first_name: string; last_name: string }>((a, b) => supabase.from('students').select('id, first_name, last_name').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b)) : Promise.resolve([]),
    supabase.from('sessions').select('id, date, status, attendance(student_id, status)').eq('group_id', id).gte('date', `${period}-01`).lt('date', `${shiftPeriod(period, 1)}-01`),
    supabase.from('group_waitlist').select('student_id, created_at, students(first_name, last_name)').eq('group_id', id).order('created_at'),
  ]);
  type M = { student_id: string; students: { id: string; first_name: string; last_name: string; parent_phone: string | null; phone: string | null; active: boolean } | null };
  const mem = ((members ?? []) as unknown as M[]).filter((m) => m.students).sort((a, b) => fullName(a.students!).localeCompare(fullName(b.students!), 'sr'));
  const inGroup = new Set(mem.map((m) => m.student_id));
  type W = { student_id: string; created_at: string; students: { first_name: string; last_name: string } | null };
  const waitList = (waiting ?? []) as unknown as W[];
  const onWait = new Set(waitList.map((w) => w.student_id));
  const candidates = all.filter((s) => !inGroup.has(s.id) && !onWait.has(s.id));
  const seatsLeft = g.capacity ? Math.max(0, g.capacity - mem.length) : null;
  type S = { id: string; weekday: number; start_time: string; end_time: string; rooms: { name: string } | null };
  const sl = (slots ?? []) as unknown as S[];
  const today = todayISO();
  const todaySlot = sl.find((x) => x.weekday === isoWeekday(today));

  return (
    <>
      <PageHeader
        title={g.name}
        subtitle={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{mem.length} učenika{g.capacity ? ` od ${g.capacity}` : ''}{!g.active ? ' · u arhivi' : ''}</span>}
        back={{ href: '/grupe', label: ctx.isOwner ? 'Grupe' : 'Moje grupe' }}
        actions={<>{todaySlot && <Link href={`/prisustvo/${g.id}?datum=${today}&vreme=${time(todaySlot.start_time)}`} className="btn">Prisustvo danas</Link>}{ctx.isOwner && <Link href={`/grupe/${g.id}/diplome`} className="btn btn-soft">Diplome</Link>}</>}
      />
      <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          <Card title={`Učenici (${mem.length})`}>
            {mem.length === 0 ? (
              <p className="text-[14px] font-semibold text-mut">U grupi još nema učenika.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {mem.map((m) => (
                  <li key={m.student_id} className="flex items-center justify-between gap-3 py-2.5">
                    {ctx.isOwner ? (
                      <Link href={`/ucenici/${m.student_id}`} className="min-w-0 truncate font-bold text-ink hover:text-brand">{fullName(m.students!)}</Link>
                    ) : (
                      <span className="min-w-0 truncate font-bold text-ink">{fullName(m.students!)}</span>
                    )}
                    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
                      {(m.students!.parent_phone || m.students!.phone) && (
                        <a href={`tel:${m.students!.parent_phone || m.students!.phone}`} className="text-[13px] font-bold text-brand">{m.students!.parent_phone || m.students!.phone}</a>
                      )}
                      {ctx.isOwner && (
                        <form action={removeFromGroup}>
                          <input type="hidden" name="student_id" value={m.student_id} />
                          <input type="hidden" name="group_id" value={g.id} />
                          <input type="hidden" name="back" value={`/grupe/${g.id}`} />
                          <ConfirmButton message={`Ukloniti ${fullName(m.students!)} iz grupe?`} className="text-[13px] font-bold text-coral-dark hover:underline">Ukloni</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {ctx.isOwner && candidates.length > 0 && (
              <form action={addMembers} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="group_id" value={g.id} />
                <span className="label">Dodaj učenike (možeš izabrati više){seatsLeft !== null ? ` · slobodno mesta: ${seatsLeft}` : ''}</span>
                <select name="student_id" multiple className="input h-40 py-2">
                  {candidates.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn btn-soft">Dodaj izabrane</button>
                  <Link href={`/ucenici/novi?grupa=${g.id}`} className="btn btn-ghost">+ Novi učenik u ovu grupu</Link>
                </div>
              </form>
            )}
          </Card>

          {waitList.length > 0 && (
            <Card title={`Lista čekanja (${waitList.length})`}>
              {seatsLeft !== null && seatsLeft > 0 && <p className="mb-3 rounded-xl bg-ok-soft px-3 py-2 text-[13px] font-bold text-ok">Slobodno mesta: {seatsLeft}. Upiši učenika sa liste.</p>}
              <ul className="flex flex-col divide-y divide-line">
                {waitList.map((w) => (
                  <li key={w.student_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0 truncate font-bold text-ink">{w.students ? fullName(w.students) : ''}</span>
                    {ctx.isOwner && (
                      <span className="flex items-center gap-3">
                        <form action={promoteFromWaitlist}><input type="hidden" name="group_id" value={g.id} /><input type="hidden" name="student_id" value={w.student_id} /><button className="btn btn-sm btn-soft" disabled={seatsLeft === 0}>Upiši</button></form>
                        <form action={removeFromWaitlist}><input type="hidden" name="group_id" value={g.id} /><input type="hidden" name="student_id" value={w.student_id} /><ConfirmButton message="Ukloniti sa liste čekanja?" className="text-[13px] font-bold text-coral-dark hover:underline">Ukloni</ConfirmButton></form>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Istorija prisustva">
            <div id="prisustvo" className="scroll-mt-24" />
            <AttendanceGrid students={mem.map((m) => ({ id: m.student_id, name: fullName(m.students!) }))} sessions={(monthSessions ?? []) as GridSession[]} period={period} baseHref={`/grupe/${g.id}`} />
          </Card>

          {ctx.isOwner && (
            <Card title="Podešavanja grupe">
              <form action={updateGroup} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={g.id} />
                <GroupFields g={g} teachers={teachers ?? []} rooms={rooms ?? []} />
                <div><button className="btn">Sačuvaj</button></div>
              </form>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Termini">
            {sl.length === 0 ? (
              <p className="text-[14px] font-semibold text-coral-dark">Grupa nema termine u rasporedu.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sl.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2.5">
                    <div>
                      <div className="font-extrabold text-ink">{WEEKDAYS[x.weekday]}</div>
                      <div className="text-[13px] font-semibold text-mut">{time(x.start_time)} do {time(x.end_time)}{x.rooms ? ` · ${x.rooms.name}` : ''}</div>
                    </div>
                    {ctx.isOwner && (
                      <form action={deleteSlot}>
                        <input type="hidden" name="id" value={x.id} />
                        <input type="hidden" name="group_id" value={g.id} />
                        <ConfirmButton message="Obrisati ovaj termin iz rasporeda?" className="text-[13px] font-bold text-coral-dark hover:underline">Obriši</ConfirmButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {ctx.isOwner && (
              <form action={addSlot} className="mt-4 grid gap-3 border-t border-line pt-4">
                <input type="hidden" name="group_id" value={g.id} />
                <Select label="Dan" name="weekday" required options={WEEKDAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="label">Od</span><input className="input" type="time" name="start_time" required /></label>
                  <label className="block"><span className="label">Do</span><input className="input" type="time" name="end_time" required /></label>
                </div>
                <Select label="Sala" name="room_id" defaultValue={g.room_id ?? ''} placeholder="Ista kao grupa / bez sale" options={(rooms ?? []).map((r) => ({ value: r.id, label: r.name }))} />
                <div><button className="btn btn-soft">Dodaj termin</button></div>
              </form>
            )}
          </Card>

          {ctx.isOwner && (
            <Card title="Arhiva">
              <div className="flex flex-wrap gap-2">
                <form action={setGroupActive}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="active" value={g.active ? '0' : '1'} />
                  <button className="btn btn-sm btn-soft">{g.active ? 'Premesti u arhivu' : 'Vrati iz arhive'}</button>
                </form>
                {!g.active && (
                  <form action={deleteGroup}>
                    <input type="hidden" name="id" value={g.id} />
                    <TypedConfirm label="Obriši trajno" warning="Brisanje uklanja i celu istoriju prisustva ove grupe." />
                  </form>
                )}
              </div>
              <p className="mt-2 text-[12px] font-semibold text-mut">Grupa u arhivi ne pojavljuje se u rasporedu, ali čuva istoriju prisustva.</p>
              {!g.active && <Badge tone="gray">Brisanje uklanja i prisustvo ove grupe.</Badge>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
