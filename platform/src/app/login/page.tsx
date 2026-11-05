import Image from 'next/image';
import Link from 'next/link';
import { LoginForm } from './form';
import { emailEnabled } from '@/lib/email';

export const metadata = { title: 'Prijava' };

const ERRORS: Record<string, string> = {
  nalog: 'Nalog je deaktiviran. Javi se administratoru škole.',
  skola: 'Nalog nije povezan ni sa jednom školom. Javi se podršci.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ greska?: string; next?: string; ok?: string }> }) {
  const { greska, next, ok } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Klasiko" width={72} height={72} priority />
          <h1 className="mt-3 text-[28px] font-extrabold tracking-tight text-brand">Prijava u Klasiko</h1>
          <p className="mt-1 text-[15px] font-semibold text-mut">Učenici, raspored i članarine na jednom mestu.</p>
        </div>
        <div className="card p-6">
          {greska && ERRORS[greska] && <div className="mb-4 rounded-xl bg-coral-soft px-4 py-3 text-sm font-bold text-coral-dark">{ERRORS[greska]}</div>}
          {ok === 'lozinka' && <div className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok">Lozinka je promenjena. Prijavi se.</div>}
          <LoginForm next={next} />
        </div>
        <div className="mt-5 flex flex-col gap-2 text-center text-[14px] font-bold">
          {emailEnabled() ? (
            <Link className="text-brand" href="/zaboravljena-lozinka">Zaboravio/la si lozinku?</Link>
          ) : (
            <p className="text-[13px] font-semibold text-mut">
              Zaboravio/la si lozinku? Javi se vlasniku škole ili podršci na{' '}
              <a className="font-extrabold text-brand" href="https://wa.me/381638219713" target="_blank" rel="noopener">WhatsApp</a>.
            </p>
          )}
          <Link className="text-mut hover:text-brand" href="/registracija">Nemaš nalog? Probaj Klasiko besplatno 14 dana</Link>
        </div>
      </div>
    </main>
  );
}
