import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Badge, Empty } from '@/components/ui';
import { currentPeriod, periodLabel, rsd, shiftPeriod, fullName } from '@/lib/format';
import { parentUrl, intlPhone } from '@/lib/parent';
import { createAllParentLinks } from '../ucenici/actions';

export const metadata = { title: 'Roditelji' };

// Mesečni izveštaj za roditelje: prisustvo i uplate po učeniku, slanje poruke sa linkom jednim dodirom.
export default async function ParentsPage({ searchParams }: { searchParams: Promise<{ mesec?: string; grupa?: string; ok?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const period = sp.mesec && /^\d{4}-\d{2}$/.test(sp.mesec) ? sp.mesec : currentPeriod();
  const supabase = await createClient();
  const [{ data: sts }, { data: groups }, { data: links }, { data: att }, { data: charges }] = await Promise.all([
    supabase.from('students').select('id, first_name, last_name, parent_name, parent_phone, phone, group_members(group_id)').eq('org_id', ctx.org.id).eq('active', true).order('last_name'),
    supabase.from('groups').select('id, name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('parent_links').select('student_id, token, last_seen_at').eq('org_id', ctx.org.id).eq('revoked', false),
    supabase.from('attendance').select('student_id, status, sessions!inner(date)').eq('org_id', ctx.org.id).gte('sessions.date', `${period}-01`).lt('sessions.date', `${shiftPeriod(period, 1)}-01`).limit(5000),
    supabase.from('charges').select('student_id, amount, payments(amount)').eq('org_id', ctx.org.id).lte('period', period),
  ]);
  type S = { id: string; first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; phone: string | null; group_members: { group_id: string }[] };
  let list = (sts ?? []) as unknown as S[];
  if (sp.grupa) list = list.filter((s) => s.group_members.some((m) => m.group_id === sp.grupa));
  const linkBy = new Map((links ?? []).map((l) => [l.student_id, l]));
  const attBy = new Map<string, { present: number; counted: number }>();
  for (const a of (att ?? []) as { student_id: string; status: string }[]) {
    const r = attBy.get(a.student_id) ?? { present: 0, counted: 0 };
    if (a.status !== 'excused') r.counted++;
    if (a.status === 'present') r.present++;
    attBy.set(a.student_id, r);
  }
  const debtBy = new Map<string, number>();
  for (const c of (charges ?? []) as unknown as { student_id: string; amount: number; payments: { amount: number }[] }[]) {
    const rem = Math.max(0, Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0));
    debtBy.set(c.student_id, (debtBy.get(c.student_id) ?? 0) + rem);
  }
  const missing = list.filter((s) => !linkBy.has(s.id)).length;
  const label = periodLabel(period).toLowerCase();

  return (
    <>
      <PageHeader
        title="Roditelji"
        subtitle={`Mesečni izveštaj i lični linkovi, ${label}`}
        actions={
          <>
            <Link href={`/roditelji?mesec=${shiftPeriod(period, -1)}${sp.grupa ? `&grupa=${sp.grupa}` : ''}`} className="btn btn-soft" aria-label="Prethodni mesec">←</Link>
            <Link href={`/roditelji?mesec=${shiftPeriod(period, 1)}${sp.grupa ? `&grupa=${sp.grupa}` : ''}`} className="btn btn-soft" aria-label="Sledeći mesec">→</Link>
          </>
        }
      />
      <Flash ok={sp.ok} />
      <Card className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] font-semibold text-ink-2">
            Svaki roditelj dobija lični link: raspored, prisustvo, izveštaj za mesec, dugovanje i QR kod za uplatu, bez lozinke. Dugme pored učenika otvara WhatsApp sa gotovim izveštajem.
          </p>
          {missing > 0 && (
            <form action={createAllParentLinks} className="shrink-0"><button className="btn">Napravi linkove za {missing} učenika</button></form>
          )}
        </div>
      </Card>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="mesec" value={period} />
        <select name="grupa" defaultValue={sp.grupa ?? ''} className="input w-auto">
          <option value="">Sve grupe</option>
          {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="btn btn-soft">Prikaži</button>
      </form>
      {list.length === 0 ? (
        <Empty title="Nema učenika" text="Dodaj učenike pa ovde šalješ mesečne izveštaje roditeljima." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((s) => {
            const a = attBy.get(s.id);
            const pct = a && a.counted ? Math.round((a.present / a.counted) * 100) : null;
            const debt = debtBy.get(s.id) ?? 0;
            const link = linkBy.get(s.id);
            const phone = s.parent_phone || s.phone;
            const msg = [
              `Dobar dan! Mesečni izveštaj za ${fullName(s)}, ${label}:`,
              a && a.counted ? `Prisustvo ${pct}% (${a.present} od ${a.counted} časova).` : 'U ovom mesecu nema upisanih časova.',
              debt > 0 ? `Za uplatu: ${rsd(debt)}.` : 'Članarina je plaćena, hvala!',
              link ? `Detalji${debt > 0 ? ' i QR kod za uplatu' : ''}: ${parentUrl(link.token)}` : '',
              ctx.org.name,
            ].filter(Boolean).join('\n');
            return (
              <li key={s.id} className="card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/ucenici/${s.id}`} className="block truncate font-extrabold text-ink hover:text-brand">{fullName(s)}</Link>
                    <div className="truncate text-[12px] font-semibold text-mut">{s.parent_name ?? 'Roditelj nije upisan'}{link?.last_seen_at ? ' · otvarao link' : ''}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={pct === null ? 'gray' : pct < 70 ? 'coral' : 'ok'}>{pct === null ? 'bez časova' : `${pct}%`}</Badge>
                    {debt > 0 ? <Badge tone="coral">{rsd(debt)}</Badge> : <Badge tone="ok">plaćeno</Badge>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {phone ? (
                    <a className="btn btn-sm bg-[#1FA855] hover:bg-[#178a45]" target="_blank" rel="noopener" href={`https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(msg)}`}>Pošalji izveštaj</a>
                  ) : (
                    <Link href={`/ucenici/${s.id}`} className="btn btn-sm btn-soft">Dodaj telefon roditelja</Link>
                  )}
                  {link && <a className="btn btn-sm btn-ghost" href={parentUrl(link.token)} target="_blank" rel="noopener">Pogledaj kao roditelj</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
