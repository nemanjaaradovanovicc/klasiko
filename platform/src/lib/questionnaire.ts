// Upisni upitnik. Ime, datum rođenja i kontakt roditelja ostaju na students.
// Ovde su samo odgovori upitnika, da predavač ne dobije pravo da menja članarinu.

export const SERBIAN_LEVELS = ['pocetni', 'srednji', 'napredni', 'maternji'] as const;
export type SerbianLevel = (typeof SERBIAN_LEVELS)[number];
export const SERBIAN_LEVEL_LABEL: Record<SerbianLevel, string> = {
  pocetni: 'Početni',
  srednji: 'Srednji',
  napredni: 'Napredni',
  maternji: 'Maternji',
};

export const FAMILY_TYPES = ['jednojezicna', 'dvojezicna', 'trojezicna'] as const;
export type FamilyType = (typeof FAMILY_TYPES)[number];
export const FAMILY_TYPE_LABEL: Record<FamilyType, string> = {
  jednojezicna: 'Jednojezična',
  dvojezicna: 'Dvojezična',
  trojezicna: 'Trojezična',
};

export const SCRIPT_ANSWERS = ['da', 'ne', 'delimicno'] as const;
export type ScriptAnswer = (typeof SCRIPT_ANSWERS)[number];
export const SCRIPT_LABEL: Record<ScriptAnswer, string> = {
  da: 'Da',
  ne: 'Ne',
  delimicno: 'Delimično',
};

export const DESIRED_LESSONS = ['1_individualni', '2_individualna', 'grupni_vikend', 'oba'] as const;
export type DesiredLesson = (typeof DESIRED_LESSONS)[number];
export const DESIRED_LESSON_LABEL: Record<DesiredLesson, string> = {
  '1_individualni': '1 individualni nedeljno',
  '2_individualna': '2 individualna nedeljno',
  grupni_vikend: 'Samo grupni vikendom',
  oba: 'Oba',
};

export const PHOTO_CONSENTS = ['da', 'ne'] as const;
export type PhotoConsent = (typeof PHOTO_CONSENTS)[number];
export const PHOTO_CONSENT_LABEL: Record<PhotoConsent, string> = { da: 'DA', ne: 'NE' };

