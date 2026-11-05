'use client';

import { useState } from 'react';

// Dugme koje traži potvrdu pre slanja forme.
export function ConfirmButton({ message, className, children, name, value, disabled }: { message: string; className?: string; children: React.ReactNode; name?: string; value?: string; disabled?: boolean }) {
  return (
    <button className={className} name={name} value={value} disabled={disabled} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

// Za nepovratno brisanje: dugme se otključava tek kad se upiše OBRIŠI. Server proverava isto polje.
export function TypedConfirm({ label, warning, className = 'btn btn-sm btn-danger' }: { label: string; warning: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-coral-soft p-3">
      <p className="text-[13px] font-bold text-coral-dark">{warning} Upiši OBRIŠI za potvrdu.</p>
      <div className="flex flex-wrap gap-2">
        <input name="confirm" className="input h-9 w-32 text-sm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="Potvrda brisanja" />
        <button className="btn btn-sm btn-danger" disabled={text !== 'OBRIŠI'}>{label}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setOpen(false); setText(''); }}>Odustani</button>
      </div>
    </div>
  );
}
