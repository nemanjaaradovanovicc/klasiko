import { Field, Select } from '@/components/ui';
import { moneyCurrency } from '@/lib/format';
import { GROUP_LESSON_TYPES, LESSON_KIND_LABEL } from '@/lib/lessons';
import { FEE_TYPE_LABEL, type Group } from '@/lib/types';

export const COLORS = ['#5B2A86', '#FF6B5E', '#2F7DBF', '#1F9D6B', '#E0A21B', '#C2417B', '#6B7280', '#0E9AA7'];

export function GroupFields({ g, teachers, rooms, currency, packagesOnly = false }: { g?: Partial<Group>; teachers: { id: string; full_name: string }[]; rooms: { id: string; name: string }[]; currency?: string | null; packagesOnly?: boolean }) {
  const code = moneyCurrency(currency);
  const feeOptions = Object.entries(FEE_TYPE_LABEL)
    .filter(([value]) => !packagesOnly || value !== 'monthly' || g?.fee_type === 'monthly')
    .map(([value, label]) => ({ value, label }));
  const feeType = g?.fee_type && feeOptions.some((o) => o.value === g.fee_type) ? g.fee_type : packagesOnly ? 'package' : 'monthly';
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Naziv grupe" name="name" required defaultValue={g?.name} placeholder="npr. Engleski B1, utorak i četvrtak" /></div>
        <Field label="Nivo ili uzrast" name="level" defaultValue={g?.level} placeholder="npr. B1, 7 do 9 godina, žuti pojas" />
        <Select label="Predavač" name="teacher_id" defaultValue={g?.teacher_id ?? ''} placeholder="Bez predavača" options={teachers.map((t) => ({ value: t.id, label: t.full_name }))} />
        <Select label="Sala" name="room_id" defaultValue={g?.room_id ?? ''} placeholder="Bez sale" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
        <div>
          <Select label="Vrsta časa" name="lesson_type" defaultValue={g?.lesson_type ?? ''} placeholder="Automatski" options={GROUP_LESSON_TYPES.map((value) => ({ value, label: LESSON_KIND_LABEL[value] }))} />
          <p className="mt-1 text-[12px] font-semibold text-mut">Automatski: otvorena grupa je radionica, jedan aktivan učenik individualni, dva duo, ostalo grupni.</p>
        </div>
        <Select label="Način naplate" name="fee_type" defaultValue={feeType} options={feeOptions} />
        {packagesOnly ? null : (
          <Field label={`Cena (${code})`} name="monthly_fee" type="number" min={0} step="1" defaultValue={g?.monthly_fee} hint={code === 'EUR' ? 'Mesečna članarina u evrima. Pakete definišeš na stranici Paketi.' : 'Mesečna članarina u dinarima. Pakete definišeš na stranici Paketi.'} />
        )}
        <Field label="Časova u paketu" name="package_classes" type="number" min={1} step="1" defaultValue={g?.package_classes} hint="Podrazumevani broj kad grupa ide na paket. Pravi paketi su na stranici Paketi." />
        <label className="flex items-start gap-3 sm:col-span-2">
          <input type="checkbox" name="drop_in" defaultChecked={!!g?.drop_in} className="mt-1 h-5 w-5 accent-[#5B2A86]" />
          <span className="text-[14px] font-semibold text-ink-2"><b className="text-ink">Otvorena grupa</b>. Nema stalnih članova: na čas se dodaju deca samo za taj termin (radionica, prijava pred čas).</span>
        </label>
        <Field label="Maksimalan broj učenika" name="capacity" type="number" min={1} defaultValue={g?.capacity} />
        <div>
          <span className="label">Boja u rasporedu</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="color" value={c} defaultChecked={(g?.color ?? COLORS[0]) === c} className="peer sr-only" />
                <span className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink" style={{ background: c }} />
              </label>
            ))}
          </div>
        </div>
      </div>
      {packagesOnly && <input type="hidden" name="monthly_fee" value={g?.monthly_fee ?? ''} />}
    </>
  );
}