// Iste granice stoje i u migraciji 010, u provera dužine i u funkciji za kontakt roditelja.
export const LIMITS = {
  parentName: 200,
  phone: 80,
  email: 200,
  place: 80,
  short: 200,
  levelNote: 500,
  long: 4000,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StudentProfile {
  student_id: string;
  org_id: string;
  messenger_phone: string | null;
  country: string | null;
  city: string | null;
  heard_from: string | null;
  referred_by: string | null;
  serbian_level: SerbianLevel | null;
  serbian_level_note: string | null;
  family_type: FamilyType | null;
  knows_local_script: ScriptAnswer | null;
  knows_latin: ScriptAnswer | null;
  knows_cyrillic: ScriptAnswer | null;
  desired_lessons: DesiredLesson[];
  learning_style: string | null;
  parent_expectations: string | null;
  activities_sports: string | null;
  likes: string | null;
  teacher_expectations: string | null;
  photo_consent: PhotoConsent | null;
  updated_at: string;
  updated_by: string | null;
}

export interface QuestionnaireInput {
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  messenger_phone: string | null;
  country: string | null;
  city: string | null;
  heard_from: string | null;
  referred_by: string | null;
  serbian_level: SerbianLevel | null;
  serbian_level_note: string | null;
  family_type: FamilyType | null;
  knows_local_script: ScriptAnswer | null;
  knows_latin: ScriptAnswer | null;
  knows_cyrillic: ScriptAnswer | null;
  desired_lessons: DesiredLesson[];
  learning_style: string | null;
  parent_expectations: string | null;
  activities_sports: string | null;
  likes: string | null;
  teacher_expectations: string | null;
  photo_consent: PhotoConsent | null;
}

export type QuestionnaireRaw = { [K in keyof QuestionnaireInput]?: unknown };

export type StudentAccess = {
  sameOrg: boolean;
  // Učenik je u grupi čiji je teacher_id ovaj korisnik. Aktivnost grupe se ne gleda, kao u teaches_student.
  teachesStudent: boolean;
  // Korisnik ima aktivnu otvorenu (drop-in) grupu u istoj školi, pa vidi sve učenike škole.
  hasActiveDropIn: boolean;
};

// Vlasnik (i admin Klasika u toj školi) menja karton: članarinu, popust, pakete, uplate.
export function canEditStudentRecord(viewer: { isOwner: boolean }): boolean {
  return viewer.isOwner;
}

// Upitnik i kontakt roditelja: vlasnik, ili predavač koji učenika već vidi po istom pravilu kao čitanje učenika.
export function canEditQuestionnaire(viewer: { isOwner: boolean }, access: StudentAccess): boolean {
  if (!access.sameOrg) return false;
  if (viewer.isOwner) return true;
  return access.teachesStudent || access.hasActiveDropIn;
}

export type ParsedQuestionnaire = { ok: true; value: QuestionnaireInput } | { ok: false; error: string };

function textOf(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function codeOf(v: unknown): string {
  return textOf(v).toLowerCase();
}

function limited(v: unknown, max: number, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const s = textOf(v);
  if (!s) return { ok: true, value: null };
  if (s.length > max) return { ok: false, error: `${label} može imati najviše ${max} karaktera.` };
  return { ok: true, value: s };
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], error: string): { ok: true; value: T | null } | { ok: false; error: string } {
  const s = codeOf(v);
  if (!s) return { ok: true, value: null };
  if ((allowed as readonly string[]).includes(s)) return { ok: true, value: s as T };
  return { ok: false, error };
}

export function parseQuestionnaire(raw: QuestionnaireRaw): ParsedQuestionnaire {
  const parentName = limited(raw.parent_name, LIMITS.parentName, 'Ime roditelja');
  if (!parentName.ok) return parentName;
  const parentPhone = limited(raw.parent_phone, LIMITS.phone, 'Telefon roditelja');
  if (!parentPhone.ok) return parentPhone;
  const parentEmail = limited(raw.parent_email, LIMITS.email, 'Email roditelja');
  if (!parentEmail.ok) return parentEmail;
  if (parentEmail.value && !EMAIL.test(parentEmail.value)) return { ok: false, error: 'Email roditelja nije ispravan.' };

  const messenger = limited(raw.messenger_phone, LIMITS.phone, 'Telefon za Viber ili WhatsApp');
  if (!messenger.ok) return messenger;
  const country = limited(raw.country, LIMITS.place, 'Država');
  if (!country.ok) return country;
  const city = limited(raw.city, LIMITS.place, 'Grad');
  if (!city.ok) return city;
  const heard = limited(raw.heard_from, LIMITS.short, 'Kako ste čuli za školu');
  if (!heard.ok) return heard;
  const referred = limited(raw.referred_by, LIMITS.short, 'Ko vas je preporučio');
  if (!referred.ok) return referred;

  const level = oneOf(raw.serbian_level, SERBIAN_LEVELS, 'Nivo srpskog nije prepoznat.');
  if (!level.ok) return level;
  const levelNote = limited(raw.serbian_level_note, LIMITS.levelNote, 'Napomena o nivou');
  if (!levelNote.ok) return levelNote;
  const family = oneOf(raw.family_type, FAMILY_TYPES, 'Tip porodice nije prepoznat.');
  if (!family.ok) return family;

  const localScript = oneOf(raw.knows_local_script, SCRIPT_ANSWERS, 'Odgovor o pismu nije prepoznat.');
  if (!localScript.ok) return localScript;
  const latin = oneOf(raw.knows_latin, SCRIPT_ANSWERS, 'Odgovor o pismu nije prepoznat.');
  if (!latin.ok) return latin;
  const cyrillic = oneOf(raw.knows_cyrillic, SCRIPT_ANSWERS, 'Odgovor o pismu nije prepoznat.');
  if (!cyrillic.ok) return cyrillic;

  const lessonList = Array.isArray(raw.desired_lessons) ? raw.desired_lessons : raw.desired_lessons == null || raw.desired_lessons === '' ? [] : [raw.desired_lessons];
  const lessonCodes = lessonList.map(codeOf).filter(Boolean);
  if (lessonCodes.some((code) => !(DESIRED_LESSONS as readonly string[]).includes(code))) {
    return { ok: false, error: 'Željeni časovi nisu prepoznati.' };
  }
  const desired = DESIRED_LESSONS.filter((code) => lessonCodes.includes(code));

  const learning = limited(raw.learning_style, LIMITS.long, 'Stil učenja');
  if (!learning.ok) return learning;
  const expectations = limited(raw.parent_expectations, LIMITS.long, 'Očekivanja roditelja');
  if (!expectations.ok) return expectations;
  const activities = limited(raw.activities_sports, LIMITS.long, 'Aktivnosti i sport');
  if (!activities.ok) return activities;
  const likes = limited(raw.likes, LIMITS.long, 'Šta dete voli');
  if (!likes.ok) return likes;
  const teacherExpectations = limited(raw.teacher_expectations, LIMITS.long, 'Očekivanja od predavača');
  if (!teacherExpectations.ok) return teacherExpectations;

  const photo = oneOf(raw.photo_consent, PHOTO_CONSENTS, 'Saglasnost za fotografisanje može biti samo DA ili NE.');
  if (!photo.ok) return photo;

  return {
    ok: true,
    value: {
      parent_name: parentName.value,
      parent_phone: parentPhone.value,
      parent_email: parentEmail.value,
      messenger_phone: messenger.value,
      country: country.value,
      city: city.value,
      heard_from: heard.value,
      referred_by: referred.value,
      serbian_level: level.value,
      serbian_level_note: levelNote.value,
      family_type: family.value,
      knows_local_script: localScript.value,
      knows_latin: latin.value,
      knows_cyrillic: cyrillic.value,
      desired_lessons: desired,
      learning_style: learning.value,
      parent_expectations: expectations.value,
      activities_sports: activities.value,
      likes: likes.value,
      teacher_expectations: teacherExpectations.value,
      photo_consent: photo.value,
    },
  };
}
