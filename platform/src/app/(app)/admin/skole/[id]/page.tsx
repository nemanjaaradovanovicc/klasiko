import { notFound } from 'next/navigation';
import { requireSuper, orgAccess } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Card, Field, Select, TextArea, Flash, Badge, Stat } from '@/components/ui';
import { CredsForm, ResetButton } from '@/components/creds';
import { KINDS, PLANS, STATUS_LABEL, BILLING_LABEL, ROLE_LABEL, type Organization, type Profile } from '@/lib/types';
import { dateSr } from '@/lib/format';
import { updateOrg, deleteOrg, adminAddUser, resetPassword, setUserActive, enterOrg } from '../../actions';
import { recordSubscriptionPayment, deleteSubscriptionPayment } from '../../billing-actions';
import { planPrice } from '@/lib/billing';
import { rsd, todayISO } from '@/lib/format';
import Link from 'next/link';
import { ConfirmButton } from '@/components/confirm';
import type { Invoice, SubPayment } from '@/lib/types';

export default async function OrgDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSuper();
  const { id } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: org }, { data: users }, { count: students }, { count: groups }, { data: invs }, { data: subPays }] = await Promise.all([
    db.from('organizations').select('*').eq('id', id).single<Organization>(),
    db.from('profiles').select('*').eq('org_id', id).order('created_at'),
    db.from('students').select('id', { count: 'exact', head: true }).eq('org_id', id).eq('active', true),
    db.from('groups').select('id', { count: 'exact', head: true }).eq('org_id', id).eq('active', true),
    db.from('invoices').select('*').eq('org_id', id).order('issue_date', { ascending: false }).limit(24),
    db.from('subscription_payments').select('*').eq('org_id', id).order('paid_at', { ascending: false }).limit(24),
  ]);
  if (!org) notFound();
  const acc = orgAccess(org);
  // Otvaranjem škole u adminu nestaje oznaka „Novo”.
  if (!org.admin_seen_at) await db.from('organizations').update({ admin_seen_at: new Date().toISOString() }).eq('id', id);

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={<>{KINDS[org.kind] ?? org.kind} · {org.source === 'self' ? 'sama se registrovala' : 'napravio admin'} {dateSr(org.created_at)}</>}
        back={{ href: '/admin', label: 'Sve škole' }}
        actions={
          <form action={enterOrg}>
            <input type="hidden" name="org_id" value={org.id} />
            <button className="btn">Uđi u školu</button>
          </form>
        }
      />
      <Flash ok={sp.ok ? 'Sačuvano.' : undefined} err={sp.err} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Status" value={acc.ok ? STATUS_LABEL[org.status] : 'Isteklo'} tone={acc.ok ? 'default' : 'coral'} hint={acc.reason} />
        <Stat label="Paket" value={PLANS[org.plan].name} hint={BILLING_LABEL[org.billing]} />
        <Stat label="Aktivni učenici" value={students ?? 0} hint={PLANS[org.plan].students ? `limit ${PLANS[org.plan].students}` : 'bez limita'} />
        <Stat label="Aktivne grupe" value={groups ?? 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Pretplata i podaci">
          <form action={updateOrg} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={org.id} />
            <div className="sm:col-span-2"><Field label="Naziv" name="name" defaultValue={org.name} required /></div>
            <Select label="Vrsta" name="kind" defaultValue={org.kind} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
            <Field label="Grad" name="city" defaultValue={org.city} />
            <Field label="Telefon" name="phone" defaultValue={org.phone} />
            <Field label="Email" name="email" type="email" defaultValue={org.email} />
            <Field label="Ime ili naziv uplatioca" name="billing_name" defaultValue={org.billing_name} hint="Na instrukciji za uplatu; prazno = naziv škole" />
            <Field label="Adresa uplatioca" name="billing_address" defaultValue={org.billing_address ?? org.address} />
            <Select label="Paket" name="plan" defaultValue={org.plan} options={Object.entries(PLANS).map(([value, p]) => ({ value, label: p.name }))} />
            <Select label="Naplata" name="billing" defaultValue={org.billing} options={Object.entries(BILLING_LABEL).map(([value, label]) => ({ value, label }))} />
            <Select label="Status" name="status" defaultValue={org.status} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            <Field label="Probni period do" name="trial_ends_at" type="date" defaultValue={org.trial_ends_at} />
            <Field label="Plaćeno do" name="paid_until" type="date" defaultValue={org.paid_until} hint="Za mesečnu i godišnju naplatu. Lifetime ne ističe." />
            <div className="sm:col-span-2"><TextArea label="Beleške (vidi samo admin)" name="admin_notes" defaultValue={org.admin_notes} /></div>
            <div className="sm:col-span-2"><button className="btn">Sačuvaj</button></div>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Pretplata: uplate" actions={<Link href={`/admin/naplata/nova?skola=${org.id}`} className="text-[13px] font-bold text-brand">+ Instrukcija za uplatu</Link>}>
            <form action={recordSubscriptionPayment} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="org_id" value={org.id} />
              <label><span className="label">Datum uplate</span><input type="date" name="paid_at" defaultValue={todayISO()} className="input" /></label>
              <label><span className="label">Iznos (RSD)</span><input type="number" name="amount" min={1} defaultValue={planPrice(org.plan, org.billing)} className="input" /></label>
              <Select label="Paket" name="plan" defaultValue={org.plan} options={Object.entries(PLANS).map(([value, p]) => ({ value, label: p.name }))} />
              <Select label="Produži za" name="extend" defaultValue={org.billing === 'yearly' ? 'year' : org.billing === 'lifetime' ? 'lifetime' : 'month'} options={[{ value: 'month', label: '1 mesec' }, { value: 'year', label: '1 godinu' }, { value: 'lifetime', label: 'Lifetime (zauvek)' }, { value: 'none', label: 'Ne produžavaj' }]} />
              <Select label="Način" name="method" defaultValue="bank" options={[{ value: 'bank', label: 'Uplata na račun' }, { value: 'cash', label: 'Gotovina' }, { value: 'other', label: 'Drugo' }]} />
              <Select label="Za instrukciju" name="invoice_id" defaultValue="" placeholder="Bez instrukcije" options={((invs ?? []) as Invoice[]).filter((i) => i.status === 'issued').map((i) => ({ value: i.id, label: `${i.number} · ${rsd(i.total)}` }))} />
              <div className="sm:col-span-2"><Field label="Napomena" name="note" /></div>
              <div className="sm:col-span-2"><button className="btn">Evidentiraj uplatu</button></div>
            </form>
            <ul className="mt-5 flex flex-col divide-y divide-line border-t border-line pt-2">
              {((subPays ?? []) as SubPayment[]).length === 0 && <li className="py-2 text-[14px] font-semibold text-mut">Još nema uplata.</li>}
              {((subPays ?? []) as SubPayment[]).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                  <span className="font-semibold text-ink-2">{dateSr(p.paid_at)} · {rsd(p.amount)}{p.paid_until_after ? ` · do ${dateSr(p.paid_until_after)}` : p.billing === 'lifetime' ? ' · lifetime' : ''}{p.note ? ` · ${p.note}` : ''}</span>
                  <form action={deleteSubscriptionPayment}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="org_id" value={org.id} />
                    <ConfirmButton message="Obrisati ovu uplatu? Ako je poslednja, „plaćeno do” se vraća na prethodni datum." className="text-[12px] font-bold text-coral-dark hover:underline">obriši</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
            {((invs ?? []) as Invoice[]).length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-mut">Instrukcije</div>
                <ul className="flex flex-col gap-1.5">
                  {((invs ?? []) as Invoice[]).map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-[14px]">
                      <Link href={`/admin/naplata/${i.id}`} className="font-bold text-brand">{i.number} · {dateSr(i.issue_date)}</Link>
                      <span className="flex items-center gap-2"><span className="font-bold tabular-nums">{rsd(i.total)}</span><Badge tone={i.status === 'paid' ? 'ok' : i.status === 'cancelled' ? 'gray' : 'coral'}>{i.status === 'paid' ? 'Plaćeno' : i.status === 'cancelled' ? 'Poništeno' : 'Čeka'}</Badge></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title="Korisnici škole">
            <ul className="flex flex-col divide-y divide-line">
              {((users ?? []) as Profile[]).map((u) => (
                <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-extrabold text-ink">{u.full_name || u.email}</div>
                    <div className="text-[13px] font-semibold text-mut">{u.email} · {ROLE_LABEL[u.role]}</div>
                    <div className="mt-1 flex gap-1.5">
                      {!u.active && <Badge tone="coral">Deaktiviran</Badge>}
                      {u.must_change_password && <Badge tone="gray">Čeka prvu prijavu</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <ResetButton action={resetPassword} userId={u.id} />
                    <form action={setUserActive}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                      <ConfirmButton message={u.active ? 'Deaktivirati ovaj nalog?' : 'Aktivirati ovaj nalog?'} className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-soft'}`}>{u.active ? 'Deaktiviraj' : 'Aktiviraj'}</ConfirmButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Dodaj korisnika">
            <CredsForm action={adminAddUser} submit="Dodaj korisnika" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="org_id" value={org.id} />
              <Field label="Ime i prezime" name="full_name" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Telefon" name="phone" />
              <Select label="Uloga" name="role" defaultValue="teacher" options={[{ value: 'teacher', label: 'Predavač' }, { value: 'owner', label: 'Vlasnik' }]} />
            </CredsForm>
          </Card>
          <Card title="Brisanje škole">
            <form action={deleteOrg} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={org.id} />
              <div className="min-w-[200px] flex-1"><Field label="Upiši OBRIŠI za potvrdu" name="confirm" /></div>
              <button className="btn btn-danger">Obriši školu i sve podatke</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
