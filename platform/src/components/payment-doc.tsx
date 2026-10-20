import { QrImage } from '@/components/qr-image';
import { invoiceQr } from '@/lib/billing';
import { dateSr, rsd } from '@/lib/format';
import { INVOICE_STATUS, type Invoice, type PlatformSettings } from '@/lib/types';

// Instrukcija za uplatu pretplate (nije faktura). Pogodna za štampu i PDF.
export function PaymentDoc({ inv, st }: { inv: Invoice; st: PlatformSettings }) {
  const qr = inv.status !== 'cancelled' ? invoiceQr(st, inv) : null;
  const payee = [st.issuer_name, st.issuer_address, st.issuer_city].filter(Boolean).join(', ');
  return (
    <article className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-line sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="text-[13px] font-extrabold uppercase tracking-wider text-mut">Instrukcija za uplatu</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-brand">Br. {inv.number}</h1>
          <div className="mt-1 text-[14px] font-semibold text-ink-2">Datum: {dateSr(inv.issue_date)} · Mesto: {inv.place}</div>
          {inv.due_date && <div className="text-[14px] font-semibold text-ink-2">Rok za uplatu: <b>{dateSr(inv.due_date)}</b></div>}
        </div>
        <div className="text-right">
          <img src="/logo.png" alt="Klasiko" width={56} height={56} className="ml-auto" />
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-[12px] font-extrabold ${inv.status === 'paid' ? 'bg-ok-soft text-ok' : inv.status === 'cancelled' ? 'bg-[#EEEAF2] text-[#6b6375]' : 'bg-coral-soft text-coral-dark'}`}>{INVOICE_STATUS[inv.status]}{inv.paid_at ? ` ${dateSr(inv.paid_at)}` : ''}</span>
        </div>
      </header>

      <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-wider text-mut">Primalac uplate</div>
          <div className="mt-1 text-[16px] font-extrabold text-ink">{st.issuer_name}</div>
          <div className="text-[14px] font-semibold text-ink-2">{[st.issuer_address, st.issuer_city].filter(Boolean).join(', ')}</div>
          {st.phone && <div className="text-[14px] font-semibold text-ink-2">{st.phone}</div>}
          {st.email && <div className="text-[14px] font-semibold text-ink-2">{st.email}</div>}
        </div>
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-wider text-mut">Uplatilac</div>
          <div className="mt-1 text-[16px] font-extrabold text-ink">{inv.buyer?.name}</div>
          <div className="text-[14px] font-semibold text-ink-2">{[inv.buyer?.address, inv.buyer?.city].filter(Boolean).join(', ')}</div>
          {inv.buyer?.email && <div className="text-[14px] font-semibold text-ink-2">{inv.buyer.email}</div>}
        </div>
      </section>

      <section className="py-6">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-left text-[12px] font-extrabold uppercase tracking-wider text-mut">
              <th className="pb-2">Opis</th><th className="hidden pb-2 text-right sm:table-cell print:table-cell">Kol.</th><th className="hidden pb-2 text-right sm:table-cell print:table-cell">Cena</th><th className="pb-2 text-right">Iznos</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-3 pr-3 font-semibold text-ink">{it.description}</td>
                <td className="hidden py-3 text-right tabular-nums sm:table-cell print:table-cell">{it.qty}</td>
                <td className="hidden py-3 text-right tabular-nums sm:table-cell print:table-cell">{rsd(it.price)}</td>
                <td className="py-3 text-right font-bold tabular-nums">{rsd(it.qty * it.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <td colSpan={3} className="hidden pt-3 text-right text-[15px] font-extrabold sm:table-cell print:table-cell">Za uplatu</td><td className="pt-3 text-[15px] font-extrabold sm:hidden print:hidden">Za uplatu</td>
              <td className="pt-3 text-right text-[22px] font-extrabold tabular-nums text-brand">{rsd(inv.total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="grid items-center gap-6 rounded-2xl bg-soft p-5 sm:grid-cols-[1fr_auto] print:bg-white print:ring-1 print:ring-line">
        <dl className="grid gap-1.5 text-[14px]">
          <div><dt className="inline font-bold text-mut">Primalac: </dt><dd className="inline font-extrabold text-ink">{payee}</dd></div>
          <div><dt className="inline font-bold text-mut">Račun primaoca: </dt><dd className="inline font-extrabold text-ink tabular-nums">{st.bank_account}{st.bank_name ? ` (${st.bank_name})` : ''}</dd></div>
          <div><dt className="inline font-bold text-mut">Iznos: </dt><dd className="inline font-extrabold text-ink">{rsd(inv.total)}</dd></div>
          <div><dt className="inline font-bold text-mut">Svrha uplate: </dt><dd className="inline font-extrabold text-ink">Klasiko uplata {inv.number}</dd></div>
          <div><dt className="inline font-bold text-mut">Šifra plaćanja: </dt><dd className="inline font-extrabold text-ink">289</dd></div>
        </dl>
        {qr && (
          <div className="text-center">
            <QrImage payload={qr} size={150} download={`klasiko-uplata-${inv.number}.png`} />
            <div className="mt-1 text-[11px] font-bold text-mut">Skeniraj u aplikaciji banke</div>
          </div>
        )}
      </section>

      {inv.note && <p className="mt-5 text-[14px] font-semibold text-ink-2">{inv.note}</p>}
      <p className="mt-6 text-[12px] font-semibold text-mut">{st.invoice_note || 'Instrukcija za uplatu. Ovo nije faktura.'}</p>
    </article>
  );
}
