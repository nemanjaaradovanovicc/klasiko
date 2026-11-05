'use client';

import { useActionState } from 'react';
import { requestReset } from './actions';

export function ResetForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.ok) return <div className="rounded-xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok">Ako nalog sa tim emailom postoji, link je poslat. Proveri i spam folder.</div>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn h-12 text-base" disabled={pending}>{pending ? 'Šaljem...' : 'Pošalji link'}</button>
    </form>
  );
}
