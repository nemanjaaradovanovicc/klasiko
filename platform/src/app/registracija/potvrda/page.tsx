import Link from 'next/link';
import { ResendForm } from './resend-form';

export const metadata = { title: 'Potvrdi email' };

export default function CheckEmailPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="card w-full max-w-md p-7 text-center">
        <h1 className="text-[26px] font-extrabold tracking-tight text-brand">Proveri email</h1>
        <p className="mt-2 text-[15px] font-semibold text-ink-2">Poslali smo ti link za potvrdu. Otvori ga i škola je spremna. Probni period je već počeo.</p>
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-3 text-[14px] font-bold text-mut">Mejl nije stigao? Proveri neželjenu poštu ili zatraži novi link.</p>
          <ResendForm />
        </div>
        <p className="mt-5 text-[14px] font-bold"><Link className="text-brand" href="/login">Nazad na prijavu</Link></p>
      </div>
    </main>
  );
}
