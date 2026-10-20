'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function changePassword(_: { error?: string } | undefined, formData: FormData) {
  const p1 = String(formData.get('password') || '');
  const p2 = String(formData.get('password2') || '');
  if (p1.length < 8) return { error: 'Lozinka mora imati bar 8 znakova.' };
  if (p1 !== p2) return { error: 'Lozinke se ne poklapaju.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (error) return { error: 'Lozinka nije promenjena. Probaj neku drugu.' };
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  redirect('/?ok=lozinka');
}
