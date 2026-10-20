'use client';

import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Lozinka</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn h-12 text-base" disabled={pending}>
        {pending ? 'Prijavljujem...' : 'Prijavi se'}
      </button>
    </form>
  );
}
