'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { emailEnabled, sendEmail } from '@/lib/email';
import { fetchAll } from '@/lib/supabase/fetch-all';

export async function createAnnouncement(fd: FormData) {
  const ctx = await requireOrg();
  const title = String(fd.get('title') || '').trim().slice(0, 140);
  const body = String(fd.get('body') || '').trim().slice(0, 4000);
  const groupId = String(fd.get('group_id') || '') || null;
  if (!title) redirect('/obavestenja?err=' + encodeURIComponent('Unesi naslov.'));
  if (!ctx.isOwner && !groupId) redirect('/obavestenja?err=' + encodeURIComponent('Izaberi grupu.'));
  const supabase = await createClient();
  const { error } = await supabase.from('announcements').insert({ org_id: ctx.org.id, group_id: groupId, title, body: body || null, created_by: ctx.userId });
  if (error) redirect('/obavestenja?err=' + encodeURIComponent('Nije sačuvano. Proveri da li imaš pristup ovoj grupi.'));

  let mailed = 0;
  if (fd.get('send_email') === 'on' && emailEnabled()) {
    type S = { id: string; parent_email: string | null; email: string | null };
    let students: S[];
    if (groupId) {
      const { data } = await supabase.from('group_members').select('students(id, parent_email, email, active)').eq('group_id', groupId);
      students = ((data ?? []) as unknown as { students: (S & { active: boolean }) | null }[]).map((m) => m.students).filter((s): s is S & { active: boolean } => !!s?.active);
    } else {
      students = await fetchAll<S>((a, b) => supabase.from('students').select('id, parent_email, email').eq('org_id', ctx.org.id).eq('active', true).order('id').range(a, b));
    }
    const to = [...new Set(students.map((s) => (s.parent_email || s.email || '').trim().toLowerCase()).filter(Boolean))];
    for (const address of to) {
      const res = await sendEmail({ to: address, replyTo: ctx.org.email, subject: `${ctx.org.name}: ${title}`, text: `${title}\n\n${body}\n\n${ctx.org.name}` });
      if (res.ok) mailed++;
    }
  }
  revalidatePath('/obavestenja');
  redirect('/obavestenja?ok=' + encodeURIComponent(`Obaveštenje je objavljeno i vidi se na linku za roditelje.${mailed ? ` Poslato mejlova: ${mailed}.` : ''}`));
}

export async function deleteAnnouncement(fd: FormData) {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase.from('announcements').delete().eq('id', String(fd.get('id'))).eq('org_id', ctx.org.id);
  revalidatePath('/obavestenja');
  redirect('/obavestenja?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Obaveštenje je obrisano.')));
}
