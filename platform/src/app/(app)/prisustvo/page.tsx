import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty, Badge } from '@/components/ui';
import { addDays, dateLong, isoWeekday, time, todayISO } from '@/lib/format';

export const metadata = { title: 'Prisustvo' };

export default async function AttendanceList({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const date = sp.datum && /^\d{4}-\d{2}-\d{2}$/.test(sp.datum) ? sp.datum : todayISO();
  const wd = isoWeekday(date);
  const supabase = await createClient();
  const [{ data: slots }, { data: sessions }] = await Promise.all([
    supabase
      .from('schedule_slots')
      .select('id, start_time, end_time, rooms(name), groups!inner(id, name, color, active, group_members(student_id))')
      .eq('org_id', ctx.org.id)
      .eq('weekday', wd)
      .eq('groups.active', true)
      .order('start_time'),
    supabase.from('sessions').select('id, group_id, start_time, end_time, status, makeup_for, attendance(status), groups(id, name, color, group_members(student_id))').eq('org_id', ctx.org.id).eq('date', date),
  ]);
  type S = { id: string; start_time: string; end_time: string; rooms: { name: string } | null; groups: { id: string; name: string; color: string; group_members: { student_id: string }[] } };
  type Se = { id: string; group_id: string; start_time: string; end_time: string | null; status: string; makeup_for: string | null; attendance: { status: string }[]; groups: { id: string; name: string; color: string; group_members: { student_id: string }[] } | null };
  const list = (slots ?? []) as unknown as S[];
  const sess = (sessions ?? []) as unknown as Se[];
  const find = (s: S) => sess.find((x) => x.group_id === s.groups.id && x.start_time.slice(0, 5) === s.start_time.slice(0, 5));
  // Časovi van rasporeda (nadoknade) za ovaj dan
  const extra = sess.filter((x) => x.groups && !list.some((s) => s.groups.id === x.group_id && s.start_time.slice(0, 5) === x.start_time.slice(0, 5)));

  return (
    <>
      <PageHeader title="Prisustvo" subtitle={dateLong(date)} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/prisustvo?datum=${addDays(date, -1)}`} className="btn btn-sm btn-soft">← Juče</Link>
        {date !== todayISO() && <Link href="/prisustvo" className="btn btn-sm btn-soft">Danas</Link>}
        <Link href={`/prisustvo?datum=${addDays(date, 1)}`} className="btn btn-sm btn-soft">Sutra →</Link>
        <form className="ml-auto flex gap-2">
          <input type="date" name="datum" defaultValue={date} className="input h-9 w-auto text-sm" />
          <button className="btn btn-sm btn-soft">Idi</button>
        </form>
      </div>
      {extra.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {extra.map((x) => (
            <Link key={x.id} href={`/prisustvo/${x.group_id}?datum=${date}&vreme=${time(x.start_time)}`} className="card flex items-center gap-4 p-4" style={{ borderLeft: `5px solid ${x.groups!.color}` }}>
              <div className="w-14 shrink-0 text-center">
                <div className="text-[18px] font-extrabold tabular-nums text-ink">{time(x.start_time)}</div>
                {x.end_time && <div className="text-[11px] font-bold text-mut">{time(x.end_time)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-extrabold text-ink">{x.groups!.name}</div>
                <div className="text-[13px] font-semibold text-mut">{x.makeup_for ? 'Nadoknada' : 'Dodatni čas'} · {x.groups!.group_members.length} učenika</div>
              </div>
              {x.status === 'planned' ? <span className="btn btn-sm">Upiši</span> : x.status === 'cancelled' ? <Badge tone="gray">Otkazan</Badge> : <Badge tone="ok">{x.attendance.filter((a) => a.status === 'present').length}/{x.groups!.group_members.length}</Badge>}
            </Link>
          ))}
        </div>
      )}
      {list.length === 0 && extra.length === 0 ? (
        <Empty title="Nema časova za ovaj dan" text="Časovi se prikazuju prema terminima u rasporedu grupa." />
      ) : list.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {list.map((s) => {
            const se = find(s);
            const total = s.groups.group_members.length;
            const present = se?.attendance.filter((a) => a.status === 'present').length ?? 0;
            return (
              <Link
                key={s.id}
                href={`/prisustvo/${s.groups.id}?datum=${date}&vreme=${time(s.start_time)}`}
                className="card flex items-center gap-4 p-4 transition hover:shadow-md"
                style={{ borderLeft: `5px solid ${s.groups.color}` }}
              >
                <div className="w-14 shrink-0 text-center">
                  <div className="text-[18px] font-extrabold tabular-nums text-ink">{time(s.start_time)}</div>
                  <div className="text-[11px] font-bold text-mut">{time(s.end_time)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-extrabold text-ink">{s.groups.name}</div>
                  <div className="text-[13px] font-semibold text-mut">{total} učenika{s.rooms ? ` · ${s.rooms.name}` : ''}</div>
                </div>
                {se?.status === 'cancelled' ? (
                  <Badge tone="gray">Otkazan</Badge>
                ) : se && se.status !== 'planned' ? (
                  <Badge tone="ok">{present}/{total} prisutno</Badge>
                ) : (
                  <span className="btn btn-sm">Upiši</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
