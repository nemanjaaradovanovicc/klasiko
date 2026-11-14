import type { SupabaseClient } from '@supabase/supabase-js';

type GroupEmbed = { teacher_id: string | null } | { teacher_id: string | null }[] | null;

// Predavač vidi članstvo samo u grupama koje predaje (RLS). Uporedi teacher_id kad je ugnježdena grupa tu.
export async function teacherStudentFlags(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  studentId: string,
): Promise<{ teachesStudent: boolean; hasActiveDropIn: boolean }> {
  const [memberships, dropIns] = await Promise.all([
    supabase.from('group_members').select('groups(teacher_id)').eq('student_id', studentId).eq('org_id', orgId),
    supabase.from('groups').select('id').eq('org_id', orgId).eq('teacher_id', userId).eq('drop_in', true).eq('active', true).limit(1),
  ]);
  if (memberships.error) throw new Error(memberships.error.message);
  if (dropIns.error) throw new Error(dropIns.error.message);
  const teachesStudent = ((memberships.data ?? []) as { groups: GroupEmbed }[]).some((row) => {
    const g = row.groups;
    if (!g) return true;
    if (Array.isArray(g)) return g.length === 0 || g.some((x) => x?.teacher_id === userId);
    return g.teacher_id === userId;
  });
  return { teachesStudent, hasActiveDropIn: (dropIns.data ?? []).length > 0 };
}
