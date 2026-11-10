import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty, Badge, Flash } from '@/components/ui';
import { WEEKDAYS_SHORT, time, rsd } from '@/lib/format';

export const metadata = { title: 'Grupe' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ ok?: string; arhiva?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('groups')
    .select('id, name, level, color, monthly_fee, fee_type, capacity, active, profiles(full_name), rooms(name), group_members(student_id), schedule_slots(weekday, start_time, end_time, recurrence)')
    .eq('org_id', ctx.org.id)
    .eq('active', !sp.arhiva)
    .order('name');
  type G = { id: string; name: string; level: string | null; color: string; monthly_fee: number | null; fee_type: string; capacity: number | null; profiles: { full_name: string } | null; rooms: { name: string } | null; group_members: { student_id: string }[]; schedule_slots: { weekday: number; start_time: string; end_time: string; recurrence: string | null }[] };
  const groups = (data ?? []) as unknown as G[];
  return (
    <>
      <PageHeader
        title={ctx.isOwner ? 'Grupe' : 'Moje grupe'}
        subtitle={`${groups.length} ${sp.arhiva ? 'u arhivi' : 'aktivnih'}`}
        actions={ctx.isOwner && (
          <>
            <Link href={sp.arhiva ? '/grupe' : '/grupe?arhiva=1'} className="btn btn-soft">{sp.arhiva ? 'Aktivne' : 'Arhiva'}</Link>
            <Link href="/grupe/nova" className="btn">+ Nova grupa</Link>
          </>
        )}
      />
      <Flash ok={sp.ok === 'obrisana' ? 'Grupa je obrisana.' : undefined} />
      {groups.length === 0 ? (
        <Empty title="Nema grupa" text={ctx.isOwner ? 'Napravi prvu grupu: naziv, predavač, sala, cena i termin.' : 'Vlasnik škole ti još nije dodelio grupe.'} action={ctx.isOwner ? <Link href="/grupe/nova" className="btn">+ Nova grupa</Link> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const count = g.group_members.length;
            const slots = [...g.schedule_slots].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
            return (
              <Link key={g.id} href={`/grupe/${g.id}`} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                    <span className="text-[17px] font-extrabold text-ink">{g.name}</span>
                  </div>
                  <Badge tone={g.capacity && count >= g.capacity ? 'coral' : 'soft'}>{count}{g.capacity ? `/${g.capacity}` : ''} učenika</Badge>
                </div>
                <div className="mt-2 text-[14px] font-semibold text-mut">
                  {[g.level, g.profiles?.full_name, g.rooms?.name].filter(Boolean).join(' · ') || 'Bez predavača i sale'}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {slots.length === 0 ? <span className="text-[13px] font-semibold text-coral-dark">Nema termina u rasporedu</span> : slots.map((sl, i) => (
                    <span key={i} className="rounded-lg bg-soft px-2 py-1 text-[12px] font-bold text-ink-2">{WEEKDAYS_SHORT[sl.weekday]} {time(sl.start_time)}{sl.recurrence === 'biweekly' ? ' · svake 2.' : ''}</span>
                  ))}
                </div>
                {ctx.isOwner && g.monthly_fee !== null && <div className="mt-3 text-[13px] font-bold text-brand">{rsd(g.monthly_fee)} {g.fee_type === 'package' ? 'paket' : 'mesečno'}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
