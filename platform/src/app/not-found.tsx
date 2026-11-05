import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10 text-center">
      <div className="max-w-sm">
        <h1 className="text-[26px] font-extrabold tracking-tight text-brand">Stranica nije pronađena</h1>
        <p className="mt-2 text-[15px] font-semibold text-ink-2">Link je možda pogrešan ili stranica više ne postoji.</p>
        <Link className="btn mt-5" href="/">Početna</Link>
      </div>
    </main>
  );
}
