import { getCtx } from '@/lib/auth';
import { PasswordForm } from './form';

export const metadata = { title: 'Promena lozinke' };

export default async function PasswordPage() {
  const ctx = await getCtx();
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-[26px] font-extrabold tracking-tight text-brand">
          {ctx.profile.must_change_password ? 'Postavi svoju lozinku' : 'Promena lozinke'}
        </h1>
        <p className="mb-6 mt-1 text-center text-[15px] font-semibold text-mut">
          {ctx.profile.must_change_password ? 'Dobio/la si privremenu lozinku. Pre početka postavi svoju, od bar 8 znakova.' : ctx.email}
        </p>
        <div className="card p-6">
          <PasswordForm />
        </div>
      </div>
    </main>
  );
}
