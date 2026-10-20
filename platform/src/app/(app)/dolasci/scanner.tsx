'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';
import { checkinByCode, checkinManual, type CheckinResult } from './actions';

export function Scanner({ students }: { students: { id: string; name: string; state: 'in' | 'out' | null }[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<CheckinResult | null>(null);
  const [picked, setPicked] = useState('');
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const last = useRef<{ code: string; t: number }>({ code: '', t: 0 });

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, raf = 0, stop = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      stream = s;
      if (!video.current) return;
      video.current.srcObject = s;
      video.current.setAttribute('playsinline', 'true');
      video.current.play();
      const tick = () => {
        if (stop) return;
        const v = video.current, c = canvas.current;
        if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
          c.width = v.videoWidth; c.height = v.videoHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data && (code.data !== last.current.code || Date.now() - last.current.t > 4000)) {
              last.current = { code: code.data, t: Date.now() };
              navigator.vibrate?.(80);
              start(async () => setRes(await checkinByCode(code.data, picked || null)));
            }
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => { setErr('Kamera nije dostupna. Dozvoli pristup kameri u podešavanjima browsera.'); setOn(false); });
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, picked]);

  const filtered = q ? students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        {on ? (
          <div className="relative bg-ink">
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted />
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80" />
            <canvas ref={canvas} className="hidden" />
          </div>
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-soft p-6 text-center">
            <div>
              <Camera size={40} className="mx-auto text-brand" />
              <p className="mt-2 text-[14px] font-semibold text-ink-2">Uključi kameru i prinesi QR karticu deteta. Prvo skeniranje beleži dolazak, drugo odlazak.</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button type="button" className={`btn ${on ? 'btn-soft' : ''}`} onClick={() => { setErr(''); setOn((x) => !x); }}>
            {on ? <><CameraOff size={16} /> Isključi kameru</> : <><Camera size={16} /> Uključi kameru</>}
          </button>
          <input className="input h-11 min-w-[160px] flex-1" placeholder="Ko preuzima dete (za odlazak)" value={picked} onChange={(e) => setPicked(e.target.value)} />
        </div>
        {err && <div className="mx-3 mb-3 rounded-xl bg-coral-soft px-3 py-2 text-[13px] font-bold text-coral-dark">{err}</div>}
      </div>

      {res && (
        <div className={`rounded-2xl p-4 text-center ${res.ok ? (res.kind === 'in' ? 'bg-ok text-white' : 'bg-brand text-white') : 'bg-coral-soft text-coral-dark'}`} role="status">
          {res.ok ? (
            <>
              <div className="text-[22px] font-extrabold">{res.name}</div>
              <div className="text-[15px] font-bold opacity-90">{res.kind === 'in' ? 'Dolazak upisan' : 'Odlazak upisan'} · {new Date(res.at!).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Belgrade' })}</div>
            </>
          ) : <div className="font-bold">{res.error}</div>}
        </div>
      )}

      <div className="card p-4">
        <span className="label">Bez kartice: pronađi po imenu</span>
        <input className="input" placeholder="Ime ili prezime" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {filtered.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate font-bold text-ink">{s.name}</span>
              <span className="flex shrink-0 gap-1.5">
                <button type="button" disabled={pending} className="btn btn-sm bg-ok hover:bg-[#186a42]" onClick={() => start(async () => { setRes(await checkinManual(s.id, 'in')); setQ(''); })}>Došao</button>
                <button type="button" disabled={pending} className="btn btn-sm" onClick={() => start(async () => { setRes(await checkinManual(s.id, 'out', picked || null)); setQ(''); })}>Otišao</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
