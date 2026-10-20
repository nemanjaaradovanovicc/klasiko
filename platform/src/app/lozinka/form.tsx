'use client';

import { useActionState } from 'react';
import { changePassword } from './actions';

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <span className="label">Nova lozinka</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </label>
      <label className="block">
        <span className="label">Ponovi lozinku</span>
        <input className="input" name="password2" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn h-12 text-base" disabled={pending}>
        {pending ? 'Čuvam...' : 'Sačuvaj lozinku'}
      </button>
    </form>
  );
}
