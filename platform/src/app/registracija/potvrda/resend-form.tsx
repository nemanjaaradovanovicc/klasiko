'use client';

import { useActionState } from 'react';
import { resendConfirmation } from '../actions';

export function ResendForm() {
  const [state, action, pending] = useActionState(resendConfirmation, undefined);
  if (state?.ok) return <div className="rounded-xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok">Ako ta adresa čeka potvrdu, novi link je na putu. Proveri i neželjenu poštu.</div>;
  return (
    <form action={action} className="flex flex-col gap-3 text-left">
      <label className="block">
        <span className="label">Email sa kojim si se registrovao/la</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn btn-soft h-11" disabled={pending}>{pending ? 'Šaljem...' : 'Pošalji novi link'}</button>
    </form>
  );
}
