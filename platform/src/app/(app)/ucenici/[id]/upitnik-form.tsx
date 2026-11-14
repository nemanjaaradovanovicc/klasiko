import Link from 'next/link';
import { Badge, Card, Field, Flash, PageHeader, TextArea } from '@/components/ui';
import { dateSr, fullName } from '@/lib/format';
import { waUrl } from '@/lib/phone';
import {
  DESIRED_LESSONS, DESIRED_LESSON_LABEL, FAMILY_TYPES, FAMILY_TYPE_LABEL, PHOTO_CONSENT_LABEL, PHOTO_CONSENTS,
  SCRIPT_ANSWERS, SCRIPT_LABEL, SERBIAN_LEVELS, SERBIAN_LEVEL_LABEL, type PhotoConsent, type StudentProfile,
} from '@/lib/questionnaire';
import type { Student } from '@/lib/types';
import { saveQuestionnaire } from '../upitnik-actions';

const OK: Record<string, string> = { upitnik: 'Upisni upitnik je sačuvan.' };

export function PhotoConsentBanner({ value }: { value: string | null | undefined }) {
  const known: PhotoConsent | null = value === 'da' || value === 'ne' ? value : null;
  const box = known === 'da' ? 'bg-ok-soft' : known === 'ne' ? 'bg-coral-soft' : 'bg-soft';
  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${box}`}>
      <span className="text-[15px] font-extrabold text-ink">Saglasnost za fotografisanje</span>
      <Badge tone={known === 'da' ? 'ok' : known === 'ne' ? 'coral' : 'gray'}>{known ? PHOTO_CONSENT_LABEL[known] : 'nije odgovoreno'}</Badge>
    </div>
  );
}

function Choices({ label, name, value, options }: { label: string; name: string; value: string | null | undefined; options: { value: string; label: string }[] }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <input type="radio" name={name} value="" defaultChecked={!value} className="h-4 w-4 accent-[#5B2A86]" />
          Nije odgovoreno
        </label>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} className="h-4 w-4 accent-[#5B2A86]" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function QuestionnaireForm({ student, profile }: { student: Student; profile: StudentProfile | null }) {
  const lessons = new Set(profile?.desired_lessons ?? []);
  const script = (key: 'knows_local_script' | 'knows_latin' | 'knows_cyrillic', label: string) => (
    <Choices label={label} name={key} value={profile?.[key]} options={SCRIPT_ANSWERS.map((value) => ({ value, label: SCRIPT_LABEL[value] }))} />
  );
  return (
    <form action={saveQuestionnaire} className="flex flex-col gap-4">
      <input type="hidden" name="student_id" value={student.id} />
      <Choices label="Saglasnost za fotografisanje" name="photo_consent" value={profile?.photo_consent} options={PHOTO_CONSENTS.map((value) => ({ value, label: PHOTO_CONSENT_LABEL[value] }))} />

      <div className="rounded-xl bg-soft px-3 py-3">
        <div className="text-[13px] font-extrabold uppercase tracking-wider text-mut">Učenik</div>
        <div className="mt-1 text-[15px] font-extrabold text-ink">{fullName(student)}</div>
        <div className="text-[14px] font-semibold text-ink-2">Datum rođenja: {student.birth_date ? dateSr(student.birth_date) : 'nije upisan'}</div>
        <p className="mt-1 text-[12px] font-semibold text-mut">Ime i datum rođenja menja vlasnik škole u podacima učenika.</p>
      </div>

      <div className="text-[13px] font-extrabold uppercase tracking-wider text-mut">Roditelj ili staratelj</div>
      <p className="text-[13px] font-semibold text-mut">Ime, telefon i email su isti podaci kao na kartonu. Izmena ovde menja njih, ne pravi drugi kontakt.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ime roditelja" name="parent_name" defaultValue={student.parent_name} />
        <Field label="Telefon roditelja" name="parent_phone" type="tel" defaultValue={student.parent_phone} />
        <div className="sm:col-span-2"><Field label="Email roditelja" name="parent_email" type="email" defaultValue={student.parent_email} /></div>
        <div className="sm:col-span-2">
          <Field label="Telefon za Viber ili WhatsApp" name="messenger_phone" type="tel" defaultValue={profile?.messenger_phone} hint="Ako je isti kao telefon roditelja, može da ostane prazan." />
        </div>
        <Field label="Država" name="country" defaultValue={profile?.country} />
        <Field label="Grad" name="city" defaultValue={profile?.city} />
        <Field label="Kako ste čuli za školu" name="heard_from" defaultValue={profile?.heard_from} />
        <Field label="Ko vas je preporučio" name="referred_by" defaultValue={profile?.referred_by} />
        <label className="block">
          <span className="label">Nivo srpskog</span>
          <select className="input" name="serbian_level" defaultValue={profile?.serbian_level ?? ''}>
            <option value="">Izaberi</option>
            {SERBIAN_LEVELS.map((value) => <option key={value} value={value}>{SERBIAN_LEVEL_LABEL[value]}</option>)}
          </select>
        </label>
        <Field label="Napomena o nivou" name="serbian_level_note" defaultValue={profile?.serbian_level_note} hint="Slobodan tekst, nije obavezan" />
        <label className="block sm:col-span-2">
          <span className="label">Porodica</span>
          <select className="input" name="family_type" defaultValue={profile?.family_type ?? ''}>
            <option value="">Izaberi</option>
            {FAMILY_TYPES.map((value) => <option key={value} value={value}>{FAMILY_TYPE_LABEL[value]}</option>)}
          </select>
        </label>
      </div>

      {script('knows_local_script', 'Poznaje lokalno pismo')}
      {script('knows_latin', 'Poznaje latinicu')}
      {script('knows_cyrillic', 'Poznaje ćirilicu')}

      <fieldset>
        <legend className="label">Željeni časovi</legend>
        <div className="flex flex-col gap-2">
          {DESIRED_LESSONS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-[14px] font-bold text-ink">
              <input type="checkbox" name="desired_lessons" value={value} defaultChecked={lessons.has(value)} className="h-4 w-4 accent-[#5B2A86]" />
              {DESIRED_LESSON_LABEL[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <TextArea label="Stil učenja" name="learning_style" defaultValue={profile?.learning_style} />
      <TextArea label="Očekivanja roditelja" name="parent_expectations" defaultValue={profile?.parent_expectations} />
      <TextArea label="Aktivnosti i sport" name="activities_sports" defaultValue={profile?.activities_sports} />
      <TextArea label="Šta dete voli" name="likes" defaultValue={profile?.likes} />
      <TextArea label="Očekivanja od predavača" name="teacher_expectations" defaultValue={profile?.teacher_expectations} />
      <div><button className="btn">Sačuvaj upitnik</button></div>
    </form>
  );
}

export function TeacherStudentCard({
  s, profile, groups, ok, err,
}: {
  s: Student;
  profile: StudentProfile | null;
  groups: { id: string; name: string; color: string }[];
  ok?: string;
  err?: string;
}) {
  const phone = profile?.messenger_phone || s.parent_phone || s.phone;
  return (
    <>
      <PageHeader
        title={fullName(s)}
        subtitle={<>{s.active ? 'Aktivan' : `Ispisan ${dateSr(s.left_at)}`} · upisan {dateSr(s.joined_at)}</>}
        back={{ href: '/ucenici', label: 'Učenici' }}
        actions={(
          <>
            {(s.parent_phone || s.phone) && <a className="btn btn-soft" href={`tel:${s.parent_phone || s.phone}`}>Pozovi</a>}
            {phone && <a className="btn btn-soft" href={waUrl(phone)} target="_blank" rel="noopener">WhatsApp</a>}
          </>
        )}
      />
      <Flash ok={ok ? OK[ok] : undefined} err={err} />
      <PhotoConsentBanner value={profile?.photo_consent} />
      <p className="mb-6 text-[14px] font-semibold text-ink-2">Ovde menjaš upisni upitnik i kontakt roditelja. Članarina, popusti, paketi i uplate ostaju kod vlasnika škole.</p>
      {groups.length > 0 && (
        <Card title="Grupe" className="mb-6">
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/grupe/${g.id}`} className="inline-flex items-center gap-2 font-bold text-ink hover:text-brand">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div id="upitnik" className="scroll-mt-24">
        <Card title="Upisni upitnik">
          <QuestionnaireForm student={s} profile={profile} />
        </Card>
      </div>
    </>
  );
}
