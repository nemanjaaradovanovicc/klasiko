import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty } from '@/components/ui';
import { WEEKDAYS, time, todayISO, isoWeekday } from '@/lib/format';

export const metadata = { title: 'Raspored' };

export default async function SchedulePage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_slots')
    .select('id, weekday, start_time, end_time, rooms(name), groups!inner(id, name, color, active, profiles(full_name), rooms(name))')
    .eq('org_id', ctx.org.id)
    .eq('groups.active', true)
    .order('start_time');
  type S = { id: string; weekday: number; start_time: string; end_time: string; rooms: { name: string } | null; groups: { id: string; name: string; color: string; profiles: { full_name: string } | null; rooms: { name: string } | null } };
  const slots = (data ?? []) as unknown as S[];
  const today = isoWeekday(todayISO());
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || slots.some((s) => s.weekday === d));

  return (
    <>
      <PageHeader title="Raspored" subtitle="Nedeljni pregled svih termina" actions={ctx.isOwner && <Link href="/grupe" className="btn btn-soft">Uredi termine u grupama</Link>} />
      {slots.length === 0 ? (
        <Empty title="Raspored je prazan" text="Termini se dodaju u svakoj grupi: otvori grupu i dodaj dan i vreme." action={ctx.isOwner ? <Link href="/grupe" className="btn">Idi na grupe</Link> : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          {days.map((d) => {
            const list = slots.filter((s) => s.weekday === d);
            return (
              <div key={d} className={`rounded-2xl p-3 ${d === today ? 'bg-brand/5 ring-2 ring-brand/30' : 'bg-white border border-line'}`}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[14px] font-extrabold text-ink">{WEEKDAYS[d]}</span>
                  {d === today && <span className="text-[11px] font-extrabold uppercase text-brand">Danas</span>}
                </div>
                <div className="flex flex-col gap-2">
                  {list.length === 0 && <div className="px-1 py-2 text-[13px] font-semibold text-mut/70">Nema termina</div>}
                  {list.map((s) => (
                    <Link key={s.id} href={`/grupe/${s.groups.id}`} className="block rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-line transition hover:ring-brand/40" style={{ borderLeft: `4px solid ${s.groups.color}` }}>
                      <div className="text-[12px] font-extrabold tabular-nums text-mut">{time(s.start_time)}–{time(s.end_time)}</div>
                      <div className="text-[14px] font-extrabold leading-tight text-ink">{s.groups.name}</div>
                      <div className="mt-0.5 text-[12px] font-semibold text-mut">{[s.rooms?.name ?? s.groups.rooms?.name, s.groups.profiles?.full_name].filter(Boolean).join(' · ')}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
