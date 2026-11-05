'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { requireOrg, requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayISO, belgradeDayStart } from '@/lib/format';

export type CheckinResult = { ok?: boolean; error?: string; id?: string; name?: string; kind?: 'in' | 'out'; at?: string };

// Ista kartica u ovom roku je slučajno drugo skeniranje, a ne odlazak.
const RESCAN_GUARD_MS = 2 * 60 * 1000;

async function record(studentId: string, kind: 'in' | 'out' | 'auto', pickedUpBy?: string | null): Promise<CheckinResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: st } = await supabase.from('students').select('id, first_name, last_name, active').eq('id', studentId).eq('org_id', ctx.org.id).maybeSingle();
  if (!st || !st.active) return { error: 'Učenik nije pronađen u tvojoj školi.' };
  const name = `${st.first_name} ${st.last_name}`.trim();
  let k = kind;
  if (k === 'auto') {
    const { data: last } = await supabase.from('checkins').select('kind, at').eq('student_id', studentId).gte('at', belgradeDayStart(todayISO())).order('at', { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.at).getTime() < RESCAN_GUARD_MS) {
      return { error: `${name}: ${last.kind === 'in' ? 'dolazak' : 'odlazak'} je već upisan pre manje od 2 minuta.` };
    }
    k = last?.kind === 'in' ? 'out' : 'in';
  }
  const { data, error } = await supabase.from('checkins').insert({ org_id: ctx.org.id, student_id: studentId, kind: k, picked_up_by: k === 'out' ? (pickedUpBy || null) : null, created_by: ctx.userId }).select('id, at').single();
  if (error) return { error: 'Nije sačuvano. Proveri da li ovaj učenik pripada tvojim grupama.' };
  revalidatePath('/dolasci');
  return { ok: true, id: data.id, name, kind: k as 'in' | 'out', at: data.at };
}

export async function checkinByCode(code: string, pickedUpBy?: string | null): Promise<CheckinResult> {
  const ctx = await requireOrg();
  const clean = code.replace(/^KLASIKO:/, '').trim();
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(clean)) return { error: 'Ovo nije Klasiko kartica.' };
  const supabase = await createClient();
  const { data: st } = await supabase.from('students').select('id').eq('checkin_code', clean).eq('org_id', ctx.org.id).maybeSingle();
  if (!st) return { error: 'Kartica nije pronađena u tvojoj školi.' };
  return record(st.id, 'auto', pickedUpBy);
}

export async function checkinManual(studentId: string, kind: 'in' | 'out', pickedUpBy?: string | null): Promise<CheckinResult> {
  return record(studentId, kind, pickedUpBy);
}

// Poništavanje pogrešnog upisa. Vlasnik briše bilo koji, predavač svoj iz poslednjih sat vremena (RLS).
export async function undoCheckin(id: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.from('checkins').delete().eq('id', id).eq('org_id', ctx.org.id).select('id');
  if (error || !data?.length) return { error: 'Upis nije poništen. Predavač može da poništi samo svoj upis u roku od sat vremena.' };
  revalidatePath('/dolasci');
  return { ok: true };
}

export async function undoCheckinForm(fd: FormData) {
  await undoCheckin(String(fd.get('id')));
  redirect('/dolasci');
}

export async function generateCards() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const { data: sts } = await supabase.from('students').select('id').eq('org_id', ctx.org.id).eq('active', true).is('checkin_code', null);
  for (const s of sts ?? []) {
    await supabase.from('students').update({ checkin_code: randomBytes(9).toString('base64url') }).eq('id', s.id).eq('org_id', ctx.org.id);
  }
  revalidatePath('/dolasci/kartice');
  redirect('/dolasci/kartice');
}
