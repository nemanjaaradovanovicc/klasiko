'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { canEditQuestionnaire, canEditStudentRecord, parseQuestionnaire, type QuestionnaireRaw } from '@/lib/questionnaire';
import { teacherStudentFlags } from '@/lib/student-access';
import { createClient } from '@/lib/supabase/server';

function one(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return v == null ? null : String(v);
}

function rawFromForm(fd: FormData): QuestionnaireRaw {
  return {
    parent_name: one(fd, 'parent_name'),
    parent_phone: one(fd, 'parent_phone'),
    parent_email: one(fd, 'parent_email'),
    messenger_phone: one(fd, 'messenger_phone'),
    country: one(fd, 'country'),
    city: one(fd, 'city'),
    heard_from: one(fd, 'heard_from'),
    referred_by: one(fd, 'referred_by'),
    serbian_level: one(fd, 'serbian_level'),
    serbian_level_note: one(fd, 'serbian_level_note'),
    family_type: one(fd, 'family_type'),
    knows_local_script: one(fd, 'knows_local_script'),
    knows_latin: one(fd, 'knows_latin'),
    knows_cyrillic: one(fd, 'knows_cyrillic'),
    desired_lessons: fd.getAll('desired_lessons').map(String),
    learning_style: one(fd, 'learning_style'),
    parent_expectations: one(fd, 'parent_expectations'),
    activities_sports: one(fd, 'activities_sports'),
    likes: one(fd, 'likes'),
    teacher_expectations: one(fd, 'teacher_expectations'),
    photo_consent: one(fd, 'photo_consent'),
  };
}

// Upitnik sme da sačuva i predavač za učenika kog već vidi. Ne zovi requireOwner.
export async function saveQuestionnaire(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get('student_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/ucenici?err=' + encodeURIComponent('Učenik nije pronađen.'));

  const supabase = await createClient();
  const { data: student } = await supabase.from('students').select('id').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  const flags = canEditStudentRecord(ctx)
    ? { teachesStudent: false, hasActiveDropIn: false }
    : await teacherStudentFlags(supabase, ctx.org.id, ctx.userId, id);
  if (!student || !canEditQuestionnaire(ctx, { sameOrg: true, ...flags })) {
    redirect('/ucenici?err=' + encodeURIComponent('Učenik nije pronađen.'));
  }

  const parsed = parseQuestionnaire(rawFromForm(fd));
  const back = (q: string) => `/ucenici/${id}?${q}#upitnik`;
  if (!parsed.ok) redirect(back('err=' + encodeURIComponent(parsed.error)));
  const value = parsed.value;

  const { data: saved, error } = await supabase.from('student_profiles').upsert({
    student_id: id,
    org_id: ctx.org.id,
    messenger_phone: value.messenger_phone,
    country: value.country,
    city: value.city,
    heard_from: value.heard_from,
    referred_by: value.referred_by,
    serbian_level: value.serbian_level,
    serbian_level_note: value.serbian_level_note,
    family_type: value.family_type,
    knows_local_script: value.knows_local_script,
    knows_latin: value.knows_latin,
    knows_cyrillic: value.knows_cyrillic,
    desired_lessons: value.desired_lessons,
    learning_style: value.learning_style,
    parent_expectations: value.parent_expectations,
    activities_sports: value.activities_sports,
    likes: value.likes,
    teacher_expectations: value.teacher_expectations,
    photo_consent: value.photo_consent,
  }, { onConflict: 'student_id' }).select('student_id');
  if (error || !saved?.length) redirect(back('err=' + encodeURIComponent(error?.message || 'Upitnik nije sačuvan.')));

  const parent = { parent_name: value.parent_name, parent_phone: value.parent_phone, parent_email: value.parent_email };
  if (canEditStudentRecord(ctx)) {
    const { data: updated, error: parentError } = await supabase.from('students').update(parent).eq('id', id).eq('org_id', ctx.org.id).select('id');
    if (parentError || !updated?.length) redirect(back('err=' + encodeURIComponent(parentError?.message || 'Kontakt roditelja nije sačuvan.')));
  } else {
    const { error: parentError } = await supabase.rpc('update_student_parent_contact', {
      p_student: id,
      p_parent_name: value.parent_name,
      p_parent_phone: value.parent_phone,
      p_parent_email: value.parent_email,
    });
    if (parentError) redirect(back('err=' + encodeURIComponent(parentError.message)));
  }

  revalidatePath('/ucenici');
  revalidatePath(`/ucenici/${id}`);
  redirect(back('ok=upitnik'));
}
