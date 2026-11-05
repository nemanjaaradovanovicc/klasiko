import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Empty } from '@/components/ui';
import { AUDIT_LABEL } from '@/lib/audit';
import Link from 'next/link';
import { addDays, dateSr, todayISO } from '@/lib/format';

export const metadata = { title: 'Dnevnik' };

const when = (iso: string) => new Date(iso).toLocaleString('sr-Latn-RS', { timeZone: 'Europe/Belgrade', dateStyle: 'short', timeStyle: 'short' });

// Politika privatnosti: podaci se brišu najkasnije godinu dana po prestanku pretplate. Odluku donosi admin.
function endedAt(o: { status: string; billing: string; paid_until: string | null; trial_ends_at: string | null }): string | null {
  if (o.billing === 'lifetime') return null;
  if (o.status === 'trial') return o.trial_ends_at;
  return o.paid_until;
}

export default async function AuditPage() {
  await requireSuper();
  const db = createAdminClient();
  const [{ data: rows }, { data: orgs }] = await Promise.all([
    db.from('audit_log').select('*').order('at', { ascending: false }).limit(300),
    db.from('organizations').select('id, name, status, billing, paid_until, trial_ends_at'),
  ]);
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const limit = addDays(todayISO(), -365);
  const overdue = (orgs ?? []).filter((o) => { const end = endedAt(o); return !!end && end < limit; });
  return (
    <>
      <PageHeader title="Dnevnik" subtitle="Poslednjih 300 važnih radnji" back={{ href: '/admin', label: 'Admin' }} />
      {overdue.length > 0 && (
        <Card title="Škole za brisanje" className="mb-6">
          <p className="text-[14px] font-semibold text-ink-2">Pristup im je istekao pre više od godinu dana. Po politici privatnosti njihove podatke treba obrisati, osim ako nastavljaju saradnju.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {overdue.map((o) => <li key={o.id} className="flex justify-between gap-2 text-[14px]"><Link href={`/admin/skole/${o.id}`} className="font-bold text-brand">{o.name}</Link><span className="font-semibold text-mut">isteklo {dateSr(endedAt(o))}</span></li>)}
          </ul>
        </Card>
      )}
      {(rows ?? []).length === 0 ? <Empty title="Dnevnik je prazan" /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="py-2.5 text-[14px]">
                <div className="font-bold text-ink">{AUDIT_LABEL[r.action] ?? r.action}{r.org_id ? ` · ${names.get(r.org_id) ?? 'obrisana škola'}` : ''}</div>
                <div className="text-[12px] font-semibold text-mut">{when(r.at)} · {r.actor_email ?? 'sistem'}{r.target ? ` · ${r.target}` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
