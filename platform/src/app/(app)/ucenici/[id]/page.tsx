import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Badge, Stat } from '@/components/ui';
import { StudentFields } from '@/components/student-form';
import { fullName, dateSr, rsd, periodLabel } from '@/lib/format';
import type { Student } from '@/lib/types';
import { updateStudent, setStudentActive, deleteStudent, addToGroup, removeFromGroup, createParentLink, revokeParentLink } from '../actions';
import { CopyButton } from '@/components/copy-button';
import { parentUrl, intlPhone } from '@/lib/parent';

const OK: Record<string, string> = { '1': 'Sačuvano.', novi: 'Učenik je dodat.', ispisan: 'Učenik je ispisan i uklonjen iz grupa.', aktivan: 'Učenik je ponovo aktivan.', link: 'Link za roditelje je napravljen. Pošalji ga roditelju.', ugasen: 'Link je poništen i više ne radi.' };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: s }, { data: members }, { data: groups }, { data: att }, { data: charges }, { data: payments }, { data: plink }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).eq('org_id', ctx.org.id).single<Student>(),
    supabase.from('group_members').select('group_id, joined_at, groups(name, color, monthly_fee)').eq('student_id', id),
    supabase.from('groups').select('id,name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('attendance').select('status, sessions(date, group_id, groups(name))').eq('student_id', id).limit(500),
    supabase.from('charges').select('id, period, amount, description, groups(name)').eq('student_id', id).order('period', { ascending: false }).limit(36),
    supabase.from('payments').select('id, amount, paid_at, method, charge_id, note').eq('student_id', id).order('paid_at', { ascending: false }).limit(100),
    supabase.from('parent_links').select('token, last_seen_at').eq('student_id', id).eq('revoked', false).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!s) notFound();

  type M = { group_id: string; joined_at: string; groups: { name: string; color: string; monthly_fee: number | null } | null };
  const mem = (members ?? []) as unknown as M[];
  const inGroups = new Set(mem.map((m) => m.group_id));
  type A = { status: string; sessions: { date: string; group_id: string; groups: { name: string } | null } | null };
  const attList = ((att ?? []) as unknown as A[]).filter((a) => a.sessions).sort((a, b) => b.sessions!.date.localeCompare(a.sessions!.date));
  const present = attList.filter((a) => a.status === 'present').length;
  const rate = attList.length ? Math.round((present / attList.length) * 100) : null;
  type C = { id: string; period: string; amount: number; description: string | null; groups: { name: string } | null };
  const chs = (charges ?? []) as unknown as C[];
  const pays = payments ?? [];
  const paidByCharge = new Map<string, number>();
  for (const p of pays) if (p.charge_id) paidByCharge.set(p.charge_id, (paidByCharge.get(p.charge_id) ?? 0) + Number(p.amount));
  const totalDue = chs.reduce((a, c) => a + Number(c.amount), 0);
  const totalPaid = pays.reduce((a, p) => a + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  return (
    <>
      <PageHeader
        title={fullName(s)}
        subtitle={<>{s.active ? 'Aktivan' : `Ispisan ${dateSr(s.left_at)}`} · upisan {dateSr(s.joined_at)}</>}
        back={{ href: '/ucenici', label: 'Učenici' }}
        actions={(
          <>
            <Link href={`/ucenici/${s.id}/diploma`} className="btn btn-soft">Diploma</Link>
            {(s.parent_phone || s.phone) && <a className="btn btn-soft" href={`tel:${s.parent_phone || s.phone}`}>Pozovi</a>}
            {(s.parent_phone || s.phone) && <a className="btn btn-soft" href={`https://wa.me/${String(s.parent_phone || s.phone).replace(/\D/g, '').replace(/^0/, '381')}`} target="_blank" rel="noopener">WhatsApp</a>}
          </>
        )}
      />
      <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prisustvo" value={rate === null ? '—' : `${rate}%`} hint={`${present} od ${attList.length} časova`} />
        <Stat label="Grupe" value={mem.length} />
        <Stat label="Ukupno uplaćeno" value={rsd(totalPaid)} />
        <Stat label={balance > 0 ? 'Duguje' : 'Stanje'} value={rsd(Math.abs(balance))} tone={balance > 0 ? 'coral' : 'ok'} hint={balance < 0 ? 'u plusu' : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="Podaci">
          <form action={updateStudent} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={s.id} />
            <StudentFields s={s} kids={ctx.org.kind !== 'edukativni_centar'} />
            <div><button className="btn">Sačuvaj izmene</button></div>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Link za roditelje">
            <div id="roditelj" className="scroll-mt-24" />
            <p className="text-[14px] font-semibold text-ink-2">Roditelj bez lozinke vidi raspored, prisustvo, izveštaj za mesec, šta duguje i QR kod za uplatu.</p>
            {plink ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="truncate rounded-xl bg-soft px-3 py-2 text-[13px] font-bold text-brand">{parentUrl(plink.token)}</div>
                <div className="text-[12px] font-semibold text-mut">{plink.last_seen_at ? `Roditelj je poslednji put otvorio ${dateSr(plink.last_seen_at.slice(0, 10))}` : 'Roditelj još nije otvorio link'}</div>
                <div className="flex flex-wrap gap-2">
                  {(s.parent_phone || s.phone) && (
                    <a className="btn btn-sm bg-[#1FA855] hover:bg-[#178a45]" target="_blank" rel="noopener" href={`https://wa.me/${intlPhone(s.parent_phone || s.phone)}?text=${encodeURIComponent(`Dobar dan! Ovo je lični link na kome vidite raspored, prisustvo i uplate za ${fullName(s)}: ${parentUrl(plink.token)}\n${ctx.org.name}`)}`}>Pošalji na WhatsApp</a>
                  )}
                  <CopyButton text={parentUrl(plink.token)} />
                  <form action={revokeParentLink}><input type="hidden" name="student_id" value={s.id} /><button className="btn btn-sm btn-ghost text-coral-dark">Poništi link</button></form>
                </div>
              </div>
            ) : (
              <form action={createParentLink} className="mt-3"><input type="hidden" name="student_id" value={s.id} /><button className="btn btn-sm">Napravi link za roditelje</button></form>
            )}
          </Card>

          <Card title="Grupe">
            <ul className="mb-4 flex flex-col gap-2">
              {mem.length === 0 && <li className="text-[14px] font-semibold text-mut">Nije ni u jednoj grupi.</li>}
              {mem.map((m) => (
                <li key={m.group_id} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2">
                  <Link href={`/grupe/${m.group_id}`} className="flex items-center gap-2 font-bold text-ink hover:text-brand">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.groups?.color }} />
                    {m.groups?.name}
                  </Link>
                  <form action={removeFromGroup}>
                    <input type="hidden" name="student_id" value={s.id} />
                    <input type="hidden" name="group_id" value={m.group_id} />
                    <button className="text-[13px] font-bold text-coral-dark hover:underline">Ukloni</button>
                  </form>
                </li>
              ))}
            </ul>
            {s.active && (
              <form action={addToGroup} className="flex gap-2">
                <input type="hidden" name="student_id" value={s.id} />
                <select name="group_id" className="input" defaultValue="">
                  <option value="">Dodaj u grupu...</option>
                  {(groups ?? []).filter((g) => !inGroups.has(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button className="btn btn-soft">Dodaj</button>
              </form>
            )}
          </Card>

          <Card title="Članarine" actions={<Link href="/uplate" className="text-[13px] font-bold text-brand">Sve uplate →</Link>}>
            {chs.length === 0 ? (
              <p className="text-[14px] font-semibold text-mut">Još nema zaduženja.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {chs.map((c) => {
                  const paid = paidByCharge.get(c.id) ?? 0;
                  const ok = paid >= Number(c.amount);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <div className="text-[14px] font-bold text-ink">{periodLabel(c.period)}</div>
                        <div className="text-[12px] font-semibold text-mut">{c.groups?.name ?? c.description ?? ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[14px] font-bold tabular-nums">{rsd(c.amount)}</div>
                        <Badge tone={ok ? 'ok' : paid > 0 ? 'soft' : 'coral'}>{ok ? 'Plaćeno' : paid > 0 ? `Uplaćeno ${rsd(paid)}` : 'Nije plaćeno'}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Prisustvo po mesecima">
            {attList.length === 0 ? (
              <p className="text-[14px] font-semibold text-mut">Još nema zabeleženog prisustva.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {Array.from(new Set(attList.map((a) => a.sessions!.date.slice(0, 7)))).slice(0, 6).map((m) => {
                  const inMonth = attList.filter((a) => a.sessions!.date.startsWith(m));
                  const counted = inMonth.filter((a) => a.status !== 'excused');
                  const pres = inMonth.filter((a) => a.status === 'present').length;
                  const pct = counted.length ? Math.round((pres / counted.length) * 100) : 100;
                  return (
                    <li key={m}>
                      <div className="mb-1 flex justify-between text-[13px] font-bold"><span className="text-ink-2">{periodLabel(m)}</span><span className={pct < 70 ? 'text-coral-dark' : 'text-ink'}>{pct}% · {pres}/{counted.length}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${pct < 70 ? 'bg-coral' : 'bg-ok'}`} style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Poslednji časovi">
            {attList.length === 0 ? (
              <p className="text-[14px] font-semibold text-mut">Još nema zabeleženog prisustva.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {attList.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex items-center justify-between text-[14px]">
                    <span className="font-semibold text-ink-2">{dateSr(a.sessions!.date)} · {a.sessions!.groups?.name}</span>
                    <Badge tone={a.status === 'present' ? 'ok' : a.status === 'excused' ? 'gray' : 'coral'}>{a.status === 'present' ? 'Bio' : a.status === 'excused' ? 'Opravdano' : 'Nije bio'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Status">
            <div className="flex flex-wrap gap-2">
              <form action={setStudentActive}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="active" value={s.active ? '0' : '1'} />
                <button className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-soft'}`}>{s.active ? 'Ispiši učenika' : 'Vrati u aktivne'}</button>
              </form>
              {!s.active && (
                <form action={deleteStudent}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn btn-sm btn-ghost">Obriši trajno</button>
                </form>
              )}
            </div>
            <p className="mt-2 text-[12px] font-semibold text-mut">Ispisan učenik ostaje u evidenciji sa istorijom uplata i prisustva.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
