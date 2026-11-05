import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Nova lozinka' };

// Dugme umesto automatske potvrde: programi za proveru mejlova otvaraju linkove i potrošili bi token.
async function confirm(fd: FormData) {
  'use server';
  const hash = String(fd.get('token_hash') || '');
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: hash });
  if (error) redirect('/auth/potvrda?greska=1');
  redirect('/lozinka');
}

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; greska?: string }> }) {
  const sp = await searchParams;
  const bad = sp.greska || !sp.token_hash;
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-brand">{bad ? 'Link ne važi' : 'Nova lozinka'}</h1>
        {bad ? (
          <>
            <p className="mt-2 text-[15px] font-semibold text-ink-2">Link je istekao ili je već iskorišćen.</p>
            <a className="btn mt-4" href="/zaboravljena-lozinka">Zatraži novi link</a>
          </>
        ) : (
          <form action={confirm} className="mt-4">
            <input type="hidden" name="token_hash" value={sp.token_hash} />
            <button className="btn h-12 w-full text-base">Nastavi na promenu lozinke</button>
          </form>
        )}
      </div>
    </main>
  );
}
