import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty, Badge, Flash, Table } from '@/components/ui';
import { fullName, dateSr } from '@/lib/format';
import { PLANS } from '@/lib/types';

export const metadata = { title: 'Učenici' };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; grupa?: string; status?: string; ok?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const showInactive = sp.status === 'ispisani';
  let query = supabase
    .from('students')
    .select('id, first_name, last_name, parent_name, parent_phone, phone, joined_at, active, group_members(group_id, groups(name, color))')
    .eq('org_id', ctx.org.id)
    .eq('active', !showInactive)
    .order('last_name')
    .order('first_name')
    .limit(1000);
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, ' ').trim();
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,parent_name.ilike.%${q}%,phone.ilike.%${q}%,parent_phone.ilike.%${q}%`);
  }
  const [{ data: students }, { data: groups }] = await Promise.all([
    query,
    supabase.from('groups').select('id,name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
  ]);
  type Row = { id: string; first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; phone: string | null; joined_at: string; group_members: { group_id: string; groups: { name: string; color: string } | null }[] };
  let list = (students ?? []) as unknown as Row[];
  if (sp.grupa) list = list.filter((s) => s.group_members.some((m) => m.group_id === sp.grupa));
  const limit = PLANS[ctx.org.plan].students;

  return (
    <>
      <PageHeader
        title="Učenici"
        subtitle={<>{list.length} {showInactive ? 'ispisanih' : 'aktivnih'}{!showInactive && limit ? ` · paket ${PLANS[ctx.org.plan].name} do ${limit}` : ''}</>}
        actions={ctx.isOwner && (
          <>
            <Link href="/ucenici/uvoz" className="btn btn-soft">Uvoz iz Excel-a</Link>
            <Link href="/ucenici/novi" className="btn">+ Novi učenik</Link>
          </>
        )}
      />
      <Flash ok={sp.ok === 'obrisan' ? 'Učenik je obrisan.' : undefined} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Pretraži po imenu ili telefonu" className="input max-w-xs flex-1" />
        <select name="grupa" defaultValue={sp.grupa ?? ''} className="input w-auto">
          <option value="">Sve grupe</option>
          {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className="input w-auto">
          <option value="">Aktivni</option>
          <option value="ispisani">Ispisani</option>
        </select>
        <button className="btn btn-soft">Filtriraj</button>
      </form>
      {list.length === 0 ? (
        <Empty
          title={sp.q || sp.grupa ? 'Nema rezultata' : 'Još nema učenika'}
          text={sp.q || sp.grupa ? 'Probaj drugačiju pretragu.' : 'Dodaj prvog učenika ili uvezi spisak iz Excel-a.'}
          action={!sp.q && !sp.grupa && ctx.isOwner ? <Link href="/ucenici/novi" className="btn">+ Novi učenik</Link> : undefined}
        />
      ) : (
        <Table head={['Ime i prezime', 'Grupe', 'Roditelj / kontakt', 'Upisan']}>
          {list.map((s) => (
            <tr key={s.id} className="hover:bg-soft/60">
              <td className="td"><Link href={`/ucenici/${s.id}`} className="font-extrabold text-ink hover:text-brand">{fullName(s)}</Link></td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  {s.group_members.length === 0 ? <span className="text-[13px] font-semibold text-mut">bez grupe</span> : s.group_members.map((m) => m.groups && (
                    <Badge key={m.group_id}><span className="h-2 w-2 rounded-full" style={{ background: m.groups.color }} />{m.groups.name}</Badge>
                  ))}
                </div>
              </td>
              <td className="td text-[14px]">
                <div className="font-semibold text-ink-2">{s.parent_name ?? ''}</div>
                {(s.parent_phone || s.phone) && <a href={`tel:${s.parent_phone || s.phone}`} className="font-bold text-brand">{s.parent_phone || s.phone}</a>}
              </td>
              <td className="td text-[14px] font-semibold text-mut">{dateSr(s.joined_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
