// Učenici po predavaču: učenik pripada predavaču ako je u nekoj njegovoj aktivnoj grupi.

export const NO_TEACHER = 'bez';

type WithGroups = { group_members: { groups: { teacher_id: string | null; active: boolean } | null }[] };

// Predavači učenika, bez ponavljanja. Arhivirane grupe se ne računaju.
export function teacherIdsOf(s: WithGroups): string[] {
  const ids = s.group_members.map((m) => (m.groups?.active ? m.groups.teacher_id : null)).filter((id): id is string => !!id);
  return [...new Set(ids)];
}

// NO_TEACHER nalazi učenike koji nisu ni kod jednog predavača (bez grupe ili u grupi bez predavača).
export function isWithTeacher(s: WithGroups, teacherId: string): boolean {
  const ids = teacherIdsOf(s);
  return teacherId === NO_TEACHER ? ids.length === 0 : ids.includes(teacherId);
}

// Broj učenika po predavaču. Učenik koji ide kod dva predavača broji se kod oba.
export function studentsPerTeacher(list: WithGroups[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of list) {
    const ids = teacherIdsOf(s);
    for (const id of ids.length ? ids : [NO_TEACHER]) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}
