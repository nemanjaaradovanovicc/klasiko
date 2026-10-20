'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrImage({ payload, size = 180, download }: { payload: string; size?: number; download?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(payload, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [payload, size]);
  return (
    <div className="flex flex-col items-center gap-2">
      {src ? <img src={src} alt="IPS QR kod za uplatu" width={size} height={size} /> : <div className="animate-pulse rounded-xl bg-soft" style={{ width: size, height: size }} />}
      {download && src && <a href={src} download={download} className="text-[12px] font-bold text-brand print:hidden">Preuzmi QR</a>}
    </div>
  );
}
