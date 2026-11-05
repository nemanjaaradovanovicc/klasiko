import { Field, TextArea } from '@/components/ui';
import type { Student } from '@/lib/types';

export function StudentFields({ s, kids = true }: { s?: Partial<Student>; kids?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Ime" name="first_name" required defaultValue={s?.first_name} autoComplete="off" />
      <Field label="Prezime" name="last_name" defaultValue={s?.last_name} autoComplete="off" />
      <Field label="Datum rođenja" name="birth_date" type="date" defaultValue={s?.birth_date} />
      <Field label="Upisan" name="joined_at" type="date" defaultValue={s?.joined_at} />
      <Field label="Telefon učenika" name="phone" type="tel" defaultValue={s?.phone} />
      <Field label="Email učenika" name="email" type="email" defaultValue={s?.email} />
      {kids && (
        <>
          <div className="sm:col-span-2 mt-2 text-[13px] font-extrabold uppercase tracking-wider text-mut">Roditelj ili staratelj</div>
          <Field label="Ime roditelja" name="parent_name" defaultValue={s?.parent_name} />
          <Field label="Telefon roditelja" name="parent_phone" type="tel" defaultValue={s?.parent_phone} />
          <div className="sm:col-span-2"><Field label="Email roditelja" name="parent_email" type="email" defaultValue={s?.parent_email} /></div>
        </>
      )}
      <div className="sm:col-span-2 mt-2 text-[13px] font-extrabold uppercase tracking-wider text-mut">Članarina</div>
      <Field label="Posebna mesečna cena (RSD)" name="custom_fee" type="number" step="1" min={0} defaultValue={s?.custom_fee} hint="Prazno = cena grupe" />
      <Field label="Popust (%)" name="discount_pct" type="number" step="1" min={0} max={100} defaultValue={s?.discount_pct ?? 0} hint="Popust za braću i sestre podesi u Podešavanjima" />
      <div className="sm:col-span-2"><TextArea label="Napomena" name="notes" defaultValue={s?.notes} placeholder="Alergije, posebne napomene, dogovori..." /></div>
    </div>
  );
}
