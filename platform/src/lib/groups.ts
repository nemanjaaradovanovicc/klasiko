import type { SupabaseClient } from '@supabase/supabase-js';
import { biweeklyAligns } from '@/lib/schedule';

// Koliko slobodnih mesta ima grupa. null = bez ograničenja.
export async function freeSeats(db: SupabaseClient, groupId: string, orgId: string): Promise<number | null> {
  const [{ data: g }, { count }] = await Promise.all([
    db.from('groups').select('capacity').eq('id', groupId).eq('org_id', orgId).maybeSingle(),
    db.from('group_members').select('student_id', { count: 'exact', head: true }).eq('group_id', groupId),
  ]);
  if (!g?.capacity) return null;
  return Math.max(0, g.capacity - (count ?? 0));
}

export type SlotLike = { weekday: number; start_time: string; end_time: string; room_id: string | null; teacher_id: string | null; group_name: string; recurrence?: string | null; anchor_date?: string | null };

function sharesWeek(a: { recurrence?: string | null; anchor_date?: string | null }, b: { recurrence?: string | null; anchor_date?: string | null }): boolean {
  const aBi = a.recurrence === 'biweekly';
  const bBi = b.recurrence === 'biweekly';
  if (!aBi || !bBi) return true;
  if (!a.anchor_date || !b.anchor_date) return true;
  return biweeklyAligns(a.anchor_date, b.anchor_date);
}

// Preklapanje termina: ista sala ili isti predavač u isto vreme. Dva termina svake druge nedelje se ne sudaraju ako padaju u različite nedelje.
export function slotConflicts(slot: Omit<SlotLike, 'group_name'>, others: SlotLike[]): string[] {
  const out: string[] = [];
  const h = (t: string) => t.slice(0, 5);
  for (const o of others) {
    if (o.weekday !== slot.weekday || !sharesWeek(slot, o) || !(h(slot.start_time) < h(o.end_time) && h(o.start_time) < h(slot.end_time))) continue;
    if (slot.room_id && o.room_id === slot.room_id) out.push(`sala je zauzeta (${o.group_name}, ${h(o.start_time)}–${h(o.end_time)})`);
    else if (slot.teacher_id && o.teacher_id === slot.teacher_id) out.push(`predavač već drži čas (${o.group_name}, ${h(o.start_time)}–${h(o.end_time)})`);
  }
  return out;
}
