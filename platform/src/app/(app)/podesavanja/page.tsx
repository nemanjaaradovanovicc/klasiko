import { requireOwner, orgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Field, Flash, Badge, Select } from '@/components/ui';
import { CredsForm, ResetButton } from '@/components/creds';
import { PLANS, BILLING_LABEL, STATUS_LABEL, ROLE_LABEL, type Profile } from '@/lib/types';
import { dateSr, rsd } from '@/lib/format';
import { updateSchool, updateAutomation, addRoom, deleteRoom, addTeamMember, resetTeamPassword, toggleTeamMember } from './actions';
import { ConfirmButton } from '@/components/confirm';
import { AUDIT_LABEL } from '@/lib/audit';
import { emailEnabled } from '@/lib/email';
import Link from 'next/link';
import { QrImage } from '@/components/qr-image';
import { daysUntil, planPrice, planQr } from '@/lib/billing';
import type { Invoice, PlatformSettings } from '@/lib/types';

export const metadata = { title: 'Podešavanja' };

const OK: Record<string, string> = { '1': 'Podaci škole su sačuvani.', sala: 'Sala je dodata.', tim: 'Tim je ažuriran.', auto: 'Automatska naplata je sačuvana.' };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const org = ctx.org;
  const supabase = await createClient();
  const [{ data: rooms }, { data: team }, { data: invs }, { data: st }, { data: log }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity').eq('org_id', org.id).order('name'),
    supabase.from('profiles').select('*').eq('org_id', org.id).order('created_at'),
    supabase.from('invoices').select('*').eq('org_id', org.id).eq('status', 'issued').order('issue_date', { ascending: false }),
    supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle<PlatformSettings>(),
    supabase.from('audit_log').select('id, at, action, actor_email, target').eq('org_id', org.id).order('at', { ascending: false }).limit(15),
  ]);
  const openInv = (invs ?? []) as Invoice[];
  const left = org.status === 'active' && org.billing !== 'lifetime' ? daysUntil(org.paid_until) : null;
  const payBilling = org.billing === 'lifetime' ? 'monthly' : org.billing;
  const qr = st && org.billing !== 'lifetime' && openInv.length === 0 ? planQr(st, org, org.plan, payBilling) : null;
  const plan = PLANS[org.plan];
  const acc = orgAccess(org);

  return (
    <>
      <PageHeader title="Podešavanja" subtitle={org.name} />
      <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card title="Podaci škole">
          <form action={updateSchool} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Naziv škole" name="name" defaultValue={org.name} required /></div>
            <Field label="Grad" name="city" defaultValue={org.city} />
            <Field label="Adresa" name="address" defaultValue={org.address} />
            <Field label="Telefon" name="phone" defaultValue={org.phone} />
            <Field label="Email" name="email" type="email" defaultValue={org.email} />
            <Field label="PIB" name="pib" defaultValue={org.pib} />
            <Field label="Matični broj" name="mb" defaultValue={org.mb} />
            <div className="sm:col-span-2 mt-2 text-[13px] font-extrabold uppercase tracking-wider text-mut">Uplate (za IPS QR kod)</div>
            <Field label="Tekući račun" name="bank_account" defaultValue={org.bank_account} placeholder="160-5100000000-99" />
            <Field label="Naziv primaoca na uplatnici" name="payee_name" defaultValue={org.payee_name ?? org.name} />
            <Field label="Podrazumevana mesečna cena (RSD)" name="default_fee" type="number" min={0} defaultValue={org.default_fee} hint="Koristi se kad grupa nema svoju cenu" />
            <Field label="Rok za uplatu (dan u mesecu)" name="fee_due_day" type="number" min={1} max={28} defaultValue={org.fee_due_day} />
            <div className="sm:col-span-2"><button className="btn">Sačuvaj</button></div>
          </form>
        </Card>

        <div className="order-first flex flex-col gap-6 xl:order-none">
          <Card title="Pretplata">
            <div id="pretplata" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[20px] font-extrabold text-brand">{plan.name}</span>
              <Badge tone={acc.ok ? (org.status === 'active' ? 'ok' : 'soft') : 'coral'}>{STATUS_LABEL[org.status]}</Badge>
              {left !== null && left <= 7 && <Badge tone="coral">{left < 0 ? 'isteklo' : left === 0 ? 'ističe danas' : `ističe za ${left} d`}</Badge>}
            </div>
            <ul className="mt-3 flex flex-col gap-1 text-[14px] font-semibold text-ink-2">
              <li>Naplata: {BILLING_LABEL[org.billing]}{org.billing !== 'lifetime' ? ` · ${rsd(org.billing === 'yearly' ? plan.yearly : plan.monthly)}` : ''}</li>
              <li>Učenika: {plan.students ? `do ${plan.students}` : 'bez ograničenja'} · Predavača: {plan.teachers ? `do ${plan.teachers}` : 'bez ograničenja'}</li>
              {org.status === 'trial' && <li>Probni period do: {dateSr(org.trial_ends_at)}</li>}
              {org.status === 'active' && org.billing !== 'lifetime' && <li>Plaćeno do: {dateSr(org.paid_until) || '—'}</li>}
            </ul>
            {openInv.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {openInv.map((i) => (
                  <Link key={i.id} href={`/uplata/${i.id}`} className="flex items-center justify-between rounded-xl bg-coral-soft px-3 py-2.5 text-[14px] font-bold text-coral-dark">
                    <span>Uplata br. {i.number}{i.due_date ? `, rok ${dateSr(i.due_date)}` : ''}</span>
                    <span>{rsd(i.total)} →</span>
                  </Link>
                ))}
              </div>
            )}
            {qr && st && (
              <div className="mt-4 rounded-2xl bg-soft p-4">
                <div className="text-[13px] font-extrabold uppercase tracking-wider text-mut">Podaci za uplatu</div>
                <div className="mt-2 grid items-center gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="text-[14px] font-semibold text-ink-2">
                    <div>Primalac: <b className="text-ink">{st.issuer_name}</b>{st.issuer_city ? `, ${st.issuer_city}` : ''}</div>
                    <div>Račun: <b className="text-ink tabular-nums">{st.bank_account}</b></div>
                    <div>Iznos: <b className="text-ink">{rsd(planPrice(org.plan, payBilling))}</b></div>
                    <div>Svrha: <b className="text-ink">Klasiko {plan.name} {org.name}</b></div>
                  </div>
                  <QrImage payload={qr} size={120} />
                </div>
              </div>
            )}
            <a className="btn btn-soft mt-4" href="https://wa.me/381638219713?text=Zdravo%2C%20imam%20pitanje%20o%20pretplati%20za%20Klasiko" target="_blank" rel="noopener">Promena paketa ili pitanje</a>
          </Card>

          <Card title="Sale i učionice">
            <div id="sale" />
            <ul className="mb-4 flex flex-col gap-2">
              {(rooms ?? []).length === 0 && <li className="text-[14px] font-semibold text-mut">Još nema sala.</li>}
              {(rooms ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl bg-soft px-3 py-2">
                  <span className="font-bold text-ink">{r.name}{r.capacity ? <span className="font-semibold text-mut"> · {r.capacity} mesta</span> : null}</span>
                  <form action={deleteRoom}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton message={`Obrisati salu ${r.name}?`} className="text-[13px] font-bold text-coral-dark hover:underline">Obriši</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addRoom} className="flex gap-2">
              <input name="name" className="input" placeholder="npr. Sala 1" required />
              <input name="capacity" type="number" min={1} className="input w-24" placeholder="Mesta" />
              <button className="btn btn-soft">Dodaj</button>
            </form>
          </Card>
        </div>
      </div>

      <div id="automatika" className="mt-6 grid scroll-mt-24 gap-6 xl:grid-cols-2">
        <Card title="Naplata i popusti">
          <form action={updateAutomation} className="flex flex-col gap-4">
            {process.env.CRON_SECRET ? (
              <>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="auto_charges" defaultChecked={org.auto_charges} className="mt-1 h-5 w-5 accent-[#5B2A86]" />
                  <span className="text-[14px] font-semibold text-ink-2"><b className="text-ink">Sama pravi mesečna zaduženja</b>. Svakog meseca, jednom, svim učenicima u grupama sa mesečnom članarinom.</span>
                </label>
                <Field label="Dan u mesecu za zaduženja" name="auto_charge_day" type="number" min={1} max={28} defaultValue={org.auto_charge_day} />
              </>
            ) : (
              <p className="text-[14px] font-semibold text-ink-2">Mesečna zaduženja praviš dugmetom na stranici Uplate.</p>
            )}
            {emailEnabled() ? (
              <>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="auto_reminders" defaultChecked={org.auto_reminders} className="mt-1 h-5 w-5 accent-[#5B2A86]" />
                  <span className="text-[14px] font-semibold text-ink-2"><b className="text-ink">Sama šalje podsetnike na email roditelja</b>. Pre roka i 3 dana posle roka, samo za neplaćeno. WhatsApp poruke šalješ na stranici „Ko duguje”.</span>
                </label>
                <Field label="Koliko dana pre roka" name="reminder_days_before" type="number" min={0} max={14} defaultValue={org.reminder_days_before} />
              </>
            ) : (
              <p className="text-[14px] font-semibold text-ink-2">Podsetnike šalješ na WhatsApp, na stranici „Ko duguje”.</p>
            )}
            <Field label="Popust za braću i sestre (%)" name="sibling_discount_pct" type="number" min={0} max={100} step="1" defaultValue={org.sibling_discount_pct} hint="Prvo upisano dete u porodici plaća punu cenu. Porodice se povezuju na kartici učenika." />
            <div><button className="btn">Sačuvaj</button></div>
          </form>
        </Card>
        <Card title="Podaci i privatnost">
          <p className="text-[14px] font-semibold text-ink-2">Škola je rukovalac podacima učenika, a Klasiko obrađivač. Možeš u svakom trenutku da preuzmeš sve podatke škole ili podatke jednog učenika (na njegovoj kartici).</p>
          <a className="btn btn-soft mt-3" href="/podesavanja/izvoz">Preuzmi sve podatke škole (JSON)</a>
          <p className="mt-3 text-[13px] font-semibold text-mut">Za Excel izvoz učenika i uplata otvori Izveštaje. Pregled radnji ispod beleži brisanja, promene tima i ulaske podrške Klasika u tvoju školu.</p>
          {(log ?? []).length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {(log ?? []).map((l) => (
                <li key={l.id} className="py-2 text-[13px]">
                  <div className="font-bold text-ink">{AUDIT_LABEL[l.action] ?? l.action}{l.target ? `: ${l.target}` : ''}</div>
                  <div className="font-semibold text-mut">{dateSr(l.at.slice(0, 10))} · {l.actor_email ?? 'sistem'}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div id="tim" className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card title="Tim">
          <ul className="flex flex-col divide-y divide-line">
            {((team ?? []) as Profile[]).map((u) => (
              <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <div className="font-extrabold text-ink">{u.full_name || u.email}{u.id === ctx.userId && <span className="font-semibold text-mut"> (ti)</span>}</div>
                  <div className="text-[13px] font-semibold text-mut">{u.email} · {ROLE_LABEL[u.role]}</div>
                  <div className="mt-1 flex gap-1.5">
                    {!u.active && <Badge tone="coral">Deaktiviran</Badge>}
                    {u.must_change_password && u.active && <Badge tone="gray">Čeka prvu prijavu</Badge>}
                  </div>
                </div>
                {u.id !== ctx.userId && (
                  <div className="flex flex-wrap items-start gap-2">
                    <ResetButton action={resetTeamPassword} userId={u.id} />
                    <form action={toggleTeamMember}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                      <ConfirmButton message={u.active ? `Deaktivirati nalog za ${u.full_name || u.email}?` : `Aktivirati nalog za ${u.full_name || u.email}?`} className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-soft'}`}>{u.active ? 'Deaktiviraj' : 'Aktiviraj'}</ConfirmButton>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Dodaj člana tima">
          <CredsForm action={addTeamMember} submit="Napravi nalog" className="grid gap-3">
            <Field label="Ime i prezime" name="full_name" required />
            <Field label="Email (za prijavu)" name="email" type="email" required />
            <Field label="Telefon" name="phone" />
            <Select label="Uloga" name="role" defaultValue="teacher" options={[{ value: 'teacher', label: 'Predavač: vidi svoje grupe i upisuje prisustvo' }, { value: 'owner', label: 'Vlasnik: pun pristup, uključujući uplate' }]} />
          </CredsForm>
        </Card>
      </div>
    </>
  );
}
