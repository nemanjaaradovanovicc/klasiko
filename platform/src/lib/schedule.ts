import { addDays, daysBetween, isoWeekday, weekStart } from '@/lib/format';

export type SlotRecurrence = 'weekly' | 'biweekly';

// Termin važi tog datuma: nedeljni uvek, svaka druga nedelja samo u nedelji sidra i svakoj drugoj posle.
export function slotOccursOn(date: string, slot: { weekday: number; recurrence?: string | null; anchor_date?: string | null }): boolean {
  if (isoWeekday(date) !== slot.weekday) return false;
  if (slot.recurrence !== 'biweekly') return true;
  if (!slot.anchor_date) return false;
  return biweeklyAligns(slot.anchor_date, date);
}

export function biweeklyAligns(anchor: string, date: string): boolean {
  const weeks = Math.round(daysBetween(weekStart(anchor), weekStart(date)) / 7);
  return Math.abs(weeks) % 2 === 0;
}

// Jedan nedeljni termin je 1, svaka druga nedelja je 0,5. Nula znači da grupa nema raspored.
export function weeklyFrequency(slots: { recurrence?: string | null }[]): number {
  return slots.reduce((n, s) => n + (s.recurrence === 'biweekly' ? 0.5 : 1), 0);
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}
