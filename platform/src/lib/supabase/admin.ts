import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Servisni klijent zaobilazi RLS. Koristi se samo na serveru, posle provere prava.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
