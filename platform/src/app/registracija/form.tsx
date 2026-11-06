'use client';

import { useActionState } from 'react';
import { register } from './actions';
import { KINDS } from '@/lib/types';

export function RegisterForm({ plan }: { plan: string }) {
  const [state, action, pending] = useActionState(register, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="plan" value={plan} />
      <label className="block"><span className="label">Naziv škole</span><input className="input" name="school" required autoFocus /></label>
      <label className="block"><span className="label">Vrsta</span>
        <select className="input" name="kind" defaultValue="skola_jezika">{Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="block"><span className="label">Tvoje ime i prezime</span><input className="input" name="name" autoComplete="name" required /></label>
      <label className="block"><span className="label">Telefon (opciono)</span><input className="input" name="phone" type="tel" autoComplete="tel" /></label>
      <label className="block"><span className="label">Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
      <label className="block"><span className="label">Lozinka (bar 8 znakova)</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-[13px] font-semibold text-ink-2">
        <input type="checkbox" name="terms" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#5B2A86]" />
        <span>Prihvatam <a className="font-extrabold text-brand" href="https://www.klasiko.rs/privatnost" target="_blank" rel="noopener">politiku privatnosti</a>. Škola je odgovorna za podatke koje unese, a Klasiko ih obrađuje samo radi pružanja usluge.</span>
      </label>
      {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{state.error}</div>}
      <button className="btn h-12 text-base" disabled={pending}>{pending ? 'Otvaram školu...' : 'Počni besplatno'}</button>
    </form>
  );
}
