import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Field, Flash, TextArea } from '@/components/ui';
import { currentPeriod, formatMoney, formatTotals, moneyCurrency, parsePeriod, periodLabel, shiftPeriod } from '@/lib/format';
import { saveZoomExpense } from './actions';

export const metadata = { title: 'Zoom trošak' };

const OK: Record<string, string> = { '1': 'Zoom trošak je sačuvan.' };

export default async function ZoomExpense({ searchParams }: { searchParams: Promise<{ mesec?: string; ok?: string; err?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const period = sp.mesec ? parsePeriod(sp.mesec) : shiftPeriod(currentPeriod(), -1);
  const month = `${period}-01`;
  const code = moneyCurrency(ctx.org.currency);
  const supabase = await createClient();
  const [{ data: expenses }, { data: profiles }] = await Promise.all([
    supabase.from('teacher_expenses').select('teacher_id, amount, currency, note').eq('org_id', ctx.org.id).eq('month', month).eq('kind', 'zoom'),
    ctx.isOwner
      ? supabase.from('profiles').select('id, full_name, role, active').eq('org_id', ctx.org.id).in('role', ['teacher', 'owner']).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string; role: string; active: boolean }[] }),
  ]);
  type Row = { teacher_id: string; amount: number; currency: string | null; note: string | null };
  const rows = (expenses ?? []) as Row[];
  const byTeacher = new Map(rows.map((r) => [r.teacher_id, r]));
  const mine = byTeacher.get(ctx.userId);
  type Person = { id: string; full_name: string; role: string; active: boolean };
  const people = ((profiles ?? []) as Person[]).slice().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'sr'));
  const total = formatTotals(rows.map((r) => ({ amount: Number(r.amount), currency: r.currency || code })));

  return (
    <>
      <PageHeader
        title="Zoom trošak"
        subtitle={periodLabel(period)}
        actions={
          <>
            <Link href={`/zoom?mesec=${shiftPeriod(period, -1)}`} className="btn btn-soft">←</Link>
            {period !== shiftPeriod(currentPeriod(), -1) && <Link href="/zoom" className="btn btn-soft">Prošli mesec</Link>}
            <Link href={`/zoom?mesec=${shiftPeriod(period, 1)}`} className="btn btn-soft">→</Link>
          </>
        }
      />
      <Flash ok={sp.ok ? OK[sp.ok] ?? 'Sačuvano.' : undefined} err={sp.err} />
      <Card title={ctx.isOwner ? 'Iznos po predavaču' : 'Moj Zoom za ovaj mesec'}>
        <p className="mb-4 text-[14px] font-semibold text-mut">
          Upiši koliko je Zoom koštao u {periodLabel(period).toLowerCase()}. Iznos je u valuti škole ({code}). Nula znači da troška nije bilo.
          {ctx.isOwner && <> Ukupno: <b className="text-ink">{rows.length ? total : formatMoney(0, code)}</b>. Pregled je i u <Link href={`/izvestaji?mesec=${period}`} className="font-extrabold text-brand">izveštaju</Link>.</>}
        </p>
        {ctx.isOwner ? (
          people.length === 0 ? (
            <p className="text-[14px] font-semibold text-mut">U školi još nema predavača.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {people.map((p) => {
                const row = byTeacher.get(p.id);
                return (
                  <li key={p.id} className="py-4">
                    <form action={saveZoomExpense} className="grid gap-3 sm:grid-cols-[1fr_160px_1fr_auto] sm:items-end">
                      <input type="hidden" name="month" value={period} />
                      <input type="hidden" name="teacher_id" value={p.id} />
                      <div className="pb-2 font-extrabold text-ink">{p.full_name || 'Bez imena'}{p.role === 'owner' ? ' · vlasnik' : ''}{p.active ? '' : ' · neaktivan'}</div>
                      <Field label={`Iznos (${code})`} name="amount" type="number" min={0} step="0.01" required defaultValue={row ? Number(row.amount) : ''} />
                      <Field label="Napomena" name="note" defaultValue={row?.note ?? ''} placeholder="npr. Zoom Pro" />
                      <button className="btn">Sačuvaj</button>
                    </form>
                    {row && moneyCurrency(row.currency) !== code && <p className="mt-1 text-[12px] font-semibold text-mut">Sačuvano je {formatMoney(row.amount, row.currency)}. Novo čuvanje prepisuje valutu na {code}.</p>}
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <form action={saveZoomExpense} className="grid max-w-xl gap-3">
            <input type="hidden" name="month" value={period} />
            <Field label={`Iznos (${code})`} name="amount" type="number" min={0} step="0.01" required defaultValue={mine ? Number(mine.amount) : ''} />
            <TextArea label="Napomena" name="note" defaultValue={mine?.note} placeholder="npr. Zoom Pro" />
            {mine && <p className="text-[13px] font-semibold text-mut">Trenutno: {formatMoney(mine.amount, mine.currency || code)}. Možeš da izmeniš i sačuvaš ponovo.</p>}
            <div><button className="btn">Sačuvaj</button></div>
          </form>
        )}
      </Card>
    </>
  );
}
