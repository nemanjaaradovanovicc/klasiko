import { Field, Select } from '@/components/ui';
import type { Group } from '@/lib/types';

export const COLORS = ['#5B2A86', '#FF6B5E', '#2F7DBF', '#1F9D6B', '#E0A21B', '#C2417B', '#6B7280', '#0E9AA7'];

export function GroupFields({ g, teachers, rooms }: { g?: Partial<Group>; teachers: { id: string; full_name: string }[]; rooms: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Naziv grupe" name="name" required defaultValue={g?.name} placeholder="npr. Engleski B1, utorak i četvrtak" /></div>
      <Field label="Nivo ili uzrast" name="level" defaultValue={g?.level} placeholder="npr. B1, 7 do 9 godina, žuti pojas" />
      <Select label="Predavač" name="teacher_id" defaultValue={g?.teacher_id ?? ''} placeholder="Bez predavača" options={teachers.map((t) => ({ value: t.id, label: t.full_name }))} />
      <Select label="Sala" name="room_id" defaultValue={g?.room_id ?? ''} placeholder="Bez sale" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
      <Field label="Mesečna cena (RSD)" name="monthly_fee" type="number" min={0} step="1" defaultValue={g?.monthly_fee} />
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
  );
}
