import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Javno bez prijave. Cron ima sopstvenu proveru tajnog ključa.
const PUBLIC = ['/login', '/zaboravljena-lozinka', '/registracija', '/auth', '/r', '/api/cron'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Lokalna provera potpisa tokena (ES256), bez poziva Supabase servera; po potrebi osvežava sesiju.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + '/'));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Posle prijave korisnik se vraća tamo gde je krenuo (npr. link za uplatu iz poruke).
    if (path !== '/' && request.method === 'GET') url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // Sa ?greska= stranica za prijavu mora da se prikaže i uz važeću sesiju, inače nastaje beskonačno preusmeravanje.
  if (user && path === '/login' && !request.nextUrl.searchParams.has('greska')) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next');
    url.search = '';
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next.split('?')[0] : '/';
    if (next?.includes('?')) url.search = next.slice(next.indexOf('?'));
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|webp|ico)$).*)'],
};
