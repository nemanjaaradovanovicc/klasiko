'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X } from 'lucide-react';

export function QrButton({ payload, title, amount, purpose }: { payload: string | null; title: string; amount: string; purpose: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (open && payload) QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [open, payload]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-sm btn-soft" title="IPS QR kod za uplatu"><QrCode size={16} /> QR</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 text-left">
              <div>
                <div className="text-[17px] font-extrabold text-ink">{title}</div>
                <div className="text-[13px] font-semibold text-mut">{purpose}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-mut hover:bg-soft" aria-label="Zatvori"><X size={20} /></button>
            </div>
            {payload ? (
              <>
                {src ? <img src={src} alt="IPS QR kod" className="mx-auto mt-4 h-64 w-64" /> : <div className="mx-auto mt-4 h-64 w-64 animate-pulse rounded-xl bg-soft" />}
                <div className="mt-3 text-[22px] font-extrabold text-brand">{amount}</div>
                <p className="mt-2 text-[13px] font-semibold text-mut">Roditelj skenira kod u aplikaciji svoje banke (IPS skeniraj) i podaci se sami popune.</p>
                {src && <a href={src} download={`uplata-${purpose.replace(/\s+/g, '-')}.png`} className="btn btn-sm btn-soft mt-4">Preuzmi sliku</a>}
              </>
            ) : (
              <p className="mt-4 text-[14px] font-semibold text-coral-dark">Za QR kod unesi tekući račun i naziv primaoca u Podešavanjima.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
