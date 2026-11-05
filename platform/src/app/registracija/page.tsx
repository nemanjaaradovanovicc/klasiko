import Image from 'next/image';
import Link from 'next/link';
import { RegisterForm } from './form';

export const metadata = { title: 'Probaj besplatno' };

export default function RegisterPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Klasiko" width={64} height={64} priority />
          <h1 className="mt-3 text-[28px] font-extrabold tracking-tight text-brand">Probaj Klasiko 14 dana</h1>
          <p className="mt-1 text-[15px] font-semibold text-mut">Besplatno, bez kartice i bez obaveze.</p>
        </div>
        <div className="card p-6"><RegisterForm /></div>
        <p className="mt-5 text-center text-[14px] font-bold"><Link className="text-brand" href="/login">Već imaš nalog? Prijavi se</Link></p>
      </div>
    </main>
  );
}
