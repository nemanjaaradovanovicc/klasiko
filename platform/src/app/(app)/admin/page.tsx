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
import { authInfoByUser } from '@/lib/users';

export const metadata = { title: 'Admin' };

type Owner = { id: string; org_id: string; full_name: string; email: string | null; phone: string | null };

const FILTERS: { value: string; label: string; match: (o: Organization) => boolean }[] = [
  { value: '', label: 'Sve', match: () => true },
  { value: 'nove', label: 'Nove', match: (o) => !o.admin_seen_at },
  { value: 'sama', label: 'Same se registrovale', match: (o) => o.source === 'self' },
  { value: 'admin', label: 'Napravio admin', match: (o) => o.source === 'admin' },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; demo?: string; filter?: string }> }) {
  await requireSuper();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: orgs }, { data: counts }, { count: newDemos }, { data: demo }, { data: ownerRows }, authInfo] = await Promise.all([
    db.from('organizations').select('*').order('created_at', { ascending: false }),
    db.from('students').select('org_id').eq('active', true),
    db.from('demo_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sp.demo ? db.from('demo_requests').select('*').eq('id', sp.demo).single() : Promise.resolve({ data: null }),
    db.from('profiles').select('id, org_id, full_name, email, phone').eq('role', 'owner').order('created_at'),
    authInfoByUser(),
  ]);
  const list = (orgs ?? []) as Organization[];
  const perOrg = new Map<string, number>();
  for (const s of counts ?? []) perOrg.set(s.org_id, (perOrg.get(s.org_id) ?? 0) + 1);
  const owners = new Map<string, Owner>();
  for (const o of (ownerRows ?? []) as Owner[]) if (!owners.has(o.org_id)) owners.set(o.org_id, o);
  const authOf = (o: Organization) => { const id = owners.get(o.id)?.id; return id ? authInfo.get(id) : undefined; };
  // Škola čiji vlasnik nije potvrdio email još ne koristi aplikaciju, pa je nema u brojkama i rokovima.
  const unconfirmed = (o: Organization) => authOf(o)?.confirmed === false;
  const real = list.filter((o) => !unconfirmed(o));
  const active = real.filter((o) => o.status === 'active').length;
  const trial = real.filter((o) => o.status === 'trial' && orgAccess(o).ok).length;
  const { data: openInv } = await db.from('invoices').select('org_id, sent_at').eq('status', 'issued');
  const openSet = new Set((openInv ?? []).map((i) => i.org_id));
  const billingTodo = real.filter((o) => needsBilling(o, 20) && !openSet.has(o.id)).length + (openInv ?? []).filter((i) => !i.sent_at).length;
  const expiring = real
    .map((o) => ({ o, end: accessEnds(o) }))
    .filter((x) => x.end && (daysUntil(x.end) ?? 99) <= 7)
    .sort((a, b) => (a.end! < b.end! ? -1 : 1));
  const mrr = real
    .filter((o) => o.status === 'active')
    .reduce((sum, o) => sum + (o.billing === 'monthly' ? PLANS[o.plan].monthly : o.billing === 'yearly' ? PLANS[o.plan].yearly / 12 : 0), 0);
  const newCount = list.filter((o) => !o.admin_seen_at).length;
  const filter = FILTERS.find((f) => f.value === sp.filter) ?? FILTERS[0];
  const shown = list.filter(filter.match);

  const originBadges = (o: Organization) => (
    <span className="mt-1 flex flex-wrap gap-1">
      {!o.admin_seen_at && <Badge tone="coral">Novo</Badge>}
      {o.source === 'self' ? <Badge tone="soft">Sama se registrovala</Badge> : <Badge tone="gray">Napravio admin</Badge>}
      {unconfirmed(o) && <Badge tone="coral">Email nije potvrđen</Badge>}
    </span>
  );
  const ownerInfo = (o: Organization) => {
    const owner = owners.get(o.id);
    if (!owner) return <span className="text-[13px] font-semibold text-mut">Nema vlasnika</span>;
    return (
      <span className="block min-w-0 text-[13px] font-semibold text-ink-2">
        <span className="block font-extrabold text-ink">{owner.full_name || '—'}</span>
        {owner.email && <a className="block break-all font-bold text-brand" href={`mailto:${owner.email}`}>{owner.email}</a>}
        {owner.phone && <a className="block font-bold text-brand" href={`tel:${owner.phone}`}>{owner.phone}</a>}
      </span>
    );
  };
  const activity = (o: Organization) => {
    const lastSignIn = authOf(o)?.lastSignIn;
    return (
      <span className="block text-[13px] font-semibold text-mut">
        <span className="block">Registrovana: {dateSr(o.created_at)}</span>
        <span className="block">Poslednja prijava: {lastSignIn ? dateSr(lastSignIn) : 'nema'}</span>
        <span className="block">Učenika: <span className="tabular-nums">{perOrg.get(o.id) ?? 0}</span></span>
      </span>
    );
  };
  const subscription = (o: Organization) => {
    const acc = orgAccess(o);
    return (
      <span className="block text-[13px] font-semibold text-mut">
        <Badge tone={!acc.ok ? 'coral' : o.status === 'active' ? 'ok' : 'soft'}>{acc.ok ? STATUS_LABEL[o.status] : 'Isteklo'}</Badge>
        <span className="mt-1 block">{PLANS[o.plan].name} · {BILLING_LABEL[o.billing]}</span>
        <span className="block">Važi do: {o.billing === 'lifetime' ? 'zauvek' : dateSr(o.status === 'trial' ? o.trial_ends_at : o.paid_until) || '—'}</span>
      </span>
    );
  };
  const enterButton = (o: Organization) => (
    <form action={enterOrg}>
      <input type="hidden" name="org_id" value={o.id} />
      <button className="btn btn-sm btn-soft">Uđi</button>
    </form>
  );

  return (
    <>
      <PageHeader
        title="Admin Klasika"
        subtitle="Škole, pretplate i korisnici"
        actions={<><Link href="/admin?filter=nove" className="btn btn-soft">Nove registracije{newCount ? <Badge tone="coral">{newCount} novo</Badge> : null}</Link><Link href="/admin/naplata" className="btn btn-soft">Naplata{billingTodo ? <Badge tone="coral">{billingTodo}</Badge> : null}</Link><Link href="/admin/zahtevi" className="btn btn-soft">Zahtevi za demo{newDemos ? <Badge tone="coral">{newDemos} novo</Badge> : null}</Link></>}
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
                  <Link href={`/admin/skole/${o.id}`} prefetch={false} className="font-extrabold text-ink hover:text-brand">{o.name}</Link>
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

      <div className="grid gap-6">
        <div className="min-w-0">
          <nav aria-label="Filter škola" className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.value} href={f.value ? `/admin?filter=${f.value}` : '/admin'} aria-current={f === filter ? 'page' : undefined} className={`btn btn-sm ${f === filter ? '' : 'btn-soft'}`}>
                {f.label}
              </Link>
            ))}
          </nav>
          {list.length === 0 ? (
            <Card><p className="text-[15px] font-semibold text-mut">Još nema škola. Prva može da se registruje sama ili je napravi ispod.</p></Card>
          ) : shown.length === 0 ? (
            <Card><p className="text-[15px] font-semibold text-mut">Nema škola za ovaj filter.</p></Card>
          ) : (
            <>
            <ul className="flex flex-col gap-2 md:hidden">
              {shown.map((o) => (
                <li key={o.id} className="card p-3.5">
                  <Link href={`/admin/skole/${o.id}`} prefetch={false} className="block truncate font-extrabold text-ink">{o.name}</Link>
                  {originBadges(o)}
                  <div className="mt-2 flex flex-col gap-2">
                    {ownerInfo(o)}
                    {activity(o)}
                    {subscription(o)}
                  </div>
                  <div className="mt-2 flex justify-end">{enterButton(o)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <Table head={['Škola', 'Vlasnik', 'Aktivnost', 'Pretplata', '']}>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td className="td">
                    <Link href={`/admin/skole/${o.id}`} prefetch={false} className="font-extrabold text-ink hover:text-brand">{o.name}</Link>
                    <div className="text-[12px] font-semibold text-mut">{KINDS[o.kind] ?? o.kind}{o.city ? `, ${o.city}` : ''}</div>
                    {originBadges(o)}
                  </td>
                  <td className="td">{ownerInfo(o)}</td>
                  <td className="td">{activity(o)}</td>
                  <td className="td">{subscription(o)}</td>
                  <td className="td text-right">{enterButton(o)}</td>
                </tr>
              ))}
            </Table>
            </div>
            </>
          )}
        </div>

        <div id="nova-skola" className="max-w-2xl scroll-mt-20"><Card title="Nova škola">
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
