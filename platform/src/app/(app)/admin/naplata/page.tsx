import Link from 'next/link';
import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Stat, Badge, Flash, Empty } from '@/components/ui';
import { SendButtons } from '@/components/send-buttons';
import { accessEnds, daysUntil, needsBilling, paymentMessage, planPrice } from '@/lib/billing';
import { currentPeriod, dateSr, rsd, todayISO, periodLabel } from '@/lib/format';
import { PLANS, BILLING_LABEL, STATUS_LABEL, type Invoice, type Organization, type PlatformSettings, type SubPayment } from '@/lib/types';
import { createInvoicesBulk, recordSubscriptionPayment } from '../billing-actions';

export const metadata = { title: 'Naplata' };

const METHOD: Record<string, string> = { bank: 'Račun', cash: 'Gotovina', card: 'Kartica', other: 'Drugo' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSuper();
  const sp = await searchParams;
  const db = createAdminClient();
  const today = todayISO();
  const month = currentPeriod();
  const [{ data: orgsData }, { data: invData }, { data: payData }, { data: st }] = await Promise.all([
    db.from('organizations').select('*').order('name'),
    db.from('invoices').select('*').order('issue_date', { ascending: false }).order('number', { ascending: false }).limit(300),
    db.from('subscription_payments').select('*').gte('paid_at', `${month}-01`).order('paid_at', { ascending: false }),
    db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  const orgs = (orgsData ?? []) as Organization[];
  const invoices = (invData ?? []) as Invoice[];
  const pays = (payData ?? []) as SubPayment[];
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const openByOrg = new Set(invoices.filter((i) => i.status === 'issued').map((i) => i.org_id));

  const toCreate = orgs.filter((o) => needsBilling(o, 20) && !openByOrg.has(o.id));
  const open = invoices.filter((i) => i.status === 'issued');
  const late = open.filter((i) => i.due_date && i.due_date < today);
  const notSent = open.filter((i) => !i.sent_at);
  const collected = pays.reduce((a, p) => a + Number(p.amount), 0);
  const waiting = open.reduce((a, i) => a + Number(i.total), 0);
  const billingDay = st?.billing_day ?? 10;
  const dayNow = Number(today.slice(8, 10));
  const isBillingTime = dayNow >= billingDay;

  return (
    <>
      <PageHeader
        title="Naplata"
        subtitle="Pretplate škola: instrukcije za uplatu, slanje i praćenje"
        actions={
          <>
            <Link href="/admin/naplata/podesavanja" className="btn btn-soft">Moji podaci za uplatu</Link>
            <Link href="/admin/naplata/nova" className="btn">+ Nova instrukcija</Link>
          </>
        }
      />
      <Flash ok={sp.ok === 'uplata' ? 'Uplata je evidentirana i pretplata produžena.' : sp.ok} err={sp.err} />

      {(toCreate.length > 0 || notSent.length > 0) && (
        <div className={`mb-6 rounded-2xl p-5 ${isBillingTime ? 'bg-coral-soft' : 'bg-white ring-1 ring-line'}`}>
          <div className={`text-[17px] font-extrabold ${isBillingTime ? 'text-coral-dark' : 'text-ink'}`}>
            {isBillingTime ? `Vreme je za naplatu (${billingDay}. u mesecu)` : `Naplata počinje ${billingDay}. u mesecu`}
          </div>
          <p className="mt-1 text-[15px] font-semibold text-ink-2">
            {toCreate.length > 0 && <>Za {toCreate.length} {toCreate.length === 1 ? 'školu treba napraviti instrukciju' : 'škola treba napraviti instrukcije'}. </>}
            {notSent.length > 0 && <>{notSent.length} {notSent.length === 1 ? 'instrukcija nije poslata' : 'instrukcija nije poslato'}.</>}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Naplaćeno, ${periodLabel(month).toLowerCase()}`} value={rsd(collected)} tone="brand" hint={`${pays.length} uplata`} />
        <Stat label="Čeka uplatu" value={rsd(waiting)} hint={`${open.length} instrukcija`} />
        <Stat label="Kasni" value={late.length} tone={late.length ? 'coral' : 'default'} hint={late.length ? rsd(late.reduce((a, i) => a + Number(i.total), 0)) : 'niko ne kasni'} />
        <Stat label="Aktivne škole" value={orgs.filter((o) => o.status === 'active').length} hint={`${orgs.filter((o) => o.status === 'trial').length} u probnom periodu`} />
      </div>

      <div className="flex flex-col gap-6">
        <Card title={`1. Treba napraviti instrukciju (${toCreate.length})`}>
          {toCreate.length === 0 ? (
            <p className="text-[15px] font-semibold text-mut">Nijednoj školi pristup ne ističe u narednih 20 dana bez poslate instrukcije.</p>
          ) : (
            <form action={createInvoicesBulk}>
              <ul className="flex flex-col divide-y divide-line">
                {toCreate.map((o) => {
                  const end = accessEnds(o) ?? o.paid_until;
                  const d = daysUntil(end);
                  const billing = o.billing === 'lifetime' ? 'monthly' : o.billing;
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                      <input type="checkbox" name="org_id" value={o.id} defaultChecked className="h-5 w-5 accent-brand" aria-label={`Izaberi ${o.name}`} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/skole/${o.id}`} className="font-extrabold text-ink hover:text-brand">{o.name}</Link>
                        <div className="text-[13px] font-semibold text-mut">{PLANS[o.plan].name} · {BILLING_LABEL[billing]} · {STATUS_LABEL[o.status]}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold tabular-nums">{rsd(planPrice(o.plan, billing))}</div>
                        <Badge tone={d !== null && d < 0 ? 'coral' : 'soft'}>{end ? (d !== null && d < 0 ? `isteklo ${dateSr(end)}` : `ističe ${dateSr(end)}`) : 'bez datuma'}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button className="btn mt-4">Napravi instrukcije za izabrane</button>
            </form>
          )}
        </Card>

        <Card title={`2. Pošalji i čekaj uplatu (${open.length})`}>
          {open.length === 0 ? (
            <p className="text-[15px] font-semibold text-mut">Nema otvorenih instrukcija.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {open.map((inv) => {
                const org = byId.get(inv.org_id);
                const isLate = inv.due_date && inv.due_date < today;
                return (
                  <li key={inv.id} className="rounded-2xl bg-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/admin/naplata/${inv.id}`} className="font-extrabold text-ink hover:text-brand">{org?.name ?? inv.buyer?.name} · br. {inv.number}</Link>
                        <div className="text-[13px] font-semibold text-mut">{inv.items[0]?.description}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isLate ? <Badge tone="coral">Kasni, rok {dateSr(inv.due_date)}</Badge> : <Badge tone="gray">Rok {dateSr(inv.due_date)}</Badge>}
                          {inv.sent_at ? <Badge tone="ok">Poslato {dateSr(inv.sent_at.slice(0, 10))}</Badge> : <Badge tone="coral">Nije poslato</Badge>}
                        </div>
                      </div>
                      <div className="text-[18px] font-extrabold tabular-nums text-brand">{rsd(inv.total)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                      {st && <SendButtons invoiceId={inv.id} phone={org?.phone} email={org?.email} message={paymentMessage(st, inv)} subject={`Klasiko: instrukcije za uplatu ${inv.number}`} sentAt={inv.sent_at} />}
                      <form action={recordSubscriptionPayment} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="org_id" value={inv.org_id} />
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <input type="hidden" name="amount" value={String(inv.total)} />
                        {inv.plan && <input type="hidden" name="plan" value={inv.plan} />}
                        {inv.billing && <input type="hidden" name="billing" value={inv.billing} />}
                        <input type="hidden" name="back" value="/admin/naplata" />
                        <input type="date" name="paid_at" defaultValue={today} className="input h-9 w-auto text-sm" aria-label="Datum uplate" />
                        <button className="btn btn-sm">Plaćeno ✓</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`3. Plaćeno ovog meseca (${pays.length})`}>
          {pays.length === 0 ? (
            <p className="text-[15px] font-semibold text-mut">Još nema uplata ovog meseca.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {pays.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <Link href={`/admin/skole/${p.org_id}`} className="font-bold text-ink hover:text-brand">{byId.get(p.org_id)?.name ?? 'Škola'}</Link>
                    <div className="text-[13px] font-semibold text-mut">{dateSr(p.paid_at)} · {METHOD[p.method]}{p.paid_until_after ? ` · plaćeno do ${dateSr(p.paid_until_after)}` : p.billing === 'lifetime' ? ' · lifetime' : ''}</div>
                  </div>
                  <div className="font-extrabold tabular-nums text-ok">{rsd(p.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Sve instrukcije">
          {invoices.length === 0 ? (
            <Empty title="Još nema instrukcija" text="Napravi prvu za neku školu ili sačekaj da se pojave škole kojima ističe pristup." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead><tr>{['Broj', 'Škola', 'Datum', 'Iznos', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="td"><Link href={`/admin/naplata/${i.id}`} className="font-bold text-brand">{i.number}</Link></td>
                      <td className="td font-semibold">{byId.get(i.org_id)?.name ?? i.buyer?.name}</td>
                      <td className="td">{dateSr(i.issue_date)}</td>
                      <td className="td font-bold tabular-nums">{rsd(i.total)}</td>
                      <td className="td"><Badge tone={i.status === 'paid' ? 'ok' : i.status === 'cancelled' ? 'gray' : i.due_date && i.due_date < today ? 'coral' : 'soft'}>{i.status === 'paid' ? 'Plaćeno' : i.status === 'cancelled' ? 'Poništeno' : i.due_date && i.due_date < today ? 'Kasni' : 'Čeka uplatu'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
