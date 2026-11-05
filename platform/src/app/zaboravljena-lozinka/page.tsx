import Link from 'next/link';
import { ResetForm } from './form';
import { emailEnabled } from '@/lib/email';

export const metadata = { title: 'Zaboravljena lozinka' };
// Provera podešavanja mora da se radi pri svakom otvaranju, a ne jednom pri izgradnji aplikacije.
export const dynamic = 'force-dynamic';

export default function ForgotPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-[26px] font-extrabold tracking-tight text-brand">Zaboravljena lozinka</h1>
        {emailEnabled() ? (
          <>
            <p className="mb-6 mt-1 text-center text-[15px] font-semibold text-mut">Poslaćemo ti link za postavljanje nove lozinke.</p>
            <div className="card p-6"><ResetForm /></div>
          </>
        ) : (
          <div className="card mt-6 p-6 text-center">
            <p className="text-[15px] font-semibold text-ink-2">Predavači novu lozinku dobijaju od vlasnika škole, u Podešavanjima pod „Tim”. Vlasnik škole se javlja podršci.</p>
            <a className="btn mt-4" href="https://wa.me/381638219713?text=Zdravo%2C%20zaboravio%2Fla%20sam%20lozinku%20za%20Klasiko" target="_blank" rel="noopener">Piši podršci na WhatsApp</a>
          </div>
        )}
        <p className="mt-5 text-center text-[14px] font-bold"><Link className="text-brand" href="/login">Nazad na prijavu</Link></p>
      </div>
    </main>
  );
}
