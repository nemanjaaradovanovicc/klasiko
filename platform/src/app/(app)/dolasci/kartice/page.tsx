import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { QrImage } from '@/components/qr-image';
import { PrintButton } from '@/components/print-button';
import { fullName } from '@/lib/format';
import { generateCards } from '../actions';

export const metadata = { title: 'QR kartice' };

export default async function Cards() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const { data: sts } = await supabase.from('students').select('id, first_name, last_name, checkin_code, group_members(groups(name))').eq('org_id', ctx.org.id).eq('active', true).order('last_name');
  type S = { id: string; first_name: string; last_name: string; checkin_code: string | null; group_members: { groups: { name: string } | null }[] };
  const list = (sts ?? []) as unknown as S[];
  const missing = list.filter((s) => !s.checkin_code).length;
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="QR kartice" subtitle="Odštampaj, iseci i daj svakom detetu ili roditelju" back={{ href: '/dolasci', label: 'Dolasci' }} actions={<PrintButton />} />
        {missing > 0 && (
          <form action={generateCards} className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="text-[14px] font-semibold text-ink-2">{missing} učenika još nema karticu.</span>
            <button className="btn">Napravi kartice</button>
          </form>
        )}
      </div>
      <style>{`@media print { @page { size: A4; margin: 10mm; } }`}</style>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
        {list.filter((s) => s.checkin_code).map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center ring-1 ring-line print:break-inside-avoid print:rounded-lg">
            <div className="truncate text-[11px] font-extrabold uppercase tracking-wider text-mut">{ctx.org.name}</div>
            <QrImage payload={`KLASIKO:${s.checkin_code}`} size={120} />
            <div className="w-full truncate text-[14px] font-extrabold text-ink">{fullName(s)}</div>
            <div className="w-full truncate text-[11px] font-semibold text-mut">{s.group_members.map((m) => m.groups?.name).filter(Boolean).join(', ')}</div>
          </div>
        ))}
      </div>
    </>
  );
}
