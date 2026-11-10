import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Stat, Badge, Empty } from '@/components/ui';
import { currentPeriod, dateSr, formatMoney, formatTotals, fullName, periodLabel } from '@/lib/format';
import { debtMessage, loadDebts } from '@/lib/debts';
import { parentUrl } from '@/lib/parent';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { emailEnabled } from '@/lib/email';
import { waUrl } from '@/lib/phone';
import { SendQueue } from './queue';

export const metadata = { title: 'Ko duguje' };

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const period = currentPeriod();
  const [all, links] = await Promise.all([
    loadDebts(supabase, ctx.org.id, period),
    fetchAll<{ student_id: string; token: string }>((a, b) => supabase.from('parent_links').select('student_id, token').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)),
  ]);
  const linkBy = new Map(links.map((l) => [l.student_id, l.token]));
  const older = sp.prikaz === 'stari';
  const rows = older ? all.filter((r) => r.oldest < period) : all;
  const withLinks = rows.map((r) => {
    const token = r.familyIds.map((id) => linkBy.get(id)).find(Boolean);
    return { ...r, message: debtMessage(r, ctx.org.name, ctx.org.bank_account, token ? parentUrl(token) : null, ctx.org.payment_instructions) };
  });

  return (
    <>
      <PageHeader title="Ko duguje" subtitle="Ukupan dug po roditelju, za sve mesece" back={{ href: '/uplate', label: 'Uplate' }} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Ukupan dug" value={formatTotals(rows.flatMap((r) => r.charges.map((c) => ({ amount: c.remaining, currency: c.currency }))))} tone={rows.length ? 'coral' : 'ok'} />
        <Stat label="Roditelja sa dugom" value={rows.length} />
        <Stat label="Duguju i za ranije mesece" value={all.filter((r) => r.oldest < period).length} />
      </div>
      <div className="mb-4 flex gap-1 self-start rounded-full bg-white p-1 ring-1 ring-line" style={{ width: 'fit-content' }}>
        {[['', 'Svi'], ['stari', 'Samo stari dug']].map(([v, l]) => (
          <Link key={v} href={v ? `/uplate/dugovanja?prikaz=${v}` : '/uplate/dugovanja'} className={`rounded-full px-3 py-1.5 text-[13px] font-extrabold ${(sp.prikaz ?? '') === v ? 'bg-brand text-white' : 'text-mut hover:text-brand'}`}>{l}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="Niko ne duguje" text="Sva zaduženja su plaćena." />
      ) : (
        <>
          <Card title="Pošalji podsetnike" className="mb-5">
            <SendQueue
              items={withLinks.map((r) => ({ key: r.key, names: r.students.map(fullName).join(', '), phone: r.phone, message: r.message, studentIds: r.students.map((s) => s.id) }))}
              emailCount={rows.filter((r) => r.email).length}
              emailOn={emailEnabled()}
            />
          </Card>
          <ul className="flex flex-col gap-2">
            {withLinks.map((r) => (
              <li key={r.key} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {r.students.map((s) => <Link key={s.id} href={`/ucenici/${s.id}`} className="block truncate font-extrabold text-ink hover:text-brand">{fullName(s)}</Link>)}
                    <div className="truncate text-[12px] font-semibold text-mut">{r.parent ?? 'Roditelj nije upisan'}{r.lastReminder ? ` · podsetnik ${dateSr(r.lastReminder.slice(0, 10))}` : ''}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[17px] font-extrabold tabular-nums text-coral-dark">{formatTotals(r.charges.map((c) => ({ amount: c.remaining, currency: c.currency })))}</div>
                    {r.oldest < period && <Badge tone="coral">od {periodLabel(r.oldest).toLowerCase()}</Badge>}
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12px] font-bold text-mut">{r.charges.length} {r.charges.length === 1 ? 'zaduženje' : 'zaduženja'}</summary>
                  <ul className="mt-2 flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
                    {r.charges.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2"><Link href={`/uplate?mesec=${c.period}`} className="min-w-0 truncate hover:text-brand">{periodLabel(c.period)}{c.description ? ` · ${c.description}` : ''}</Link><span className="shrink-0 tabular-nums">{formatMoney(c.remaining, c.currency)}</span></li>
                    ))}
                  </ul>
                </details>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.phone ? <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener" href={waUrl(r.phone, r.message)}>WhatsApp</a> : <span className="text-[12px] font-bold text-coral-dark">Nema telefona</span>}
                  {r.phone && <a className="btn btn-sm btn-ghost" href={`tel:${r.phone}`}>Pozovi</a>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
