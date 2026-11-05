'use client';

import { useState, useTransition } from 'react';
import { emailAllDebtors, logWhatsappReminder } from './actions';
import { waUrl } from '@/lib/phone';

export type QueueItem = { key: string; names: string; phone: string | null; message: string; studentIds: string[] };

// Pregledači ne dozvoljavaju otvaranje više prozora odjednom, pa se poruke šalju redom, jedna po klik.
export function SendQueue({ items, emailCount, emailOn }: { items: QueueItem[]; emailCount: number; emailOn: boolean }) {
  const withPhone = items.filter((i) => i.phone);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const current = withPhone[index];
  return (
    <div className="flex flex-col gap-3">
      {withPhone.length > 0 && (current ? (
        <div className="flex flex-wrap items-center gap-3">
          <a
            className="btn bg-[#1FA855] hover:bg-[#178a45]"
            href={waUrl(current.phone, current.message)}
            target="_blank"
            rel="noopener"
            onClick={() => { start(async () => { await logWhatsappReminder(current.studentIds); }); setIndex((i) => i + 1); }}
          >
            WhatsApp {index + 1}/{withPhone.length}: {current.names}
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => setIndex((i) => i + 1)}>Preskoči</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-[14px] font-bold text-ok">Prošao/la si ceo spisak. <button type="button" className="btn btn-sm btn-soft" onClick={() => setIndex(0)}>Ispočetka</button></div>
      ))}
      {emailOn && emailCount > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-soft" disabled={pending} onClick={() => { if (window.confirm(`Poslati email podsetnik na ${emailCount} adresa?`)) start(async () => { try { const r = await emailAllDebtors(); setNote(r.error ?? `Poslato: ${r.sent}.${r.failed ? ` Nije uspelo: ${r.failed}.` : ''}`); } catch { setNote('Nema veze sa serverom.'); } }); }}>
            {pending ? 'Šaljem...' : `Pošalji email svima (${emailCount})`}
          </button>
          {note && <span className="text-[13px] font-bold text-mut">{note}</span>}
        </div>
      )}
    </div>
  );
}
