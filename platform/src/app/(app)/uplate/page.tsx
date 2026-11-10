import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Flash, Stat, Badge, Empty } from '@/components/ui';
import { currentPeriod, formatMoney, formatTotals, parsePeriod, periodLabel, shiftPeriod, fullName, dateSr, todayISO } from '@/lib/format';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { ConfirmButton } from '@/components/confirm';
import { waUrl } from '@/lib/phone';
import { ipsPayload, studentReference } from '@/lib/ips';
import { parentUrl } from '@/lib/parent';
import { QrButton } from './qr';
import { generateCharges, recordPayment, deletePayment, addCharge, updateCharge, createInstallments } from './actions';

export const metadata = { title: 'Uplate' };

const METHOD: Record<string, string> = { cash: 'Gotovina', bank: 'Račun', card: 'Kartica', other: 'Drugo' };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mesec?: string; prikaz?: string; ok?: string; err?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const period = parsePeriod(sp.mesec);
  const filter = sp.prikaz ?? 'sve';
  const supabase = await createClient();
  type C = { id: string; amount: number; currency: string | null; due_date: string | null; description: string | null; student_id: string; students: { first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; phone: string | null; ref_no: number } | null; groups: { name: string } | null; payments: { id: string; amount: number; paid_at: string; method: string }[] };
  const [charges, students, plinks, { data: groupList }] = await Promise.all([
    fetchAll<C>((a, b) => supabase
      .from('charges')
      .select('id, amount, currency, due_date, description, student_id, students(first_name, last_name, parent_name, parent_phone, phone, ref_no), groups(name), payments(id, amount, paid_at, method)')
      .eq('org_id', ctx.org.id)
      .eq('period', period)
      .order('id')
      .range(a, b)),
    fetchAll<{ id: string; first_name: string; last_name: string; family_id: string | null }>((a, b) => supabase.from('students').select('id, first_name, last_name, family_id').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b)),
    fetchAll<{ student_id: string; token: string }>((a, b) => supabase.from('parent_links').select('student_id, token').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)),
    supabase.from('groups').select('id, name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
  ]);
  // Porodica deli jedan link, pa ga dobijaju i braća i sestre učenika na koga glasi.
  const linkBy = new Map(plinks.map((l) => [l.student_id, l.token]));
  const familyOf = new Map(students.map((x) => [x.id, x.family_id]));
  const familyLink = new Map<string, string>();
  for (const l of plinks) { const f = familyOf.get(l.student_id); if (f) familyLink.set(f, l.token); }
  const tokenFor = (id: string) => { const f = familyOf.get(id); return linkBy.get(id) ?? (f ? familyLink.get(f) : undefined); };
  const all = charges.filter((c) => c.students).sort((a, b) => fullName(a.students!).localeCompare(fullName(b.students!), 'sr'));
  const rows = all.map((c) => {
    const paid = c.payments.reduce((a, p) => a + Number(p.amount), 0);
    return { ...c, paid, remaining: Math.max(0, Number(c.amount) - paid), done: paid >= Number(c.amount) };
  });
  const currencies = new Set(rows.map((r) => r.currency || 'RSD'));
  const oneCurrency = currencies.size <= 1;
  const expected = rows.reduce((a, r) => a + Number(r.amount), 0);
  const collected = rows.reduce((a, r) => a + Math.min(r.paid, Number(r.amount)), 0);
  const today = todayISO();
  const late = rows.filter((r) => !r.done && r.due_date && r.due_date < today);
  const shown = filter === 'neplaceno' ? rows.filter((r) => !r.done) : filter === 'placeno' ? rows.filter((r) => r.done) : rows;
  const label = periodLabel(period);

  return (
    <>
      <PageHeader
        title="Uplate"
        subtitle={label}
        actions={
          <>
            <Link href={`/uplate?mesec=${shiftPeriod(period, -1)}`} className="btn btn-soft">←</Link>
            {period !== currentPeriod() && <Link href="/uplate" className="btn btn-soft">Ovaj mesec</Link>}
            <Link href={`/uplate?mesec=${shiftPeriod(period, 1)}`} className="btn btn-soft">→</Link>
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Očekivano" value={formatTotals(rows.map((r) => ({ amount: Number(r.amount), currency: r.currency })))} hint={`${rows.length} zaduženja`} />
        <Stat label="Naplaćeno" value={formatTotals(rows.map((r) => ({ amount: Math.min(r.paid, Number(r.amount)), currency: r.currency })))} tone="ok" hint={oneCurrency && expected ? `${Math.round((collected / expected) * 100)}%` : undefined} />
        <Stat label="Preostalo" value={formatTotals(rows.map((r) => ({ amount: r.remaining, currency: r.currency })))} tone={rows.some((r) => r.remaining > 0) ? 'coral' : 'default'} />
        <Stat label="Kasni sa uplatom" value={late.length} tone={late.length ? 'coral' : 'default'} hint={`rok ${ctx.org.fee_due_day}. u mesecu`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={generateCharges}>
          <input type="hidden" name="period" value={period} />
          <button className="btn">Napravi zaduženja za {label.toLowerCase()}</button>
        </form>
        <Link href="/uplate/izvod" className="btn btn-soft">Uvezi izvod iz banke</Link>
        <Link href="/uplate/dugovanja" className="btn btn-soft">Ko duguje</Link>
        <div className="ml-auto flex gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          {[['sve', 'Sve'], ['neplaceno', 'Neplaćeno'], ['placeno', 'Plaćeno']].map(([v, l]) => (
            <Link key={v} href={`/uplate?mesec=${period}&prikaz=${v}`} className={`rounded-full px-3 py-1.5 text-[13px] font-extrabold ${filter === v ? 'bg-brand text-white' : 'text-mut hover:text-brand'}`}>{l}</Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="Nema zaduženja za ovaj mesec" text="Klikni „Napravi zaduženja” i Klasiko će svakom aktivnom učeniku u grupi obračunati članarinu po ceni grupe, uz popuste." />
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => {
            const s = r.students!;
            const phone = s.parent_phone || s.phone;
            const purpose = `Clanarina ${label} ${fullName(s)}`;
            const ref = studentReference(s.ref_no, period);
            const dinar = (r.currency || 'RSD') === 'RSD';
            const payload = dinar && ctx.org.bank_account && r.remaining > 0 ? ipsPayload({ account: ctx.org.bank_account, payee: ctx.org.payee_name || ctx.org.name, amount: r.remaining, purpose, payer: s.parent_name ?? fullName(s), reference: ref }) : null;
            const plink = tokenFor(r.student_id);
            const reminder = [
              `Dobar dan! Podsećamo da članarina za ${label.toLowerCase()} za ${fullName(s)} iznosi ${formatMoney(r.remaining, r.currency)}.`,
              ctx.org.payment_instructions?.trim() ?? '',
              dinar && ctx.org.bank_account ? `Račun: ${ctx.org.bank_account}, poziv na broj: ${ref}.` : '',
              plink ? `QR kod za uplatu i detalji: ${parentUrl(plink)}` : '',
              `Ako ste već uplatili, zanemarite poruku. Hvala! ${ctx.org.name}`,
            ].filter(Boolean).join('\n');
            const isLate = !r.done && r.due_date && r.due_date < today;
            return (
              <div key={r.id} className="card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/ucenici/${r.student_id}`} className="font-extrabold text-ink hover:text-brand">{fullName(s)}</Link>
                    <div className="truncate text-[13px] font-semibold text-mut">{r.description ?? r.groups?.name}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                    <div className="text-[16px] font-extrabold tabular-nums">{formatMoney(r.amount, r.currency)}</div>
                    {r.done ? <Badge tone="ok">Plaćeno</Badge> : r.paid > 0 ? <Badge>Uplaćeno {formatMoney(r.paid, r.currency)}</Badge> : <Badge tone={isLate ? 'coral' : 'gray'}>{isLate ? 'Kasni' : 'Čeka uplatu'}</Badge>}
                  </div>
                </div>
                {!r.done && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <form action={recordPayment} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="charge_id" value={r.id} />
                      <input type="hidden" name="filter" value={filter} />
                      <select name="method" className="input h-9 w-auto text-sm" defaultValue="bank">
                        <option value="bank">Račun</option>
                        <option value="cash">Gotovina</option>
                        <option value="card">Kartica</option>
                      </select>
                      <input name="amount" type="number" min={1} step="1" placeholder={String(r.remaining)} className="input h-9 w-28 text-sm" aria-label="Iznos (prazno = ceo iznos)" />
                      <button className="btn btn-sm">Evidentiraj uplatu</button>
                    </form>
                    <QrButton payload={payload} title={fullName(s)} amount={formatMoney(r.remaining, r.currency)} purpose={`Članarina ${label}`} />
                    {phone && (
                      <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener" href={waUrl(phone, reminder)}>Podseti na WhatsApp</a>
                    )}
                  </div>
                )}
                {(r.payments.length > 0 || !r.done) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] font-bold text-mut">Detalji</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {r.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-2">
                          <span>{dateSr(p.paid_at)} · {METHOD[p.method]} · {formatMoney(p.amount, r.currency)}</span>
                          <form action={deletePayment}>
                            <input type="hidden" name="period" value={period} />
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton message={`Obrisati uplatu od ${formatMoney(p.amount, r.currency)}?`} className="text-coral-dark hover:underline">obriši</ConfirmButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={updateCharge} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="id" value={r.id} />
                      <input name="amount" type="number" min={0} step="1" defaultValue={r.amount} className="input h-8 w-28 text-sm" />
                      <button className="btn btn-sm btn-soft h-8">Izmeni iznos</button>
                      <ConfirmButton name="delete" value="1" message={`Obrisati zaduženje za ${fullName(s)}?`} className="btn btn-sm btn-ghost h-8 text-coral-dark">Obriši zaduženje</ConfirmButton>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <details className="card mt-6 p-5">
        <summary className="cursor-pointer text-[15px] font-extrabold text-ink">+ Dodatno zaduženje (oprema, takmičenje, ispit...)</summary>
        <form action={addCharge} className="mt-4 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="period" value={period} />
          <select name="student_id" className="input sm:col-span-2" required defaultValue="">
            <option value="">Izaberi učenika</option>
            {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
          </select>
          <input name="amount" type="number" min={1} step="0.01" placeholder="Iznos" className="input" required />
          <select name="currency" className="input" defaultValue="RSD"><option value="RSD">RSD</option><option value="EUR">EUR</option></select>
          <input name="description" placeholder="Opis" className="input" />
          <div className="sm:col-span-4"><button className="btn btn-soft">Dodaj zaduženje</button></div>
        </form>
      </details>

      <details className="card mt-3 p-5">
        <summary className="cursor-pointer text-[15px] font-extrabold text-ink">+ Polugodište ili rate</summary>
        <p className="mt-2 text-[13px] font-semibold text-mut">Ukupan iznos se deli na mesece, počev od meseca {label.toLowerCase()}. Grupe sa ovim načinom naplate podesi na „Polugodište ili rate”, da ne dobijaju i mesečnu članarinu. Pakete časova dodaješ na stranici Paketi. IPS QR važi samo za dinare.</p>
        <form action={createInstallments} className="mt-4 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="period" value={period} />
          <select name="group_id" className="input sm:col-span-2" defaultValue="">
            <option value="">Cela grupa (izaberi)</option>
            {(groupList ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select name="student_id" className="input sm:col-span-2" defaultValue="">
            <option value="">ili jedan učenik</option>
            {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
          </select>
          <input name="total" type="number" min={1} step="0.01" placeholder="Ukupan iznos po učeniku" className="input" required />
          <select name="currency" className="input" defaultValue="RSD"><option value="RSD">RSD</option><option value="EUR">EUR</option></select>
          <input name="count" type="number" min={1} max={12} step="1" placeholder="Broj rata" className="input" required />
          <input name="description" placeholder="Opis, npr. Polugodište" className="input sm:col-span-2" />
          <div className="sm:col-span-4"><button className="btn btn-soft">Napravi rate</button></div>
        </form>
      </details>
    </>
  );
}
