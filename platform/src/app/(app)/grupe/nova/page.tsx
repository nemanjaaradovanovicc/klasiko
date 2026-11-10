import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Select } from '@/components/ui';
import { GroupFields } from '@/components/group-form';
import { WEEKDAYS } from '@/lib/format';
import { createGroup } from '../actions';

export const metadata = { title: 'Nova grupa' };

export default async function NewGroup({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: teachers }, { data: rooms }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('org_id', ctx.org.id).eq('active', true).order('full_name'),
    supabase.from('rooms').select('id, name').eq('org_id', ctx.org.id).order('name'),
  ]);
  return (
    <>
      <PageHeader title="Nova grupa" back={{ href: '/grupe', label: 'Grupe' }} />
      <Flash err={sp.err} />
      <Card>
        <form action={createGroup} className="flex flex-col gap-5">
          <GroupFields teachers={teachers ?? []} rooms={rooms ?? []} g={{ monthly_fee: ctx.org.default_fee }} />
          <div>
            <div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-mut">Prvi termin (opciono, više termina dodaješ posle)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="sm:col-span-3 text-[12px] font-semibold text-mut">Za čas svake druge nedelje izaberi datum koji pada na izabrani dan.</p>
              <Select label="Dan" name="weekday" placeholder="—" options={WEEKDAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />
              <Select label="Ponavljanje" name="recurrence" defaultValue="weekly" options={[{ value: 'weekly', label: 'Svake nedelje' }, { value: 'biweekly', label: 'Svake druge nedelje' }]} />
              <label className="block"><span className="label">Datum jednog časa</span><input className="input" type="date" name="anchor_date" /></label>
              <label className="block"><span className="label">Od</span><input className="input" type="time" name="start_time" /></label>
              <label className="block"><span className="label">Do</span><input className="input" type="time" name="end_time" /></label>
            </div>
          </div>
          <div><button className="btn">Napravi grupu</button></div>
        </form>
      </Card>
    </>
  );
}
