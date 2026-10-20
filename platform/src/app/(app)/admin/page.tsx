import Link from 'next/link';
import { requireSuper, orgAccess } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Stat, Badge, Field, Select, Flash, Table } from '@/components/ui';
import { CredsForm } from '@/components/creds';
import { InstallCard } from '@/components/pwa';
import { KINDS, PLANS, STATUS_LABEL, BILLING_LABEL, type Organization } from '@/lib/types';
import { dateSr, rsd } from '@/lib/format';
import { createOrg, enterOrg } from './actions';
import { accessEnds, daysUntil, needsBilling } from '@/lib/billing';

export const metadata = { title: 'Admin' };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; demo?: string }> }) {
  await requireSuper();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: orgs }, { data: counts }, { count: newDemos }, { data: demo }] = await Promise.all([
    db.from('organizations').select('*').order('created_at', { ascending: false }),
    db.from('students').select('org_id').eq('active', true),
    db.from('demo_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sp.demo ? db.from('demo_requests').select('*').eq('id', sp.demo).single() : Promise.resolve({ data: null }),
  ]);
  const list = (orgs ?? []) as Organization[];
  const perOrg = new Map<string, number>();
  for (const s of counts ?? []) perOrg.set(s.org_id, (perOrg.get(s.org_id) ?? 0) + 1);
  const active = list.filter((o) => o.status === 'active').length;
  const trial = list.filter((o) => o.status === 'trial' && orgAccess(o).ok).length;
  const { data: openInv } = await db.from('invoices').select('org_id, sent_at').eq('status', 'issued');
  const openSet = new Set((openInv ?? []).map((i) => i.org_id));
  const billingTodo = list.filter((o) => needsBilling(o, 20) && !openSet.has(o.id)).length + (openInv ?? []).filter((i) => !i.sent_at).length;
  const expiring = list
    .map((o) => ({ o, end: accessEnds(o) }))
    .filter((x) => x.end && (daysUntil(x.end) ?? 99) <= 7)
    .sort((a, b) => (a.end! < b.end! ? -1 : 1));
  const mrr = list
    .filter((o) => o.status === 'active')
    .reduce((sum, o) => sum + (o.billing === 'monthly' ? PLANS[o.plan].monthly : o.billing === 'yearly' ? PLANS[o.plan].yearly / 12 : 0), 0);

  return (
    <>
      <PageHeader
        title="Admin Klasika"
        subtitle="Škole, pretplate i korisnici"
        actions={<><Link href="/admin/naplata" className="btn btn-soft">Naplata{billingTodo ? <Badge tone="coral">{billingTodo}</Badge> : null}</Link><Link href="/admin/zahtevi" className="btn btn-soft">Zahtevi za demo{newDemos ? <Badge tone="coral">{newDemos} novo</Badge> : null}</Link></>}
      />
      <Flash ok={sp.ok === 'obrisano' ? 'Škola je obrisana.' : undefined} />
      <InstallCard />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aktivne škole" value={active} tone="brand" />
        <Stat label="U probnom periodu" value={trial} />
        <Stat label="Ukupno škola" value={list.length} />
        <Stat label="Mesečni prihod (procena)" value={rsd(Math.round(mrr))} hint="aktivne mesečne i godišnje" />
      </div>

      {expiring.length > 0 && (
        <Card title={`Ističe u narednih 7 dana ili je isteklo (${expiring.length})`} className="mb-6" actions={<Link href="/admin/naplata" className="text-[13px] font-bold text-brand">Naplata →</Link>}>
          <ul className="flex flex-col divide-y divide-line">
            {expiring.map(({ o, end }) => {
              const d = daysUntil(end)!;
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <Link href={`/admin/skole/${o.id}`} className="font-extrabold text-ink hover:text-brand">{o.name}</Link>
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-mut">
                    {STATUS_LABEL[o.status]} · {dateSr(end)}
                    <Badge tone={d < 0 ? 'coral' : d <= 3 ? 'coral' : 'soft'}>{d < 0 ? `isteklo pre ${-d} d` : d === 0 ? 'ističe danas' : `za ${d} d`}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          {list.length === 0 ? (
            <Card><p className="text-[15px] font-semibold text-mut">Još nema škola. Napravi prvu desno.</p></Card>
          ) : (
            <>
            <ul className="flex flex-col gap-2 md:hidden">
              {list.map((o) => {
                const acc = orgAccess(o);
                return (
                  <li key={o.id} className="card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/skole/${o.id}`} className="min-w-0">
                        <span className="block truncate font-extrabold text-ink">{o.name}</span>
                        <span className="block text-[12px] font-semibold text-mut">{PLANS[o.plan].name} · {BILLING_LABEL[o.billing]} · {perOrg.get(o.id) ?? 0} uč.</span>
                      </Link>
                      <Badge tone={!acc.ok ? 'coral' : o.status === 'active' ? 'ok' : 'soft'}>{acc.ok ? STATUS_LABEL[o.status] : 'Isteklo'}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-mut">Važi do: {o.billing === 'lifetime' ? 'zauvek' : dateSr(o.status === 'trial' ? o.trial_ends_at : o.paid_until) || '—'}</span>
                      <form action={enterOrg}>
                        <input type="hidden" name="org_id" value={o.id} />
                        <button className="btn btn-sm btn-soft">Uđi</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
            <Table head={['Škola', 'Paket', 'Status', 'Važi do', 'Učenika', '']}>
              {list.map((o) => {
                const acc = orgAccess(o);
                return (
                  <tr key={o.id}>
                    <td className="td">
                      <Link href={`/admin/skole/${o.id}`} className="font-extrabold text-ink hover:text-brand">{o.name}</Link>
                      <div className="text-[12px] font-semibold text-mut">{KINDS[o.kind] ?? o.kind}{o.city ? `, ${o.city}` : ''}</div>
                    </td>
                    <td className="td font-semibold">{PLANS[o.plan].name} · {BILLING_LABEL[o.billing]}</td>
                    <td className="td">
                      <Badge tone={!acc.ok ? 'coral' : o.status === 'active' ? 'ok' : 'soft'}>{acc.ok ? STATUS_LABEL[o.status] : 'Isteklo'}</Badge>
                    </td>
                    <td className="td text-[14px] font-semibold">{o.billing === 'lifetime' ? 'zauvek' : dateSr(o.status === 'trial' ? o.trial_ends_at : o.paid_until) || '—'}</td>
                    <td className="td tabular-nums">{perOrg.get(o.id) ?? 0}</td>
                    <td className="td text-right">
                      <form action={enterOrg}>
                        <input type="hidden" name="org_id" value={o.id} />
                        <button className="btn btn-sm btn-soft">Uđi</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </Table>
            </div>
            </>
          )}
        </div>

        <div id="nova-skola" className="scroll-mt-20"><Card title="Nova škola">
          {demo && <div className="mb-4 rounded-xl bg-soft px-3 py-2 text-[13px] font-bold text-mut">Iz zahteva za demo: {demo.name}</div>}
          <CredsForm action={createOrg} submit="Napravi školu i nalog" className="grid gap-3">
            {demo && <input type="hidden" name="demo_id" value={demo.id} />}
            <Field label="Naziv škole" name="name" required defaultValue={demo?.school} />
            <Select label="Vrsta" name="kind" defaultValue={demo?.kind ?? 'skola_jezika'} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
            <Field label="Grad" name="city" />
            <Field label="Ime i prezime vlasnika" name="owner_name" required defaultValue={demo?.name} />
            <Field label="Email vlasnika (za prijavu)" name="owner_email" type="email" required defaultValue={demo?.email} />
            <Field label="Telefon" name="phone" defaultValue={demo?.phone} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Paket" name="plan" defaultValue="rast" options={Object.entries(PLANS).map(([value, p]) => ({ value, label: p.name }))} />
              <Field label="Probni dani" name="trial_days" type="number" defaultValue={14} min={1} max={90} />
            </div>
          </CredsForm>
        </Card></div>
      </div>
    </>
  );
}
