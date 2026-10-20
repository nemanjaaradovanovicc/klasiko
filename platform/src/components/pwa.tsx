'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

// Kartica „Instaliraj Klasiko” (Android: pravi prompt; iPhone: uputstvo). Ne prikazuje se u instaliranoj aplikaciji.
export function InstallCard() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem('klasiko_install_dismissed') === '1'; } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) { setIos(true); setHidden(false); }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setHidden(false); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem('klasiko_install_dismissed', '1'); } catch {} };
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl bg-brand p-4 text-white lg:hidden">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><Download size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold">Instaliraj Klasiko na telefon</div>
        {ios ? (
          <p className="mt-0.5 text-[13px] font-semibold text-white/85">U Safari-ju dodirni <Share size={14} className="inline align-[-2px]" /> „Podeli”, pa „Dodaj na početni ekran”.</p>
        ) : (
          <>
            <p className="mt-0.5 text-[13px] font-semibold text-white/85">Otvaraj ga jednim dodirom, preko celog ekrana.</p>
            <button type="button" className="btn btn-sm btn-coral mt-2" onClick={async () => { await evt?.prompt(); close(); }}>Instaliraj</button>
          </>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Zatvori" className="rounded-full p-1 text-white/80 hover:bg-white/10"><X size={18} /></button>
    </div>
  );
}
