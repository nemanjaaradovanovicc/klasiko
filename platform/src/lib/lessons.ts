// Vrsta časa za mesečni izveštaj po predavaču.
// Probni časovi žive u trial_lessons i ovde ulaze samo kao „probni”.

import { moneyCurrency } from '@/lib/format';

export const GROUP_LESSON_TYPES = ['individualni', 'duo', 'grupni', 'radionica'] as const;
export type GroupLessonType = (typeof GROUP_LESSON_TYPES)[number];

export const REPORT_LESSON_KINDS = ['probni', 'individualni', 'duo', 'grupni', 'radionica'] as const;
export type ReportLessonKind = (typeof REPORT_LESSON_KINDS)[number];

export const LESSON_KIND_LABEL: Record<ReportLessonKind, string> = {
  probni: 'Probni',
  individualni: 'Individualni',
  duo: 'Duo',
  grupni: 'Grupni',
  radionica: 'Radionica',
};

export function isGroupLessonType(v: unknown): v is GroupLessonType {
  return v === 'individualni' || v === 'duo' || v === 'grupni' || v === 'radionica';
}

export function emptyKindCounts(): Record<ReportLessonKind, number> {
  return { probni: 0, individualni: 0, duo: 0, grupni: 0, radionica: 0 };
}

// Broje se samo učenici koji su i dalje aktivni. Ispisani član grupe ne menja vrstu.
export function activeMemberCount(members: { active?: boolean | null }[]): number {
  return members.filter((m) => m.active === true).length;
}

// Upisana vrsta ima prednost. Inače: otvorena grupa je radionica, 1 član individualni, 2 duo, ostalo grupni.
export function inferLessonType(input: {
  lessonType?: string | null;
  dropIn?: boolean;
  activeMembers?: number;
}): GroupLessonType {
  if (isGroupLessonType(input.lessonType)) return input.lessonType;
  if (input.dropIn) return 'radionica';
  const n = input.activeMembers ?? 0;
  if (n === 1) return 'individualni';
  if (n === 2) return 'duo';
  return 'grupni';
}

// Vrsta upisana na sam čas važi samo za taj čas. Nevažeća vrednost se ignoriše.
export function lessonTypeForSession(input: {
  sessionType?: string | null;
  groupType?: string | null;
  dropIn?: boolean;
  activeMembers?: number;
}): GroupLessonType {
  if (isGroupLessonType(input.sessionType)) return input.sessionType;
  return inferLessonType({ lessonType: input.groupType, dropIn: input.dropIn, activeMembers: input.activeMembers });
}

export interface TeacherLessonTotals {
  id: string;
  name: string;
  held: number;
  cancelled: number;
  minutes: number;
  counts: Record<ReportLessonKind, number>;
  zoom: { amount: number; currency: string }[];
}

function teacherName(id: string, names: Map<string, string>): string {
  if (id === 'none') return 'Bez predavača';
  return names.get(id) ?? 'Bivši korisnik';
}

function addMoney(list: { amount: number; currency: string }[], amount: number, currency: string | null | undefined) {
  const c = moneyCurrency(currency);
  const hit = list.find((x) => x.currency === c);
  const rounded = Math.round((amount + (hit?.amount ?? 0)) * 100) / 100;
  if (hit) hit.amount = rounded;
  else list.push({ amount: rounded, currency: c });
}

export interface LessonSession {
  status: string;
  teacherId: string | null;
  groupId: string;
  minutes: number;
  lessonType?: string | null;
}

export interface LessonGroup {
  id: string;
  teacherId: string | null;
  lessonType?: string | null;
  dropIn?: boolean;
  activeMembers?: number;
}

// Održani časovi po predavaču, podeljeni na probni / individualni / duo / grupni / radionica, plus sati i Zoom.
export function aggregateTeacherMonth(input: {
  sessions: LessonSession[];
  trials: { teacherId: string | null }[];
  groups: LessonGroup[];
  names: Map<string, string>;
  expenses?: { teacherId: string; amount: number; currency?: string | null; kind?: string | null }[];
}): TeacherLessonTotals[] {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  const rows = new Map<string, TeacherLessonTotals>();
  const rowFor = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = { id, name: teacherName(id, input.names), held: 0, cancelled: 0, minutes: 0, counts: emptyKindCounts(), zoom: [] };
      rows.set(id, row);
    }
    return row;
  };

  for (const se of input.sessions) {
    const group = groups.get(se.groupId);
    const id = se.teacherId ?? group?.teacherId ?? 'none';
    const row = rowFor(id);
    if (se.status === 'cancelled') {
      row.cancelled++;
      continue;
    }
    if (se.status !== 'held') continue;
    const kind = lessonTypeForSession({
      sessionType: se.lessonType,
      groupType: group?.lessonType,
      dropIn: group?.dropIn,
      activeMembers: group?.activeMembers,
    });
    row.counts[kind]++;
    row.minutes += Math.max(0, se.minutes);
  }

  for (const trial of input.trials) {
    const row = rowFor(trial.teacherId ?? 'none');
    row.counts.probni++;
  }

  for (const expense of input.expenses ?? []) {
    if (expense.kind && expense.kind !== 'zoom') continue;
    if (!expense.teacherId) continue;
    addMoney(rowFor(expense.teacherId).zoom, Number(expense.amount) || 0, expense.currency);
  }

  for (const row of rows.values()) {
    row.held = REPORT_LESSON_KINDS.reduce((sum, kind) => sum + row.counts[kind], 0);
  }

  return [...rows.values()].sort((a, b) => b.held - a.held || a.name.localeCompare(b.name, 'sr'));
}

export function sumTeacherLessons(rows: TeacherLessonTotals[]): Pick<TeacherLessonTotals, 'held' | 'cancelled' | 'minutes' | 'counts' | 'zoom'> {
  const counts = emptyKindCounts();
  let cancelled = 0;
  let minutes = 0;
  const zoom: { amount: number; currency: string }[] = [];
  for (const row of rows) {
    for (const kind of REPORT_LESSON_KINDS) counts[kind] += row.counts[kind];
    cancelled += row.cancelled;
    minutes += row.minutes;
    for (const item of row.zoom) addMoney(zoom, item.amount, item.currency);
  }
  const held = REPORT_LESSON_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
  return { held, cancelled, minutes, counts, zoom };
}
