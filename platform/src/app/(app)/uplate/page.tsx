import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Flash, Stat, Badge, Empty } from '@/components/ui';
import { currentPeriod, periodLabel, shiftPeriod, rsd, fullName, dateSr, todayISO } from '@/lib/format';
import { ipsPayload } from '@/lib/ips';
import { QrButton } from './qr';
import { generateCharges, recordPayment, deletePayment, addCharge, updateCharge } from './actions';

export const metadata = { title: 'Uplate' };

const METHOD: Record<string, string> = { cash: 'Gotovina', bank: 'Račun', card: 'Kartica', other: 'Drugo' };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mesec?: string; prikaz?: string; ok?: string; err?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const period = sp.mesec && /^\d{4}-\d{2}$/.test(sp.mesec) ? sp.mesec : currentPeriod();
  const filter = sp.prikaz ?? 'sve';
  const supabase = await createClient();
  const [{ data: charges }, { data: students }] = await Promise.all([
    supabase
      .from('charges')
      .select('id, amount, due_date, description, student_id, students(first_name, last_name, parent_name, parent_phone, phone), groups(name), payments(id, amount, paid_at, method)')
      .eq('org_id', ctx.org.id)
      .eq('period', period),
    supabase.from('students').select('id, first_name, last_name').eq('org_id', ctx.org.id).eq('active', true).order('last_name'),
  ]);
  type C = { id: string; amount: number; due_date: string | null; description: string | null; student_id: string; students: { first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; phone: string | null } | null; groups: { name: string } | null; payments: { id: string; amount: number; paid_at: string; method: string }[] };
  const all = ((charges ?? []) as unknown as C[]).filter((c) => c.students).sort((a, b) => fullName(a.students!).localeCompare(fullName(b.students!), 'sr'));
  const rows = all.map((c) => {
    const paid = c.payments.reduce((a, p) => a + Number(p.amount), 0);
    return { ...c, paid, remaining: Math.max(0, Number(c.amount) - paid), done: paid >= Number(c.amount) };
  });
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
        <Stat label="Očekivano" value={rsd(expected)} hint={`${rows.length} zaduženja`} />
        <Stat label="Naplaćeno" value={rsd(collected)} tone="ok" hint={expected ? `${Math.round((collected / expected) * 100)}%` : undefined} />
        <Stat label="Preostalo" value={rsd(expected - collected)} tone={expected - collected > 0 ? 'coral' : 'default'} />
        <Stat label="Kasni sa uplatom" value={late.length} tone={late.length ? 'coral' : 'default'} hint={`rok ${ctx.org.fee_due_day}. u mesecu`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={generateCharges}>
          <input type="hidden" name="period" value={period} />
          <button className="btn">Napravi zaduženja za {label.toLowerCase()}</button>
        </form>
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
            const payload = ctx.org.bank_account && ctx.org.payee_name && r.remaining > 0 ? ipsPayload({ account: ctx.org.bank_account, payee: ctx.org.payee_name, amount: r.remaining, purpose, payer: s.parent_name ?? fullName(s) }) : null;
            const reminder = `Dobar dan! Podsećamo da članarina za ${label.toLowerCase()} za ${fullName(s)} iznosi ${rsd(r.remaining)}. Ako ste već uplatili, zanemarite poruku. Hvala! ${ctx.org.name}`;
            const isLate = !r.done && r.due_date && r.due_date < today;
            return (
              <div key={r.id} className="card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/ucenici/${r.student_id}`} className="font-extrabold text-ink hover:text-brand">{fullName(s)}</Link>
                    <div className="truncate text-[13px] font-semibold text-mut">{r.groups?.name ?? r.description}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                    <div className="text-[16px] font-extrabold tabular-nums">{rsd(r.amount)}</div>
                    {r.done ? <Badge tone="ok">Plaćeno</Badge> : r.paid > 0 ? <Badge>Uplaćeno {rsd(r.paid)}</Badge> : <Badge tone={isLate ? 'coral' : 'gray'}>{isLate ? 'Kasni' : 'Čeka uplatu'}</Badge>}
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
                    <QrButton payload={payload} title={fullName(s)} amount={rsd(r.remaining)} purpose={`Članarina ${label}`} />
                    {phone && (
                      <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener" href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '381')}?text=${encodeURIComponent(reminder)}`}>Podseti na WhatsApp</a>
                    )}
                  </div>
                )}
                {(r.payments.length > 0 || !r.done) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] font-bold text-mut">Detalji</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {r.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-2">
                          <span>{dateSr(p.paid_at)} · {METHOD[p.method]} · {rsd(p.amount)}</span>
                          <form action={deletePayment}>
                            <input type="hidden" name="period" value={period} />
                            <input type="hidden" name="id" value={p.id} />
                            <button className="text-coral-dark hover:underline">obriši</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={updateCharge} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="id" value={r.id} />
                      <input name="amount" type="number" min={0} step="1" defaultValue={r.amount} className="input h-8 w-28 text-sm" />
                      <button className="btn btn-sm btn-soft h-8">Izmeni iznos</button>
                      <button name="delete" value="1" className="btn btn-sm btn-ghost h-8 text-coral-dark">Obriši zaduženje</button>
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
            {(students ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
          </select>
          <input name="amount" type="number" min={1} step="1" placeholder="Iznos" className="input" required />
          <input name="description" placeholder="Opis" className="input" />
          <div className="sm:col-span-4"><button className="btn btn-soft">Dodaj zaduženje</button></div>
        </form>
      </details>
    </>
  );
}
