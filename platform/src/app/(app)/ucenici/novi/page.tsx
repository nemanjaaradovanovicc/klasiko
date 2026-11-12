import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Select } from '@/components/ui';
import { StudentFields } from '@/components/student-form';
import { dateSr, todayISO } from '@/lib/format';
import { createStudent } from '../actions';

export const metadata = { title: 'Novi učenik' };

export default async function NewStudent({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; grupa?: string; probni?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const trialId = sp.probni && /^[0-9a-f-]{36}$/i.test(sp.probni) ? sp.probni : null;
  const [{ data: groups }, { data: trial }] = await Promise.all([
    supabase.from('groups').select('id,name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    // Upis posle probnog časa: podaci kandidata se prenose u formu.
    trialId ? supabase.from('trial_lessons').select('id, date, group_id, first_name, last_name, phone, email, student_id').eq('id', trialId).eq('org_id', ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const fromTrial = trial && !trial.student_id ? trial : null;
  return (
    <>
      <PageHeader title="Novi učenik" back={fromTrial ? { href: `/probni?mesec=${fromTrial.date.slice(0, 7)}`, label: 'Probni časovi' } : { href: '/ucenici', label: 'Učenici' }} />
      <Flash ok={sp.ok ? 'Učenik je dodat. Unesi sledećeg.' : undefined} err={sp.err} />
      {fromTrial && (
        <div className="mb-5 rounded-2xl bg-soft-2 px-4 py-3 text-[15px] font-bold text-brand">
          Upis posle probnog časa od {dateSr(fromTrial.date)} Kad sačuvaš, probni čas dobija ishod „upisao/la se”.
        </div>
      )}
      <Card>
        <form action={createStudent} className="flex flex-col gap-4">
          {fromTrial && <input type="hidden" name="trial_id" value={fromTrial.id} />}
          <Select label="Grupa" name="group_id" defaultValue={sp.grupa ?? fromTrial?.group_id ?? ''} placeholder="Bez grupe (dodaćeš kasnije)" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} />
          <StudentFields s={{ joined_at: todayISO(), discount_pct: 0, ...(fromTrial ? { first_name: fromTrial.first_name, last_name: fromTrial.last_name, phone: fromTrial.phone, email: fromTrial.email } : {}) }} kids={ctx.org.kind !== 'edukativni_centar'} />
          <div className="flex flex-wrap gap-2">
            <button className="btn">Sačuvaj</button>
            {!fromTrial && <button className="btn btn-soft" name="again" value="1">Sačuvaj i dodaj još</button>}
          </div>
        </form>
      </Card>
    </>
  );
}
