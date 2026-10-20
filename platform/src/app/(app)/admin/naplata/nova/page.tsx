import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Flash, Field, Select, TextArea } from '@/components/ui';
import { defaultDue, nextPeriod, periodText, planLabel, planPrice } from '@/lib/billing';
import { todayISO } from '@/lib/format';
import { PLANS, BILLING_LABEL, type Organization, type PlatformSettings } from '@/lib/types';
import { createInvoice } from '../../billing-actions';

export const metadata = { title: 'Nova instrukcija za uplatu' };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ skola?: string; err?: string }> }) {
  await requireSuper();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: orgs }, { data: st }] = await Promise.all([
    db.from('organizations').select('*').neq('status', 'cancelled').order('name'),
    db.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  const list = (orgs ?? []) as Organization[];
  const org = list.find((o) => o.id === sp.skola);
  const today = todayISO();
  const billing = org ? (org.billing === 'lifetime' ? 'monthly' : org.billing) : 'monthly';
  const per = org ? nextPeriod({ ...org, billing }) : null;

  return (
    <>
      <PageHeader title="Nova instrukcija za uplatu" subtitle="Nije faktura: podaci i QR kod za uplatu na tvoj račun" back={{ href: '/admin/naplata', label: 'Naplata' }} />
      <Flash err={sp.err} />
      {!org ? (
        <Card title="Izaberi školu">
          <form className="flex flex-wrap gap-2">
            <select name="skola" className="input max-w-md" required defaultValue="">
              <option value="">Škola...</option>
              {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="btn">Dalje</button>
          </form>
        </Card>
      ) : (
        <Card title={org.name}>
          <form action={createInvoice} className="grid gap-4">
            <input type="hidden" name="org_id" value={org.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Datum" name="issue_date" type="date" defaultValue={today} required />
              <Field label="Rok za uplatu" name="due_date" type="date" defaultValue={org.paid_until && org.paid_until > today ? org.paid_until : st ? defaultDue(st, today) : today} />
              <Select label="Paket" name="plan" defaultValue={org.plan} options={Object.entries(PLANS).map(([v, p]) => ({ value: v, label: p.name }))} />
              <Select label="Naplata" name="billing" defaultValue={billing} options={Object.entries(BILLING_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              <Field label="Period od" name="period_from" type="date" defaultValue={per?.from} />
              <Field label="Period do" name="period_to" type="date" defaultValue={per?.to ?? ''} />
            </div>
            <div className="grid gap-2">
              <span className="label">Stavke</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_130px] gap-2">
                  <input className="input" name={`item_${i}_desc`} placeholder="Opis" defaultValue={i === 0 ? `${planLabel(org.plan, billing)}, ${per ? periodText(per.from, per.to) : ''}` : ''} />
                  <input className="input" name={`item_${i}_qty`} type="number" min={1} defaultValue={1} aria-label="Količina" />
                  <input className="input" name={`item_${i}_price`} type="number" min={0} step="1" placeholder="Iznos" defaultValue={i === 0 ? planPrice(org.plan, billing) : ''} aria-label="Cena" />
                </div>
              ))}
              <span className="text-[12px] font-semibold text-mut">Popust ili posebnu cenu upiši direktno u iznos. Prazne stavke se preskaču.</span>
            </div>
            <TextArea label="Napomena (vidi škola)" name="note" placeholder="npr. Popust 30% za rane korisnike" />
            <div><button className="btn">Napravi instrukciju</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
