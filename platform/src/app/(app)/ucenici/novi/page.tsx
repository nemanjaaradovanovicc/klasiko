import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Select } from '@/components/ui';
import { StudentFields } from '@/components/student-form';
import { todayISO } from '@/lib/format';
import { createStudent } from '../actions';

export const metadata = { title: 'Novi učenik' };

export default async function NewStudent({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; grupa?: string }> }) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: groups } = await supabase.from('groups').select('id,name').eq('org_id', ctx.org.id).eq('active', true).order('name');
  return (
    <>
      <PageHeader title="Novi učenik" back={{ href: '/ucenici', label: 'Učenici' }} />
      <Flash ok={sp.ok ? 'Učenik je dodat. Unesi sledećeg.' : undefined} err={sp.err} />
      <Card>
        <form action={createStudent} className="flex flex-col gap-4">
          <Select label="Grupa" name="group_id" defaultValue={sp.grupa ?? ''} placeholder="Bez grupe (dodaćeš kasnije)" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} />
          <StudentFields s={{ joined_at: todayISO(), discount_pct: 0 }} kids={ctx.org.kind !== 'edukativni_centar'} />
          <div className="flex flex-wrap gap-2">
            <button className="btn">Sačuvaj</button>
            <button className="btn btn-soft" name="again" value="1">Sačuvaj i dodaj još</button>
          </div>
        </form>
      </Card>
    </>
  );
}
