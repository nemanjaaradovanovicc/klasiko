import { dateTimeSr } from '@/lib/format';

// Ko je upisao prisustvo i belešku časa. Vremena iz baze su timestamptz.
export interface SessionAudit {
  attendance_recorded_by: string | null;
  attendance_recorded_at: string | null;
  attendance_updated_by: string | null;
  attendance_updated_at: string | null;
  note_updated_by: string | null;
  note_updated_at: string | null;
}

export const EMPTY_AUDIT: SessionAudit = {
  attendance_recorded_by: null,
  attendance_recorded_at: null,
  attendance_updated_by: null,
  attendance_updated_at: null,
  note_updated_by: null,
  note_updated_at: null,
};

export interface AuditMoment {
  by: string | null;
  at: string;
}

export interface AuditView {
  entered: AuditMoment | null;
  changed: AuditMoment | null;
}

function later(enteredAt: string | null, moment: AuditMoment | null): AuditMoment | null {
  if (!moment) return null;
  if (!enteredAt) return moment;
  const entered = Date.parse(enteredAt);
  const at = Date.parse(moment.at);
  if (Number.isNaN(at)) return null;
  if (!Number.isNaN(entered) && at <= entered) return null;
  return moment;
}

// Prvi upis i poslednja naknadna izmena. Beleška upisana u istom trenutku kao prisustvo nije izmena.
export function sessionAuditView(row: SessionAudit): AuditView {
  const entered: AuditMoment | null = row.attendance_recorded_at
    ? { by: row.attendance_recorded_by, at: row.attendance_recorded_at }
    : row.note_updated_at
      ? { by: row.note_updated_by, at: row.note_updated_at }
      : null;
  const candidates = [
    later(entered?.at ?? null, row.attendance_updated_at ? { by: row.attendance_updated_by, at: row.attendance_updated_at } : null),
    later(entered?.at ?? null, row.note_updated_at ? { by: row.note_updated_by, at: row.note_updated_at } : null),
  ].filter((x): x is AuditMoment => !!x);
  candidates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { entered, changed: candidates.length ? candidates[candidates.length - 1] : null };
}

export function auditName(id: string | null, names: Map<string, string>): string {
  if (!id) return 'Nepoznat korisnik';
  return names.get(id) || 'Nepoznat korisnik';
}

export function formatAuditLine(kind: 'uneo' | 'izmenio', name: string, at: string): string {
  return `${kind === 'izmenio' ? 'Izmenio' : 'Uneo'}: ${name}, ${dateTimeSr(at)}`;
}

// Rezerva kad okidač nije tu: ista pravila kao stamp_session_audit, plus izmena oznaka.
export function nextSessionAudit(input: {
  previous: (SessionAudit & { status?: string | null; note?: string | null }) | null;
  status: 'held' | 'cancelled';
  note: string | null;
  marksChanged: boolean;
  actorId: string;
  at: string;
}): SessionAudit {
  const prev = input.previous;
  const first = !prev?.attendance_recorded_at || (prev.status !== 'held' && prev.status !== 'cancelled');
  if (first) {
    return {
      attendance_recorded_by: input.actorId,
      attendance_recorded_at: input.at,
      attendance_updated_by: null,
      attendance_updated_at: null,
      note_updated_by: input.note ? input.actorId : null,
      note_updated_at: input.note ? input.at : null,
    };
  }
  const next: SessionAudit = {
    attendance_recorded_by: prev.attendance_recorded_by,
    attendance_recorded_at: prev.attendance_recorded_at,
    attendance_updated_by: prev.attendance_updated_by,
    attendance_updated_at: prev.attendance_updated_at,
    note_updated_by: prev.note_updated_by,
    note_updated_at: prev.note_updated_at,
  };
  if (prev.status !== input.status || input.marksChanged) {
    next.attendance_updated_by = input.actorId;
    next.attendance_updated_at = input.at;
  }
  if ((prev.note ?? null) !== input.note) {
    next.note_updated_by = input.actorId;
    next.note_updated_at = input.at;
  }
  return next;
}

export function attendanceSummary(status: string, marks: { status: string }[]): string {
  if (status === 'cancelled') return 'Otkazan';
  const present = marks.filter((m) => m.status === 'present').length;
  return `${present}/${marks.length} prisutno`;
}
