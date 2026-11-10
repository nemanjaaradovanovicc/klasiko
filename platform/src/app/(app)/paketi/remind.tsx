'use client';

import { useState, useTransition } from 'react';
import { waUrl } from '@/lib/phone';
import { logPackageWhatsapp } from './actions';

export function PackageRemindButton({ phone, message, packageId, studentId, sent }: {
  phone: string; message: string; packageId: string; studentId: string; sent: boolean;
}) {
  const [done, setDone] = useState(sent);
  const [, start] = useTransition();
  return (
    <a
      className="btn btn-sm bg-[#1FA855] hover:bg-[#178a45]"
      href={waUrl(phone, message)}
      target="_blank"
      rel="noopener"
      onClick={() => { if (!done) { setDone(true); start(() => { void logPackageWhatsapp(packageId, studentId); }); } }}
    >
      {done ? 'WhatsApp je poslat' : 'Podseti na WhatsApp'}
    </a>
  );
}
