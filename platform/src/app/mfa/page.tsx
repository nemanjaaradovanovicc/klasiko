import { redirect } from 'next/navigation';
import { getCtx, mfaMissing } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/nav';
import { MfaFlow } from './form';

export const metadata = { title: 'Dvostepena prijava' };

export default async function MfaPage() {
  const ctx = await getCtx();
  if (!mfaMissing(ctx)) redirect('/');
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp?.find((f) => f.status === 'verified');
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-[26px] font-extrabold tracking-tight text-brand">Dvostepena prijava</h1>
        <div className="card p-6"><MfaFlow factorId={verified?.id ?? null} /></div>
        <div className="mt-4"><LogoutButton /></div>
      </div>
    </main>
  );
}
