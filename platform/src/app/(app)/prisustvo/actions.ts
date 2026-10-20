'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type AttStatus = 'present' | 'absent' | 'excused';

export async function saveAttendance(input: {
  groupId: string;
  date: string;
  startTime: string;
  status: 'held' | 'cancelled';
  note: string;
  marks: Record<string, AttStatus>;
}): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireOrg();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime)) return { error: 'Neispravan datum ili vreme.' };
  const supabase = await createClient();
  const { data: group } = await supabase.from('groups').select('id').eq('id', input.groupId).eq('org_id', ctx.org.id).maybeSingle();
  if (!group) return { error: 'Grupa nije pronađena.' };
  const { data: members } = await supabase.from('group_members').select('student_id').eq('group_id', input.groupId);
  const allowed = new Set((members ?? []).map((m) => m.student_id));
  const { data: session, error } = await supabase
    .from('sessions')
    .upsert(
      { org_id: ctx.org.id, group_id: input.groupId, date: input.date, start_time: input.startTime, status: input.status, note: input.note || null, teacher_id: ctx.userId },
      { onConflict: 'group_id,date,start_time' },
    )
    .select('id')
    .single();
  if (error || !session) return { error: 'Čas nije sačuvan. Proveri da li imaš pristup ovoj grupi.' };

  if (input.status === 'cancelled') {
    await supabase.from('attendance').delete().eq('session_id', session.id);
  } else {
    const rows = Object.entries(input.marks).filter(([sid]) => allowed.has(sid)).map(([student_id, status]) => ({ session_id: session.id, student_id, org_id: ctx.org.id, status }));
    if (rows.length) {
      const { error: aErr } = await supabase.from('attendance').upsert(rows, { onConflict: 'session_id,student_id' });
      if (aErr) return { error: 'Prisustvo nije sačuvano: ' + aErr.message };
    }
  }
  revalidatePath('/prisustvo');
  revalidatePath('/');
  return { ok: true };
}
