import { getCtx, orgAccess } from '@/lib/auth';
import { LogoutButton } from '@/components/nav';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { QrImage } from '@/components/qr-image';
import { planPrice, planQr } from '@/lib/billing';
import { dateSr, rsd } from '@/lib/format';
import { PLANS, type Invoice, type PlatformSettings } from '@/lib/types';

export const metadata = { title: 'Pretplata' };

export default async function SubscriptionPage() {
  const ctx = await getCtx();
  if (!ctx.org) redirect('/');
  const access = orgAccess(ctx.org);
  if (access.ok) redirect('/');
  const supabase = await createClient();
  const [{ data: invs }, { data: st }] = await Promise.all([
    supabase.from('invoices').select('*').eq('org_id', ctx.org.id).eq('status', 'issued').order('issue_date', { ascending: false }),
    supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle<PlatformSettings>(),
  ]);
  const open = (invs ?? []) as Invoice[];
  const billing = ctx.org.billing === 'lifetime' ? 'monthly' : ctx.org.billing;
  const qr = ctx.isOwner && st && open.length === 0 && ctx.org.status !== 'cancelled' ? planQr(st, ctx.org, ctx.org.plan, billing) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="card w-full max-w-md p-7 text-center">
        <h1 className="text-[26px] font-extrabold tracking-tight text-brand">{access.reason}</h1>
        <p className="mt-2 text-[15px] font-semibold text-ink-2">
          Podaci tvoje škole su sačuvani. Za nastavak rada javi nam se i aktiviraćemo nalog u roku od jednog dana.
        </p>
        {ctx.isOwner && open.map((i) => (
          <Link key={i.id} href={`/uplata/${i.id}`} className="mt-4 flex items-center justify-between rounded-xl bg-coral-soft px-4 py-3 text-[15px] font-bold text-coral-dark">
            <span>Uplata br. {i.number}{i.due_date ? `, rok ${dateSr(i.due_date)}` : ''}</span><span>{rsd(i.total)} →</span>
          </Link>
        ))}
        {qr && st && (
          <div className="mt-5 rounded-2xl bg-soft p-4 text-left">
            <div className="text-[13px] font-extrabold uppercase tracking-wider text-mut">Podaci za uplatu, paket {PLANS[ctx.org.plan].name}</div>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex-1 text-[14px] font-semibold text-ink-2">
                <div>Primalac: <b className="text-ink">{st.issuer_name}</b></div>
                <div>Račun: <b className="text-ink tabular-nums">{st.bank_account}</b></div>
                <div>Iznos: <b className="text-ink">{rsd(planPrice(ctx.org.plan, billing))}</b></div>
              </div>
              <QrImage payload={qr} size={110} />
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <a className="btn" href="https://wa.me/381638219713?text=Zdravo%2C%20%C5%BEelim%20da%20aktiviram%20Klasiko%20za%20%C5%A1kolu" target="_blank" rel="noopener">Piši na WhatsApp</a>
          <a className="btn btn-soft" href="tel:+381638219713">Pozovi +381 63 8219713</a>
        </div>
        <div className="mt-6"><LogoutButton /></div>
      </div>
    </main>
  );
}
