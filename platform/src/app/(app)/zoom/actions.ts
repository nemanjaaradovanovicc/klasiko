'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isPeriod, moneyCurrency } from '@/lib/format';

export async function saveZoomExpense(fd: FormData) {
  const ctx = await requireOrg();
  const month = String(fd.get('month') || '');
  const back = `/zoom?mesec=${isPeriod(month) ? month : ''}`;
  if (!isPeriod(month)) redirect('/zoom?err=' + encodeURIComponent('Izaberi mesec.'));
  const amount = Number(String(fd.get('amount') ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) {
    redirect(back + '&err=' + encodeURIComponent('Iznos mora biti nula ili veći, do 99.999.999,99.'));
  }
  const supabase = await createClient();
  let teacherId = ctx.userId;
  if (ctx.isOwner) {
    const chosen = String(fd.get('teacher_id') || '');
    const { data: teacher } = await supabase.from('profiles').select('id').eq('id', chosen).eq('org_id', ctx.org.id).in('role', ['teacher', 'owner']).maybeSingle();
    if (!teacher) redirect(back + '&err=' + encodeURIComponent('Predavač nije iz ove škole.'));
    teacherId = teacher.id;
  }
  const note = String(fd.get('note') ?? '').trim();
  const { error } = await supabase.from('teacher_expenses').upsert(
    {
      org_id: ctx.org.id,
      teacher_id: teacherId,
      month: `${month}-01`,
      kind: 'zoom',
      amount: Math.round(amount * 100) / 100,
      currency: moneyCurrency(ctx.org.currency),
      note: note || null,
    },
    { onConflict: 'org_id,teacher_id,month,kind' },
  );
  revalidatePath('/zoom');
  revalidatePath('/izvestaji');
  redirect(back + (error ? '&err=' + encodeURIComponent(error.message) : '&ok=1'));
}
