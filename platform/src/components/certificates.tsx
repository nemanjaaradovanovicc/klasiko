'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';

const TYPES = {
  diploma: { title: 'Diploma', text: 'za uspešno završen program' },
  nivo: { title: 'Sertifikat', text: 'za uspešno završen nivo B1' },
  pojas: { title: 'Sertifikat', text: 'za uspešno položen ispit za žuti pojas' },
  zahvalnica: { title: 'Zahvalnica', text: 'za trud, redovnost i lep primer drugima' },
} as const;

// Diplome i sertifikati: pregled uživo i štampa / PDF (A4 položeno, jedna strana po učeniku).
export function Certificates({ names, school, signer, city, defaultText }: { names: string[]; school: string; signer: string; city: string; defaultText?: string }) {
  const [type, setType] = useState<keyof typeof TYPES>('diploma');
  const [title, setTitle] = useState<string>(TYPES.diploma.title);
  const [text, setText] = useState<string>(defaultText ?? TYPES.diploma.text);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));
  const [sign, setSign] = useState(signer);
  const [color, setColor] = useState('#5B2A86');

  return (
    <div>
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } body { background: #fff !important; } .cert { break-after: page; } }`}</style>
      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5 print:hidden">
        <label className="block"><span className="label">Vrsta</span>
          <select className="input" value={type} onChange={(e) => { const t = e.target.value as keyof typeof TYPES; setType(t); setTitle(TYPES[t].title); setText(TYPES[t].text); }}>
            <option value="diploma">Diploma</option><option value="nivo">Sertifikat o nivou</option><option value="pojas">Sertifikat za pojas</option><option value="zahvalnica">Zahvalnica</option>
          </select>
        </label>
        <label className="block"><span className="label">Naslov</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Tekst ispod imena</span><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="block"><span className="label">Datum</span><input className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block"><span className="label">Potpis</span><input className="input" value={sign} onChange={(e) => setSign(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {['#5B2A86', '#FF6B5E', '#1F7A4D', '#2F7DBF', '#B08A2E'].map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label="Boja" className={`h-9 w-9 shrink-0 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-ink' : ''}`} style={{ background: c }} />
          ))}
          <button type="button" className="btn w-full sm:ml-auto sm:w-auto" onClick={() => window.print()}><Printer size={16} /> Štampaj / PDF ({names.length})</button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 print:gap-0">
        {names.map((n, i) => (
          <div key={i} className="cert w-full max-w-[880px] overflow-hidden print:max-w-none">
            <div className="relative aspect-[297/210] w-full bg-white shadow-lg ring-1 ring-line print:aspect-auto print:h-[210mm] print:w-[297mm] print:shadow-none print:ring-0">
              <div className="absolute inset-[3.2%] rounded-[2px] border-[3px]" style={{ borderColor: color }} />
              <div className="absolute inset-[4.6%] rounded-[2px] border" style={{ borderColor: color, opacity: 0.45 }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-[12%] text-center">
                <div className="text-[clamp(10px,1.6vw,15px)] font-extrabold uppercase tracking-[0.3em] text-mut print:text-[14px]">{school}</div>
                <div className="mt-[3%] text-[clamp(30px,7vw,68px)] font-extrabold leading-none tracking-tight print:text-[64px]" style={{ color }}>{title}</div>
                <div className="mt-[3%] text-[clamp(10px,1.5vw,14px)] font-bold text-mut print:text-[14px]">dodeljuje se</div>
                <div className="mt-[1.5%] w-full border-b-2 pb-[1%] text-[clamp(20px,4.4vw,44px)] font-extrabold text-ink print:text-[42px]" style={{ borderColor: color }}>{n}</div>
                <div className="mt-[2.5%] text-[clamp(12px,2vw,20px)] font-semibold text-ink-2 print:text-[19px]">{text}</div>
                <div className="mt-[7%] flex w-full items-end justify-between text-[clamp(10px,1.4vw,14px)] font-semibold text-ink-2 print:text-[13px]">
                  <div className="text-left">{city ? `${city}, ` : ''}{date}</div>
                  <div className="min-w-[30%] border-t border-ink/40 pt-1 text-center">{sign}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
