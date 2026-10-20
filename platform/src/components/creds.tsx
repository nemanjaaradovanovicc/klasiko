'use client';

import { useActionState, useState } from 'react';
import type { Creds } from '@/lib/users';

export function CredsBox({ creds }: { creds: Creds }) {
  const [copied, setCopied] = useState(false);
  if (!creds.password) return null;
  const text = `Klasiko prijava\nAdresa: https://app.klasiko.rs\nEmail: ${creds.email}\nPrivremena lozinka: ${creds.password}\n\nPosle prve prijave postavi svoju lozinku.`;
  return (
    <div className="rounded-2xl border-2 border-dashed border-ok/40 bg-ok-soft p-4">
      <div className="text-[15px] font-extrabold text-ok">Nalog je spreman{creds.name ? ` za ${creds.name}` : ''}</div>
      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-[14px] font-semibold text-ink">{text}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); }}>
          {copied ? 'Kopirano' : 'Kopiraj podatke'}
        </button>
        <a className="btn btn-sm btn-soft" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Pošalji na WhatsApp</a>
      </div>
      <p className="mt-2 text-[12px] font-semibold text-mut">Lozinka se prikazuje samo sada. Ako je izgubiš, resetuj je.</p>
    </div>
  );
}

export function CredsForm({ action, children, submit, className = '' }: {
  action: (state: Creds | undefined, fd: FormData) => Promise<Creds>;
  children: React.ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className={className}>
        {children}
        {state?.error && <div className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark sm:col-span-2">{state.error}</div>}
        <div className="sm:col-span-2">
          <button className="btn" disabled={pending}>{pending ? 'Radim...' : submit}</button>
        </div>
      </form>
      {state && <CredsBox creds={state} />}
    </div>
  );
}

export function ResetButton({ action, userId, label = 'Resetuj lozinku' }: { action: (state: Creds | undefined, fd: FormData) => Promise<Creds>; userId: string; label?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <div>
      <form action={formAction} onSubmit={(e) => { if (!confirm('Napraviti novu privremenu lozinku?')) e.preventDefault(); }}>
        <input type="hidden" name="user_id" value={userId} />
        <button className="btn btn-sm btn-soft" disabled={pending}>{pending ? '...' : label}</button>
      </form>
      {state?.error && <div className="mt-2 text-sm font-bold text-coral-dark">{state.error}</div>}
      {state?.password && <div className="mt-3"><CredsBox creds={state} /></div>}
    </div>
  );
}
