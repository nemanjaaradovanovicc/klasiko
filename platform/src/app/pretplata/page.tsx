import { getCtx, orgAccess } from '@/lib/auth';
import { LogoutButton } from '@/components/nav';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Pretplata' };

export default async function SubscriptionPage() {
  const ctx = await getCtx();
  if (!ctx.org) redirect('/');
  const access = orgAccess(ctx.org);
  if (access.ok) redirect('/');
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="card w-full max-w-md p-7 text-center">
        <h1 className="text-[26px] font-extrabold tracking-tight text-brand">{access.reason}</h1>
        <p className="mt-2 text-[15px] font-semibold text-ink-2">
          Podaci tvoje škole su sačuvani. Za nastavak rada javi nam se i aktiviraćemo nalog u roku od jednog dana.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a className="btn" href="https://wa.me/381638219713?text=Zdravo%2C%20%C5%BEelim%20da%20aktiviram%20Klasiko%20za%20%C5%A1kolu" target="_blank" rel="noopener">Piši na WhatsApp</a>
          <a className="btn btn-soft" href="tel:+381638219713">Pozovi +381 63 8219713</a>
        </div>
        <div className="mt-6"><LogoutButton /></div>
      </div>
    </main>
  );
}
