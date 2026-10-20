import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Field, Flash, TextArea } from '@/components/ui';
import type { PlatformSettings } from '@/lib/types';
import { saveBillingSettings } from '../../billing-actions';

export const metadata = { title: 'Podaci za uplatu' };

export default async function BillingSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSuper();
  const sp = await searchParams;
  const db = createAdminClient();
  const { data: st } = await db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>();
  return (
    <>
      <PageHeader title="Moji podaci za uplatu" subtitle="Pojavljuju se na instrukcijama, u QR kodu i u porukama školama" back={{ href: '/admin/naplata', label: 'Naplata' }} />
      <Flash ok={sp.ok ? 'Sačuvano.' : undefined} err={sp.err} />
      <Card>
        <form action={saveBillingSettings} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Ime i prezime primaoca" name="issuer_name" defaultValue={st?.issuer_name} required /></div>
          <Field label="Adresa" name="issuer_address" defaultValue={st?.issuer_address} />
          <Field label="Mesto" name="issuer_city" defaultValue={st?.issuer_city} />
          <Field label="Tekući račun" name="bank_account" defaultValue={st?.bank_account} required />
          <Field label="Banka" name="bank_name" defaultValue={st?.bank_name} />
          <Field label="Telefon" name="phone" defaultValue={st?.phone} />
          <Field label="Email" name="email" type="email" defaultValue={st?.email} />
          <Field label="Rok za uplatu (dana)" name="payment_days" type="number" min={1} max={60} defaultValue={st?.payment_days ?? 8} />
          <Field label="Dan u mesecu za naplatu" name="billing_day" type="number" min={1} max={28} defaultValue={st?.billing_day ?? 10} hint="Od tog dana admin te podseća da pošalješ instrukcije" />
          <div className="sm:col-span-2"><TextArea label="Napomena na dnu instrukcije" name="invoice_note" defaultValue={st?.invoice_note} /></div>
          <div className="sm:col-span-2"><button className="btn">Sačuvaj</button></div>
        </form>
      </Card>
    </>
  );
}
