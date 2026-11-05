// Predlog porodica: učenici sa istim telefonom ili emailom roditelja koji još nisu povezani.
import { phoneKey } from '@/lib/phone';

export type FamilyCandidate = { id: string; first_name: string; last_name: string; parent_phone: string | null; parent_email: string | null; family_id: string | null };

export function familySuggestions<T extends FamilyCandidate>(students: T[]): T[][] {
  const buckets = new Map<string, T[]>();
  for (const s of students) {
    const key = phoneKey(s.parent_phone) || (s.parent_email ?? '').trim().toLowerCase();
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), s]);
  }
  return [...buckets.values()].filter((list) => list.length > 1 && (new Set(list.map((s) => s.family_id)).size > 1 || list.some((s) => !s.family_id)));
}

// Ključ za spajanje računa: porodica ako postoji, inače sam učenik.
export function familyKey(s: { id: string; family_id: string | null }): string {
  return s.family_id ?? s.id;
}
