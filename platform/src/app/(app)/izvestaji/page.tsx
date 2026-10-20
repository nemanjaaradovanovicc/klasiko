import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Stat } from '@/components/ui';
import { currentPeriod, periodLabel, shiftPeriod, rsd, fullName, dateSr } from '@/lib/format';
import { ExportButton } from './export';

export const metadata = { title: 'Izveštaji' };

const METHOD: Record<string, string> = { cash: 'Gotovina', bank: 'Račun', card: 'Kartica', other: 'Drugo' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ mesec?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const period = sp.mesec && /^\d{4}-\d{2}$/.test(sp.mesec) ? sp.mesec : currentPeriod();
  const start = `${period}-01`;
  const end = `${shiftPeriod(period, 1)}-01`;
  const sixAgo = `${shiftPeriod(period, -5)}-01`;
  const supabase = await createClient();
  const [{ data: payments }, { data: charges }, { data: sessions }, { data: students }, { data: groups }] = await Promise.all([
    supabase.from('payments').select('amount, paid_at, method, students(first_name, last_name), charges(period, description)').eq('org_id', ctx.org.id).gte('paid_at', sixAgo).lt('paid_at', end),
    supabase.from('charges').select('amount, payments(amount)').eq('org_id', ctx.org.id).eq('period', period),
    supabase.from('sessions').select('id, group_id, status, attendance(status)').eq('org_id', ctx.org.id).gte('date', start).lt('date', end),
    supabase.from('students').select('first_name, last_name, birth_date, phone, email, parent_name, parent_phone, parent_email, joined_at, left_at, active, custom_fee, discount_pct, group_members(groups(name))').eq('org_id', ctx.org.id).order('last_name'),
    supabase.from('groups').select('id, name, color, capacity, group_members(student_id)').eq('org_id', ctx.org.id).eq('active', true).order('name'),
  ]);

  type P = { amount: number; paid_at: string; method: string; students: { first_name: string; last_name: string } | null; charges: { period: string; description: string | null } | null };
  const pays = (payments ?? []) as unknown as P[];
  const months = [5, 4, 3, 2, 1, 0].map((i) => shiftPeriod(period, -i));
  const byMonth = months.map((m) => ({ m, sum: pays.filter((p) => p.paid_at.startsWith(m)).reduce((a, p) => a + Number(p.amount), 0) }));
  const max = Math.max(1, ...byMonth.map((x) => x.sum));
  const thisMonth = byMonth[5].sum;

  type C = { amount: number; payments: { amount: number }[] };
  const chs = (charges ?? []) as unknown as C[];
  const expected = chs.reduce((a, c) => a + Number(c.amount), 0);
  const collected = chs.reduce((a, c) => a + Math.min(Number(c.amount), c.payments.reduce((x, p) => x + Number(p.amount), 0)), 0);

  type Se = { id: string; group_id: string; status: string; attendance: { status: string }[] };
  const sess = ((sessions ?? []) as unknown as Se[]).filter((s) => s.status === 'held');
  const att = sess.flatMap((s) => s.attendance);
  const rate = att.length ? Math.round((att.filter((a) => a.status === 'present').length / att.length) * 100) : null;

  type St = { first_name: string; last_name: string; birth_date: string | null; phone: string | null; email: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null; joined_at: string; left_at: string | null; active: boolean; custom_fee: number | null; discount_pct: number; group_members: { groups: { name: string } | null }[] };
  const sts = (students ?? []) as unknown as St[];
  const newCount = sts.filter((s) => s.joined_at >= start && s.joined_at < end).length;
  const leftCount = sts.filter((s) => s.left_at && s.left_at >= start && s.left_at < end).length;

  type G = { id: string; name: string; color: string; capacity: number | null; group_members: { student_id: string }[] };
  const grs = (groups ?? []) as unknown as G[];
  const groupStats = grs.map((g) => {
    const gs = sess.filter((s) => s.group_id === g.id);
    const a = gs.flatMap((s) => s.attendance);
    return { ...g, sessions: gs.length, rate: a.length ? Math.round((a.filter((x) => x.status === 'present').length / a.length) * 100) : null };
  });

  const label = periodLabel(period);
  return (
    <>
      <PageHeader
        title="Izveštaji"
        subtitle={label}
        actions={
          <>
            <Link href={`/izvestaji?mesec=${shiftPeriod(period, -1)}`} className="btn btn-soft">←</Link>
            {period !== currentPeriod() && <Link href="/izvestaji" className="btn btn-soft">Ovaj mesec</Link>}
            <Link href={`/izvestaji?mesec=${shiftPeriod(period, 1)}`} className="btn btn-soft">→</Link>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Primljene uplate" value={rsd(thisMonth)} tone="brand" />
        <Stat label="Naplaćenost članarina" value={expected ? `${Math.round((collected / expected) * 100)}%` : '—'} hint={expected ? `${rsd(collected)} od ${rsd(expected)}` : 'nema zaduženja'} />
        <Stat label="Prosečno prisustvo" value={rate === null ? '—' : `${rate}%`} hint={`${sess.length} održanih časova`} />
        <Stat label="Novi / ispisani" value={`${newCount} / ${leftCount}`} hint={`${sts.filter((s) => s.active).length} aktivnih ukupno`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Uplate po mesecima">
          <div className="flex h-48 items-end gap-3">
            {byMonth.map((x) => (
              <div key={x.m} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="text-[11px] font-extrabold tabular-nums text-mut">{x.sum ? Math.round(x.sum / 1000) + 'k' : ''}</div>
                <div className={`w-full rounded-t-lg ${x.m === period ? 'bg-brand' : 'bg-brand/25'}`} style={{ height: `${Math.max(4, (x.sum / max) * 150)}px` }} title={rsd(x.sum)} />
                <div className="text-[11px] font-bold text-mut">{periodLabel(x.m).slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Grupe ovog meseca">
          {groupStats.length === 0 ? (
            <p className="text-[14px] font-semibold text-mut">Nema aktivnih grupa.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {groupStats.map((g) => (
                <li key={g.id}>
                  <div className="mb-1 flex items-center justify-between text-[14px]">
                    <span className="flex items-center gap-2 font-bold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.name}</span>
                    <span className="font-semibold text-mut">{g.group_members.length}{g.capacity ? `/${g.capacity}` : ''} uč. · {g.sessions} čas. · {g.rate === null ? '—' : `${g.rate}%`}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-soft">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${g.rate ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Izvoz u Excel" className="mt-6">
        <div className="flex flex-wrap gap-2">
          <ExportButton
            label="Svi učenici"
            fileName={`klasiko-ucenici-${period}.xlsx`}
            header={['Ime', 'Prezime', 'Datum rođenja', 'Telefon', 'Email', 'Roditelj', 'Telefon roditelja', 'Email roditelja', 'Grupe', 'Upisan', 'Status', 'Posebna cena', 'Popust %']}
            rows={sts.map((s) => [s.first_name, s.last_name, dateSr(s.birth_date), s.phone, s.email, s.parent_name, s.parent_phone, s.parent_email, s.group_members.map((m) => m.groups?.name).filter(Boolean).join(', '), dateSr(s.joined_at), s.active ? 'aktivan' : `ispisan ${dateSr(s.left_at)}`, s.custom_fee, Number(s.discount_pct)])}
          />
          <ExportButton
            label={`Uplate, ${label.toLowerCase()}`}
            fileName={`klasiko-uplate-${period}.xlsx`}
            header={['Datum', 'Učenik', 'Za period', 'Opis', 'Način', 'Iznos']}
            rows={pays.filter((p) => p.paid_at.startsWith(period)).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => [dateSr(p.paid_at), p.students ? fullName(p.students) : '', p.charges ? periodLabel(p.charges.period) : '', p.charges?.description ?? '', METHOD[p.method], Number(p.amount)])}
          />
        </div>
      </Card>
    </>
  );
}
