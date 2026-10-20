import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ORG_COOKIE } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  res.cookies.delete(ORG_COOKIE);
  return res;
}
