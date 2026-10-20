import { notFound } from 'next/navigation';
import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Flash } from '@/components/ui';
import { PaymentDoc } from '@/components/payment-doc';
import { SendButtons } from '@/components/send-buttons';
import { PrintButton } from '@/components/print-button';
import { paymentMessage } from '@/lib/billing';
import { todayISO } from '@/lib/format';
import type { Invoice, Organization, PlatformSettings } from '@/lib/types';
import { cancelInvoice, recordSubscriptionPayment } from '../../billing-actions';

export const metadata = { title: 'Instrukcija za uplatu' };

const OK: Record<string, string> = { nova: 'Instrukcija je napravljena. Pošalji je školi.', ponisteno: 'Instrukcija je poništena.', uplata: 'Uplata je evidentirana i pretplata produžena.' };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSuper();
  const { id } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: inv }, { data: st }] = await Promise.all([
    db.from('invoices').select('*').eq('id', id).single<Invoice>(),
    db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  if (!inv || !st) notFound();
  const { data: org } = await db.from('organizations').select('*').eq('id', inv.org_id).single<Organization>();

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={`Instrukcija ${inv.number}`} subtitle={org?.name} back={{ href: '/admin/naplata', label: 'Naplata' }} actions={<PrintButton />} />
        <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />
        {inv.status === 'issued' && (
          <Card title="Pošalji i evidentiraj" className="mb-6">
            <div className="flex flex-col gap-4">
              <SendButtons invoiceId={inv.id} phone={org?.phone} email={org?.email} message={paymentMessage(st, inv)} subject={`Klasiko: instrukcije za uplatu ${inv.number}`} sentAt={inv.sent_at} />
              <details>
                <summary className="cursor-pointer text-[13px] font-bold text-mut">Pogledaj poruku</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-soft p-3 font-sans text-[14px] font-semibold text-ink-2">{paymentMessage(st, inv)}</pre>
              </details>
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <form action={recordSubscriptionPayment} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="org_id" value={inv.org_id} />
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  {inv.plan && <input type="hidden" name="plan" value={inv.plan} />}
                  {inv.billing && <input type="hidden" name="billing" value={inv.billing} />}
                  <input type="hidden" name="back" value={`/admin/naplata/${inv.id}`} />
                  <label><span className="label">Datum uplate</span><input type="date" name="paid_at" defaultValue={todayISO()} className="input h-10 w-auto" /></label>
                  <label><span className="label">Iznos</span><input type="number" name="amount" defaultValue={inv.total} className="input h-10 w-32" /></label>
                  <button className="btn">Plaćeno, produži pretplatu</button>
                </form>
                <form action={cancelInvoice}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button className="btn btn-ghost text-coral-dark">Poništi</button>
                </form>
              </div>
            </div>
          </Card>
        )}
      </div>
      <PaymentDoc inv={inv} st={st} />
    </>
  );
}
