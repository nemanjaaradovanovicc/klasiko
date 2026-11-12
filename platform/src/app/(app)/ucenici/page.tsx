import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Empty, Badge, Flash, Table } from '@/components/ui';
import { fullName, dateSr } from '@/lib/format';
import { PLANS } from '@/lib/types';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { matchesSearch } from '@/lib/match';
import { NO_TEACHER, isWithTeacher, studentsPerTeacher } from '@/lib/students';

export const metadata = { title: 'Učenici' };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; grupa?: string; status?: string; predavac?: string; ok?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const showInactive = sp.status === 'ispisani';
  type Row = { id: string; first_name: string; last_name: string; parent_name: string | null; parent_phone: string | null; phone: string | null; joined_at: string; group_members: { group_id: string; groups: { name: string; color: string; teacher_id: string | null; active: boolean } | null }[] };
  const [students, { data: groups }, { data: profiles }] = await Promise.all([
    fetchAll<Row>((a, b) => supabase
      .from('students')
      .select('id, first_name, last_name, parent_name, parent_phone, phone, joined_at, active, group_members(group_id, groups(name, color, teacher_id, active))')
      .eq('org_id', ctx.org.id)
      .eq('active', !showInactive)
      .order('last_name')
      .order('first_name')
      .order('id')
      .range(a, b)),
    supabase.from('groups').select('id,name,teacher_id').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    // Pregled po predavaču je za vlasnika: predavač ionako vidi samo svoje učenike.
    ctx.isOwner ? supabase.from('profiles').select('id, full_name, role, active').eq('org_id', ctx.org.id).order('full_name') : Promise.resolve({ data: null }),
  ]);
  const perTeacher = studentsPerTeacher(students);
  const teachers = showInactive ? [] : (profiles ?? [])
    .filter((p) => perTeacher.has(p.id) || (p.active && p.role === 'teacher'))
    .map((p) => ({ id: p.id, name: p.full_name || 'Bez imena', count: perTeacher.get(p.id) ?? 0 }));
  const unassigned = showInactive ? 0 : perTeacher.get(NO_TEACHER) ?? 0;
  const teacher = sp.predavac === NO_TEACHER && unassigned ? NO_TEACHER : teachers.find((t) => t.id === sp.predavac)?.id ?? null;
  const teacherName = teacher === NO_TEACHER ? 'bez predavača' : teachers.find((t) => t.id === teacher)?.name;
  const groupOptions = (groups ?? []).filter((g) => !teacher || (teacher === NO_TEACHER ? !g.teacher_id : g.teacher_id === teacher));
  let list = students;
  if (teacher) list = list.filter((s) => isWithTeacher(s, teacher));
  // Pretraga bez obzira na kvačice: „Petrovic” nalazi „Petrović”.
  if (sp.q?.trim()) list = list.filter((s) => matchesSearch(`${s.first_name} ${s.last_name} ${s.parent_name ?? ''} ${s.phone ?? ''} ${s.parent_phone ?? ''}`, sp.q!));
  if (sp.grupa) list = list.filter((s) => s.group_members.some((m) => m.group_id === sp.grupa));
  const limit = PLANS[ctx.org.plan].students;

  return (
    <>
      <PageHeader
        title="Učenici"
        subtitle={<>{list.length} {showInactive ? 'ispisanih' : 'aktivnih'}{teacherName ? ` · ${teacherName}` : !showInactive && limit ? ` · paket ${PLANS[ctx.org.plan].name} do ${limit}` : ''}</>}
        actions={ctx.isOwner && (
          <>
            <Link href="/ucenici/uvoz" className="btn btn-soft">Uvoz iz Excel-a</Link>
            <Link href="/ucenici/novi" className="btn">+ Novi učenik</Link>
          </>
        )}
      />
      <Flash ok={sp.ok === 'obrisan' ? 'Učenik je obrisan.' : undefined} />
      {(teachers.length > 0 || unassigned > 0) && (
        <nav className="mb-3 flex flex-wrap items-center gap-2" aria-label="Učenici po predavaču">
          <Link href="/ucenici" className={`btn btn-sm ${teacher ? 'btn-soft' : ''}`}>Svi · {students.length}</Link>
          {teachers.map((t) => (
            <Link key={t.id} href={`/ucenici?predavac=${t.id}`} className={`btn btn-sm ${teacher === t.id ? '' : 'btn-soft'}`}>{t.name} · {t.count}</Link>
          ))}
          {unassigned > 0 && <Link href={`/ucenici?predavac=${NO_TEACHER}`} className={`btn btn-sm ${teacher === NO_TEACHER ? '' : 'btn-soft'}`}>Bez predavača · {unassigned}</Link>}
        </nav>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        {teacher && <input type="hidden" name="predavac" value={teacher} />}
        <input name="q" defaultValue={sp.q} placeholder="Pretraži po imenu ili telefonu" className="input max-w-xs flex-1" />
        <select name="grupa" defaultValue={sp.grupa ?? ''} className="input w-auto">
          <option value="">Sve grupe</option>
          {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className="input w-auto">
          <option value="">Aktivni</option>
          <option value="ispisani">Ispisani</option>
        </select>
        <button className="btn btn-soft">Filtriraj</button>
      </form>
      {list.length === 0 ? (
        <Empty
          title={sp.q || sp.grupa ? 'Nema rezultata' : teacher ? 'Nema učenika kod ovog predavača' : 'Još nema učenika'}
          text={sp.q || sp.grupa ? 'Probaj drugačiju pretragu.' : teacher ? 'Učenik se vodi kod predavača kad je u nekoj njegovoj grupi. Predavača grupe menjaš na stranici Grupe.' : 'Dodaj prvog učenika ili uvezi spisak iz Excel-a.'}
          action={!sp.q && !sp.grupa && !teacher && ctx.isOwner ? <Link href="/ucenici/novi" className="btn">+ Novi učenik</Link> : undefined}
        />
      ) : (
        <>
        <ul className="flex flex-col gap-2 md:hidden">
          {list.map((s) => (
            <li key={s.id}>
              <Link href={`/ucenici/${s.id}`} className="card flex items-center gap-3 p-3.5 active:bg-soft">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft-2 text-[14px] font-extrabold text-brand">{(s.first_name[0] ?? '') + (s.last_name[0] ?? '')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold text-ink">{fullName(s)}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {s.group_members.length === 0 ? <span className="text-[12px] font-semibold text-mut">bez grupe</span> : s.group_members.slice(0, 3).map((m) => m.groups && (
                      <span key={m.group_id} className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.groups.color }} />{m.groups.name}</span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-mut" aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
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
        </div>
        </>
      )}
    </>
  );
}
