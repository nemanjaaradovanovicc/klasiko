'use client';

import { useEffect } from 'react';

// Greška unutar aplikacije: meni ostaje, a korisnik može da pokuša ponovo.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-[24px] font-extrabold tracking-tight text-brand">Nešto nije u redu</h1>
      <p className="mt-2 text-[15px] font-semibold text-ink-2">Stranica trenutno ne može da se prikaže. Proveri internet vezu i pokušaj ponovo. Već sačuvani podaci su bezbedni.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={reset}>Pokušaj ponovo</button>
        <a className="btn btn-soft" href="/">Početna</a>
      </div>
      {error.digest && <p className="mt-4 text-[12px] font-semibold text-mut">Oznaka greške za podršku: {error.digest}</p>}
    </div>
  );
}
