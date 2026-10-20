import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PaymentDoc } from '@/components/payment-doc';
import { PrintButton } from '@/components/print-button';
import type { Invoice, PlatformSettings } from '@/lib/types';

export const metadata = { title: 'Uplata pretplate' };

// Vlasnik škole vidi svoju instrukciju za uplatu i kad mu je pretplata istekla.
export default async function SchoolInvoice({ params }: { params: Promise<{ id: string }> }) {
  await getCtx();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inv }, { data: st }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).maybeSingle<Invoice>(),
    supabase.from('platform_settings').select('*').eq('id', 1).single<PlatformSettings>(),
  ]);
  if (!inv || !st) notFound();
  return (
    <main className="min-h-dvh bg-soft px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/podesavanja#pretplata" className="text-[14px] font-bold text-mut hover:text-brand">← Nazad u aplikaciju</Link>
        <PrintButton />
      </div>
      <PaymentDoc inv={inv} st={st} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-[13px] font-semibold text-mut print:hidden">
        Posle uplate pristup se produžava u toku jednog radnog dana. Pitanja: <a className="font-extrabold text-brand" href="https://wa.me/381638219713" target="_blank" rel="noopener">WhatsApp</a> ili <a className="font-extrabold text-brand" href="tel:+381638219713">+381 63 8219713</a>.
      </p>
    </main>
  );
}
