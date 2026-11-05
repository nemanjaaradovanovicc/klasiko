import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Badge, Empty } from '@/components/ui';
import { attendanceStats, parsePeriod, periodLabel, rsd, shiftPeriod, fullName } from '@/lib/format';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { familyKey, familySuggestions } from '@/lib/families';
import { waUrl } from '@/lib/phone';
import { parentUrl } from '@/lib/parent';
import { createAllParentLinks, linkAllSuggestedFamilies } from '../ucenici/actions';

export const metadata = { title: 'Roditelji' };

// Mesečni izveštaj za roditelje: prisustvo i uplate po učeniku, slanje poruke sa linkom jednim dodirom.
export default async function ParentsPage({ searchParams }: { searchParams: Promise<{ mesec?: string; grupa?: string; ok?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const period = parsePeriod(sp.mesec);
  const supabase = await createClient();
  type S = { id: string; first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; parent_email: string | null; phone: string | null; family_id: string | null; group_members: { group_id: string }[] };
  const [sts, { data: groups }, links, att, charges] = await Promise.all([
    fetchAll<S>((a, b) => supabase.from('students').select('id, first_name, last_name, parent_name, parent_phone, parent_email, phone, family_id, group_members(group_id)').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b)),
    supabase.from('groups').select('id, name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    fetchAll<{ student_id: string; token: string; last_seen_at: string | null }>((a, b) => supabase.from('parent_links').select('student_id, token, last_seen_at').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)),
    fetchAll<{ student_id: string; session_id: string; status: string }>((a, b) => supabase.from('attendance').select('student_id, session_id, status, sessions!inner(date)').eq('org_id', ctx.org.id).gte('sessions.date', `${period}-01`).lt('sessions.date', `${shiftPeriod(period, 1)}-01`).order('session_id').order('student_id').range(a, b)),
    fetchAll<{ id: string; student_id: string; amount: number; payments: { amount: number }[] }>((a, b) => supabase.from('charges').select('id, student_id, amount, payments(amount)').eq('org_id', ctx.org.id).lte('period', period).order('id').range(a, b)),
  ]);
  const visible = sp.grupa ? sts.filter((s) => s.group_members.some((m) => m.group_id === sp.grupa)) : sts;
  const linkBy = new Map(links.map((l) => [l.student_id, l]));
  const attBy = new Map<string, { status: string }[]>();
  for (const a of att) attBy.set(a.student_id, [...(attBy.get(a.student_id) ?? []), a]);
  const debtBy = new Map<string, number>();
  for (const c of charges) {
    const rem = Math.max(0, Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0));
    debtBy.set(c.student_id, (debtBy.get(c.student_id) ?? 0) + rem);
  }

  // Jedan red po porodici: isti roditelj dobija jednu poruku i jedan link za svu decu.
  const families = new Map<string, S[]>();
  for (const s of visible) families.set(familyKey(s), [...(families.get(familyKey(s)) ?? []), s]);
  const allByFamily = new Map<string, S[]>();
  for (const s of sts) allByFamily.set(familyKey(s), [...(allByFamily.get(familyKey(s)) ?? []), s]);
  const rows = [...families.keys()].map((k) => allByFamily.get(k)!);
  const missing = rows.filter((kids) => !kids.some((s) => linkBy.has(s.id))).length;
  const suggestions = familySuggestions(sts);
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
            Svaki roditelj dobija lični link: raspored, prisustvo, izveštaj za mesec, dugovanje i QR kod za uplatu, bez lozinke. Braća i sestre dele jedan link. Dugme pored učenika otvara WhatsApp sa gotovim izveštajem.
          </p>
          {missing > 0 && (
            <form action={createAllParentLinks} className="shrink-0"><button className="btn">Napravi linkove ({missing})</button></form>
          )}
        </div>
      </Card>
      {suggestions.length > 0 && (
        <Card className="mb-5" title={`Moguće porodice (${suggestions.length})`}>
          <p className="text-[14px] font-semibold text-ink-2">Ovi učenici imaju isti telefon ili email roditelja. Proveri spisak pre povezivanja, jer će roditelj na jednom linku videti svu povezanu decu.</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {suggestions.slice(0, 20).map((list) => <li key={list[0].id} className="text-[14px] font-bold text-ink">{list.map(fullName).join(', ')}</li>)}
          </ul>
          <form action={linkAllSuggestedFamilies} className="mt-3"><button className="btn btn-soft">Poveži sve predložene</button></form>
        </Card>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="mesec" value={period} />
        <select name="grupa" defaultValue={sp.grupa ?? ''} className="input w-auto">
          <option value="">Sve grupe</option>
          {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="btn btn-soft">Prikaži</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Nema učenika" text="Dodaj učenike pa ovde šalješ mesečne izveštaje roditeljima." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((kids) => {
            const first = kids[0];
            const debt = kids.reduce((a, s) => a + (debtBy.get(s.id) ?? 0), 0);
            const link = kids.map((s) => linkBy.get(s.id)).find(Boolean);
            const phone = kids.map((s) => s.parent_phone || s.phone).find(Boolean);
            const parent = kids.map((s) => s.parent_name).find(Boolean);
            const allAtt = attendanceStats(kids.flatMap((s) => attBy.get(s.id) ?? []));
            const msg = [
              `Dobar dan! Mesečni izveštaj za ${label}:`,
              ...kids.map((s) => {
                const st = attendanceStats(attBy.get(s.id) ?? []);
                return `${fullName(s)}: ${st.counted ? `prisustvo ${st.pct}% (${st.present} od ${st.counted} časova)` : 'nema upisanih časova'}.`;
              }),
              debt > 0 ? `Za uplatu: ${rsd(debt)}.` : 'Članarina je plaćena, hvala!',
              link ? `Detalji${debt > 0 ? ' i QR kod za uplatu' : ''}: ${parentUrl(link.token)}` : '',
              ctx.org.name,
            ].filter(Boolean).join('\n');
            return (
              <li key={first.id} className="card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {kids.map((s) => <Link key={s.id} href={`/ucenici/${s.id}`} className="block truncate font-extrabold text-ink hover:text-brand">{fullName(s)}</Link>)}
                    <div className="truncate text-[12px] font-semibold text-mut">{parent ?? 'Roditelj nije upisan'}{link?.last_seen_at ? ' · otvarao link' : ''}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={allAtt.pct === null ? 'gray' : allAtt.pct < 70 ? 'coral' : 'ok'}>{allAtt.pct === null ? 'bez časova' : `${allAtt.pct}%`}</Badge>
                    {debt > 0 ? <Badge tone="coral">{rsd(debt)}</Badge> : <Badge tone="ok">plaćeno</Badge>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {phone ? (
                    <a className="btn btn-sm bg-[#1FA855] hover:bg-[#178a45]" target="_blank" rel="noopener" href={waUrl(phone, msg)}>Pošalji izveštaj</a>
                  ) : (
                    <Link href={`/ucenici/${first.id}`} className="btn btn-sm btn-soft">Dodaj telefon roditelja</Link>
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
