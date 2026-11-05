'use client';

import { useState, useTransition } from 'react';
import { MessageCircle, Mail, Copy, Phone } from 'lucide-react';
import { markInvoiceSent } from '@/app/(app)/admin/billing-actions';
import { intlPhone } from '@/lib/phone';

export function SendButtons({ invoiceId, phone, email, message, subject, sentAt, compact = false }: {
  invoiceId: string; phone?: string | null; email?: string | null; message: string; subject: string; sentAt?: string | null; compact?: boolean;
}) {
  const [, start] = useTransition();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(!!sentAt);
  const mark = () => { if (!sent) { setSent(true); start(() => markInvoiceSent(invoiceId)); } };
  const copy = async (msg: string) => { try { await navigator.clipboard.writeText(message); setNote(msg); setTimeout(() => setNote(''), 3500); } catch { setNote('Kopiranje nije uspelo'); } };
  const num = intlPhone(phone);
  const cls = `btn btn-sm ${compact ? 'px-3' : ''}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={`${cls} bg-[#1FA855] hover:bg-[#178a45]`} href={`https://wa.me/${num}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener" onClick={mark}>
        <MessageCircle size={16} /> WhatsApp
      </a>
      <a className={`${cls} bg-[#7360F2] hover:bg-[#5e4bd6]`} href={num ? `viber://chat?number=%2B${num}` : 'viber://forward?text=' + encodeURIComponent(message)} onClick={() => { copy('Poruka je kopirana, nalepi je u Viber'); mark(); }}>
        <Phone size={16} /> Viber
      </a>
      {email && (
        <a className={`${cls} btn-soft`} href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`} onClick={mark}>
          <Mail size={16} /> Email
        </a>
      )}
      <button type="button" className={`${cls} btn-ghost`} onClick={() => { copy('Poruka je kopirana'); }}>
        <Copy size={16} /> Kopiraj
      </button>
      {sent && <span className="text-[12px] font-extrabold text-ok">Poslato ✓</span>}
      {note && <span className="text-[12px] font-bold text-mut">{note}</span>}
    </div>
  );
}
