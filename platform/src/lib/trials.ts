// Probni časovi: ishod i brojke za mesec.

export type TrialOutcome = 'pending' | 'enrolled' | 'declined';

export interface TrialLesson {
  id: string;
  org_id: string;
  date: string;
  start_time: string | null;
  teacher_id: string | null;
  group_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  outcome: TrialOutcome;
  outcome_at: string | null;
  student_id: string | null;
  created_at: string;
}

export const TRIAL_OUTCOME_LABEL: Record<TrialOutcome, string> = {
  pending: 'Čeka odluku',
  enrolled: 'Upisao/la se',
  declined: 'Nije se upisao/la',
};

export function isTrialOutcome(v: unknown): v is TrialOutcome {
  return v === 'pending' || v === 'enrolled' || v === 'declined';
}

export interface TrialStats { total: number; enrolled: number; declined: number; pending: number; pct: number | null }

// Procenat upisa se računa samo od probnih časova sa upisanim ishodom: oni koji još čekaju odluku ga ne kvare.
export function trialStats(rows: { outcome: string }[]): TrialStats {
  const enrolled = rows.filter((r) => r.outcome === 'enrolled').length;
  const declined = rows.filter((r) => r.outcome === 'declined').length;
  const decided = enrolled + declined;
  return { total: rows.length, enrolled, declined, pending: rows.length - decided, pct: decided ? Math.round((enrolled / decided) * 100) : null };
}

// Brojke po predavaču, od onoga sa najviše probnih časova.
export function trialsByTeacher(rows: { outcome: string; teacher_id: string | null }[], names: Map<string, string>): (TrialStats & { id: string; name: string })[] {
  const by = new Map<string, { outcome: string }[]>();
  for (const r of rows) {
    const key = r.teacher_id ?? 'none';
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  return [...by.entries()]
    .map(([id, list]) => ({ id, name: id === 'none' ? 'Bez predavača' : names.get(id) ?? 'Bivši korisnik', ...trialStats(list) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'sr'));
}
