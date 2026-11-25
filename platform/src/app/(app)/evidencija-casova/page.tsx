import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty, Badge, Table } from '@/components/ui';
import { addDays, currentPeriod, dateSr, isISODate, shiftPeriod, time } from '@/lib/format';
import { attendanceSummary, auditName, formatAuditLine, sessionAuditView } from '@/lib/session-audit';

export const metadata = { title: 'Dnevnik časova' };

const PAGE = 50;

function currentMonth(): { od: string; datumDo: string } {
  const period = currentPeriod();
  return { od: `${period}-01`, datumDo: addDays(`${shiftPeriod(period, 1)}-01`, -1) };
}

function periodOf(od: string | undefined, datumDoRaw: string | undefined): { od: string; datumDo: string } {
  const month = currentMonth();
  let from = isISODate(od) ? od : month.od;
  let to = isISODate(datumDoRaw) ? datumDoRaw : month.datumDo;
  if (from > to) [from, to] = [to, from];
  return { od: from, datumDo: to };
}

const isId = (v: string | undefined): v is string => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function relName(v: { name: string } | { name: string }[] | null | undefined): string {
  if (!v) return '';
  return (Array.isArray(v) ? v[0]?.name : v.name) || '';
}

export default async function LessonJournal({ searchParams }: { searchParams: Promise<{ od?: string; do?: string; grupa?: string; predavac?: string; strana?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const { od, datumDo } = periodOf(sp.od, sp.do);
  const supabase = await createClient();
  const [{ data: groupRows }, { data: profileRows }] = await Promise.all([
    supabase.from('groups').select('id, name, active').eq('org_id', ctx.org.id).order('name'),
    supabase.from('profiles').select('id, full_name, role, active').eq('org_id', ctx.org.id).order('full_name'),
  ]);
  const groups = groupRows ?? [];
  const profiles = profileRows ?? [];
  const grupa = isId(sp.grupa) && groups.some((g) => g.id === sp.grupa) ? sp.grupa : '';
  const predavac = isId(sp.predavac) && profiles.some((p) => p.id === sp.predavac && (p.role === 'teacher' || p.role === 'owner')) ? sp.predavac : '';
  const page = Math.max(1, Number.parseInt(sp.strana ?? '1', 10) || 1);
  const from = (page - 1) * PAGE;

  let countQuery = supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).in('status', ['held', 'cancelled']).gte('date', od).lte('date', datumDo);
  let dataQuery = supabase.from('sessions').select('id, date, start_time, status, note, group_id, teacher_id, attendance_recorded_by, attendance_recorded_at, attendance_updated_by, attendance_updated_at, note_updated_by, note_updated_at, groups(name), attendance(status)').eq('org_id', ctx.org.id).in('status', ['held', 'cancelled']).gte('date', od).lte('date', datumDo);
  if (grupa) {
    countQuery = countQuery.eq('group_id', grupa);
    dataQuery = dataQuery.eq('group_id', grupa);
  }
  if (predavac) {
    countQuery = countQuery.eq('teacher_id', predavac);
    dataQuery = dataQuery.eq('teacher_id', predavac);
  }
  const [{ count }, { data }] = await Promise.all([
    countQuery,
    dataQuery.order('date', { ascending: false }).order('start_time', { ascending: false }).order('id', { ascending: false }).range(from, from + PAGE - 1),
  ]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  type Row = {
    id: string;
    date: string;
    start_time: string;
    status: string;
    note: string | null;
    group_id: string;
    teacher_id: string | null;
    attendance_recorded_by: string | null;
    attendance_recorded_at: string | null;
    attendance_updated_by: string | null;
    attendance_updated_at: string | null;
    note_updated_by: string | null;
    note_updated_at: string | null;
    groups: { name: string } | { name: string }[] | null;
    attendance: { status: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const names = new Map(profiles.map((p) => [p.id, p.full_name || 'Bez imena']));
  if (ctx.profile.full_name) names.set(ctx.userId, ctx.profile.full_name);
  const teachers = profiles.filter((p) => p.role === 'teacher' || p.role === 'owner');

  const href = (strana: number) => {
    const q = new URLSearchParams();
    q.set('od', od);
    q.set('do', datumDo);
    if (grupa) q.set('grupa', grupa);
    if (predavac) q.set('predavac', predavac);
    if (strana > 1) q.set('strana', String(strana));
    return `/evidencija-casova?${q}`;
  };

  const entryOf = (row: Row) => {
    const view = sessionAuditView(row);
    if (!view.entered && !view.changed) return null;
    return view;
  };

  return (
    <>
      <PageHeader title="Dnevnik časova" subtitle={`${dateSr(od)} – ${dateSr(datumDo)} · ${total} ${total === 1 ? 'čas' : 'časova'} · samo za čitanje`} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="block">
          <span className="label">Od</span>
          <input className="input w-auto" type="date" name="od" defaultValue={od} required />
        </label>
        <label className="block">
          <span className="label">Do</span>
          <input className="input w-auto" type="date" name="do" defaultValue={datumDo} required />
        </label>
        <label className="block">
          <span className="label">Grupa</span>
          <select className="input w-auto" name="grupa" defaultValue={grupa}>
            <option value="">Sve grupe</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.active ? '' : ' · arhiva'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Predavač</span>
          <select className="input w-auto" name="predavac" defaultValue={predavac}>
            <option value="">Svi predavači</option>
            {teachers.map((p) => <option key={p.id} value={p.id}>{p.full_name || 'Bez imena'}{p.role === 'owner' ? ' · vlasnik' : ''}{p.active ? '' : ' · neaktivan'}</option>)}
          </select>
        </label>
        <button className="btn btn-soft">Prikaži</button>
        {(sp.od || sp.do || grupa || predavac) && <Link href="/evidencija-casova" className="btn btn-ghost">Poništi filtere</Link>}
      </form>

      {rows.length === 0 ? (
        page > 1 ? (
          <Empty title="Nema više časova na ovoj strani" text="Vrati se na početak liste." action={<Link href={href(1)} className="btn">Prva strana</Link>} />
        ) : (
          <Empty title="Nema časova u ovom periodu" text="Ovde su održani i otkazani časovi. Promeni period, grupu ili predavača." />
        )
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => {
              const view = entryOf(row);
              const group = relName(row.groups) || 'Grupa';
              return (
                <li key={row.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/prisustvo/${row.group_id}?datum=${row.date}&vreme=${time(row.start_time)}`} className="font-extrabold text-brand">{dateSr(row.date)} · {time(row.start_time)}</Link>
                    {row.status === 'cancelled' ? <Badge tone="gray">Otkazan</Badge> : <Badge tone="ok">{attendanceSummary(row.status, row.attendance ?? [])}</Badge>}
                  </div>
                  <p className="mt-1 text-[14px] font-bold text-ink">{group}</p>
                  <p className="text-[13px] font-semibold text-mut">{names.get(row.teacher_id ?? '') || 'Bez predavača'}</p>
                  {view?.entered && <p className="mt-1 text-[13px] font-semibold text-ink-2">{formatAuditLine('uneo', auditName(view.entered.by, names), view.entered.at)}</p>}
                  {view?.changed && <p className="text-[13px] font-semibold text-mut">{formatAuditLine('izmenio', auditName(view.changed.by, names), view.changed.at)}</p>}
                  {!view && <p className="mt-1 text-[13px] font-semibold text-mut">Nije zabeleženo</p>}
                  {row.note && <p className="mt-1 text-[14px] font-medium text-ink-2">{row.note}</p>}
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <Table head={['Datum', 'Grupa', 'Predavač', 'Upis', 'Prisustvo', 'Beleška']}>
              {rows.map((row) => {
                const view = entryOf(row);
                return (
                  <tr key={row.id}>
                    <td className="td whitespace-nowrap">
                      <Link href={`/prisustvo/${row.group_id}?datum=${row.date}&vreme=${time(row.start_time)}`} className="font-extrabold text-brand">{dateSr(row.date)} · {time(row.start_time)}</Link>
                    </td>
                    <td className="td font-bold text-ink">{relName(row.groups) || '—'}</td>
                    <td className="td">{names.get(row.teacher_id ?? '') || 'Bez predavača'}</td>
                    <td className="td text-[13px] font-semibold text-ink-2">
                      {view?.entered ? formatAuditLine('uneo', auditName(view.entered.by, names), view.entered.at) : 'Nije zabeleženo'}
                      {view?.changed && <span className="mt-0.5 block text-mut">{formatAuditLine('izmenio', auditName(view.changed.by, names), view.changed.at)}</span>}
                    </td>
                    <td className="td whitespace-nowrap">{row.status === 'cancelled' ? <Badge tone="gray">Otkazan</Badge> : attendanceSummary(row.status, row.attendance ?? [])}</td>
                    <td className="td max-w-xs"><span className="line-clamp-2" title={row.note ?? undefined}>{row.note || '—'}</span></td>
                  </tr>
                );
              })}
            </Table>
          </div>
          {total > PAGE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-mut">Strana {Math.min(page, pages)} od {pages}</p>
              <div className="flex gap-2">
                {page > 1 && <Link href={href(page - 1)} className="btn btn-sm btn-soft">Prethodna</Link>}
                {page < pages && <Link href={href(page + 1)} className="btn btn-sm btn-soft">Sledeća</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
