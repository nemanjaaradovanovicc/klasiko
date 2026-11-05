'use client';

import { useActionState, useState, useTransition } from 'react';
import { startEnroll, verifyCode, type EnrollResult } from './actions';

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState(verifyCode, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="factor_id" value={factorId} />
      <label className="block">
        <span className="label">Šestocifreni kod</span>
        <input className="input text-center text-[20px] tracking-[0.3em]" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn h-12 text-base" disabled={pending}>{pending ? 'Proveravam...' : 'Potvrdi'}</button>
    </form>
  );
}

export function MfaFlow({ factorId }: { factorId: string | null }) {
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [pending, start] = useTransition();
  if (factorId) return <CodeForm factorId={factorId} />;
  if (enroll?.factorId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[14px] font-semibold text-ink-2">Skeniraj kod u aplikaciji za autentifikaciju (Google Authenticator, Authy, 1Password), pa upiši kod koji ona prikaže.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qr} alt="QR kod za dvostepenu prijavu" width={200} height={200} className="mx-auto rounded-xl bg-white p-2 ring-1 ring-line" />
        <p className="break-all text-center text-[12px] font-bold text-mut">Ručni unos: {enroll.secret}</p>
        <CodeForm factorId={enroll.factorId} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-ink-2">Admin nalog vidi podatke svih škola, pa uz lozinku traži i kod sa telefona. Podešavanje traje minut.</p>
      {enroll?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{enroll.error}</div>}
      <button className="btn h-12 text-base" disabled={pending} onClick={() => start(async () => setEnroll(await startEnroll()))}>{pending ? 'Pripremam...' : 'Podesi dvostepenu prijavu'}</button>
    </div>
  );
}
