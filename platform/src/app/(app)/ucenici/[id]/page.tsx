import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Badge, Stat } from '@/components/ui';
import { StudentFields } from '@/components/student-form';
import { attendanceStats, formatMoney, formatTotals, fullName, dateSr, periodLabel, todayISO } from '@/lib/format';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { ConfirmButton, TypedConfirm } from '@/components/confirm';
import { packageBalances } from '@/lib/packages-db';
import { phoneKey, waUrl } from '@/lib/phone';
import { distributeAdvance } from '../../uplate/actions';
import type { Student } from '@/lib/types';
import { updateStudent, setStudentActive, deleteStudent, addToGroup, removeFromGroup, createParentLink, revokeParentLink, linkFamily, unlinkFamily } from '../actions';
import { assignPackage, deletePackagePurchase } from '../../paketi/actions';
import { CopyButton } from '@/components/copy-button';
import { parentUrl } from '@/lib/parent';

const OK: Record<string, string> = { '1': 'Sačuvano.', novi: 'Učenik je dodat.', ispisan: 'Učenik je ispisan i uklonjen iz grupa.', aktivan: 'Učenik je ponovo aktivan.', link: 'Link za roditelje je napravljen. Pošalji ga roditelju.', ugasen: 'Link je poništen i više ne radi.', cekanje: 'Grupa je popunjena, pa je učenik na listi čekanja.', avans: 'Avans je raspoređen na otvorena zaduženja.', paket: 'Paket je dodat.', obrisan: 'Paket je obrisan. Zaduženje, ako postoji, ostaje na Uplatama.' };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  type M = { group_id: string; joined_at: string; groups: { name: string; color: string; monthly_fee: number | null; package_classes: number | null; fee_type: string } | null };
  type A = { status: string; session_id: string; sessions: { date: string; group_id: string; groups: { name: string } | null } | null };
  type C = { id: string; period: string; amount: number; currency: string | null; description: string | null; groups: { name: string } | null };
  type P = { id: string; amount: number; currency: string | null; paid_at: string; method: string; charge_id: string | null; note: string | null };
  type Pkg = { id: string; classes_total: number; price: number; currency: string | null; purchased_at: string; expires_at: string | null; paid_at: string | null; group_id: string; groups: { name: string } | null };
  type Sib = { id: string; first_name: string; last_name: string; parent_phone: string | null; family_id: string | null };
  const today = todayISO();
  const [{ data: s }, { data: members }, { data: groups }, attList0, chs, pays, { data: plink0 }, allStudents, balances, { data: pkgs }, { data: sharedPkgs }, { data: catalog }, { data: waiting }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).eq('org_id', ctx.org.id).single<Student>(),
    supabase.from('group_members').select('group_id, joined_at, groups(name, color, monthly_fee, package_classes, fee_type)').eq('student_id', id),
    supabase.from('groups').select('id,name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    fetchAll<A>((a, b) => supabase.from('attendance').select('status, session_id, sessions(date, group_id, groups(name))').eq('student_id', id).eq('org_id', ctx.org.id).order('session_id').range(a, b)),
    fetchAll<C>((a, b) => supabase.from('charges').select('id, period, amount, currency, description, groups(name)').eq('student_id', id).eq('org_id', ctx.org.id).order('period', { ascending: false }).order('id').range(a, b)),
    fetchAll<P>((a, b) => supabase.from('payments').select('id, amount, currency, paid_at, method, charge_id, note').eq('student_id', id).eq('org_id', ctx.org.id).order('paid_at', { ascending: false }).order('id').range(a, b)),
    supabase.from('parent_links').select('token, last_seen_at, student_id').eq('org_id', ctx.org.id).eq('revoked', false).order('created_at', { ascending: false }),
    fetchAll<Sib>((a, b) => supabase.from('students').select('id, first_name, last_name, parent_phone, family_id').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b)),
    packageBalances(supabase, ctx.org.id, today, [id]),
    supabase.from('class_packages').select('id, classes_total, price, currency, purchased_at, expires_at, paid_at, group_id, groups(name)').eq('student_id', id).eq('org_id', ctx.org.id).order('purchased_at', { ascending: false }),
    supabase.from('class_package_students').select('class_packages(id, classes_total, price, currency, purchased_at, expires_at, paid_at, group_id, groups(name))').eq('student_id', id).eq('org_id', ctx.org.id),
    supabase.from('lesson_packages').select('id, name, lessons, price, currency').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('group_waitlist').select('group_id, groups(name)').eq('student_id', id),
  ]);
  if (!s) notFound();

  const mem = (members ?? []) as unknown as M[];
  const inGroups = new Set(mem.map((m) => m.group_id));
  const attList = attList0.filter((a) => a.sessions).sort((a, b) => b.sessions!.date.localeCompare(a.sessions!.date));
  const stats = attendanceStats(attList);
  const paidByCharge = new Map<string, number>();
  for (const p of pays) if (p.charge_id) paidByCharge.set(p.charge_id, (paidByCharge.get(p.charge_id) ?? 0) + Number(p.amount));
  const dueLabel = formatTotals(chs.map((c) => ({ amount: Number(c.amount), currency: c.currency })));
  const paidLabel = formatTotals(pays.map((p) => ({ amount: Number(p.amount), currency: p.currency })));
  const advance = pays.filter((p) => !p.charge_id).reduce((a, p) => a + Number(p.amount), 0);

  const siblings = s.family_id ? allStudents.filter((x) => x.family_id === s.family_id && x.id !== s.id) : [];
  const key = phoneKey(s.parent_phone);
  const suggested = key ? allStudents.filter((x) => x.id !== s.id && phoneKey(x.parent_phone) === key && (!s.family_id || x.family_id !== s.family_id)) : [];
  const familyIds = new Set([s.id, ...siblings.map((x) => x.id)]);
  const plink = ((plink0 ?? []) as { token: string; last_seen_at: string | null; student_id: string }[]).find((l) => familyIds.has(l.student_id));
  const owned = (pkgs ?? []) as unknown as Pkg[];
  const linkedPkgs = ((sharedPkgs ?? []) as unknown as { class_packages: Pkg | null }[]).map((r) => r.class_packages).filter((p): p is Pkg => !!p);
  const pkgList = [...owned, ...linkedPkgs.filter((p) => !owned.some((o) => o.id === p.id))];
  const catalogList = (catalog ?? []) as { id: string; name: string; lessons: number; price: number; currency: string }[];
  const waitGroups = (waiting ?? []) as unknown as { group_id: string; groups: { name: string } | null }[];

  return (
    <>
      <PageHeader
        title={fullName(s)}
        subtitle={<>{s.active ? 'Aktivan' : `Ispisan ${dateSr(s.left_at)}`} · upisan {dateSr(s.joined_at)}</>}
        back={{ href: '/ucenici', label: 'Učenici' }}
        actions={(
          <>
            <Link href={`/ucenici/${s.id}/diploma`} className="btn btn-soft">Diploma</Link>
            <a href={`/ucenici/${s.id}/izvoz`} className="btn btn-soft">Izvoz podataka</a>
            {(s.parent_phone || s.phone) && <a className="btn btn-soft" href={`tel:${s.parent_phone || s.phone}`}>Pozovi</a>}
            {(s.parent_phone || s.phone) && <a className="btn btn-soft" href={waUrl(s.parent_phone || s.phone)} target="_blank" rel="noopener">WhatsApp</a>}
          </>
        )}
      />
      <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prisustvo" value={stats.pct === null ? '—' : `${stats.pct}%`} hint={`${stats.present} od ${stats.counted} časova${stats.excused ? `, opravdano ${stats.excused}` : ''}`} />
        <Stat label="Grupe" value={mem.length} />
        <Stat label="Ukupno uplaćeno" value={paidLabel} />
        <Stat label="Zaduženo" value={dueLabel} />
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
            <p className="text-[14px] font-semibold text-ink-2">Roditelj bez lozinke vidi raspored, prisustvo, izveštaj za mesec, šta duguje i QR kod za uplatu. Link važi dok se koristi, a ističe posle godinu dana bez otvaranja. Šalji ga samo na proveren broj roditelja.</p>
            {plink ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="truncate rounded-xl bg-soft px-3 py-2 text-[13px] font-bold text-brand">{parentUrl(plink.token)}</div>
                <div className="text-[12px] font-semibold text-mut">{plink.last_seen_at ? `Roditelj je poslednji put otvorio ${dateSr(plink.last_seen_at.slice(0, 10))}` : 'Roditelj još nije otvorio link'}</div>
                <div className="flex flex-wrap gap-2">
                  {(s.parent_phone || s.phone) && (
                    <a className="btn btn-sm bg-[#1FA855] hover:bg-[#178a45]" target="_blank" rel="noopener" href={waUrl(s.parent_phone || s.phone, `Dobar dan! Ovo je lični link na kome vidite raspored, prisustvo i uplate za ${[s, ...siblings].map(fullName).join(', ')}: ${parentUrl(plink.token)}\n${ctx.org.name}`)}>Pošalji na WhatsApp</a>
                  )}
                  <CopyButton text={parentUrl(plink.token)} />
                  <form action={revokeParentLink}><input type="hidden" name="student_id" value={s.id} /><ConfirmButton message="Poništiti link? Roditelj više neće moći da ga otvori." className="btn btn-sm btn-ghost text-coral-dark">Poništi link</ConfirmButton></form>
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
                    <ConfirmButton message={`Ukloniti iz grupe ${m.groups?.name ?? ''}?`} className="text-[13px] font-bold text-coral-dark hover:underline">Ukloni</ConfirmButton>
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

          {waitGroups.length > 0 && (
            <Card title="Lista čekanja">
              <ul className="flex flex-col gap-1.5">
                {waitGroups.map((w) => <li key={w.group_id}><Link href={`/grupe/${w.group_id}`} className="font-bold text-brand">{w.groups?.name}</Link></li>)}
              </ul>
            </Card>
          )}

          <Card title="Porodica">
            <p className="text-[13px] font-semibold text-mut">Braća i sestre dele jedan link i jedan QR kod za ukupan dug.</p>
            {siblings.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {siblings.map((x) => <li key={x.id}><Link href={`/ucenici/${x.id}`} className="font-bold text-ink hover:text-brand">{fullName(x)}</Link></li>)}
              </ul>
            )}
            {suggested.length > 0 && (
              <div className="mt-3 rounded-xl bg-soft-2 p-3">
                <div className="text-[13px] font-bold text-ink">Isti telefon roditelja: {suggested.map(fullName).join(', ')}</div>
                <form action={linkFamily} className="mt-2">
                  <input type="hidden" name="student_id" value={s.id} />
                  <input type="hidden" name="back" value={`/ucenici/${s.id}`} />
                  {suggested.map((x) => <input key={x.id} type="hidden" name="student_id" value={x.id} />)}
                  <button className="btn btn-sm">Poveži</button>
                </form>
              </div>
            )}
            <form action={linkFamily} className="mt-3 flex gap-2">
              <input type="hidden" name="student_id" value={s.id} />
              <input type="hidden" name="back" value={`/ucenici/${s.id}`} />
              <select name="student_id" className="input" defaultValue="" required>
                <option value="">Dodaj brata ili sestru...</option>
                {allStudents.filter((x) => !familyIds.has(x.id)).map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}
              </select>
              <button className="btn btn-soft">Dodaj</button>
            </form>
            {s.family_id && (
              <form action={unlinkFamily} className="mt-2">
                <input type="hidden" name="student_id" value={s.id} />
                <ConfirmButton message="Izdvojiti učenika iz porodice?" className="text-[13px] font-bold text-coral-dark hover:underline">Izdvoji iz porodice</ConfirmButton>
              </form>
            )}
          </Card>

          {(mem.length > 0 || pkgList.length > 0) && (
            <Card title="Paketi časova" actions={<Link href="/paketi" className="text-[13px] font-bold text-brand">Svi paketi →</Link>}>
              {balances.length > 0 && (
                <ul className="mb-3 flex flex-col gap-2">
                  {balances.map((b) => (
                    <li key={`${b.id}:${b.student_id}`} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2">
                      <span className="min-w-0 truncate font-bold text-ink">{b.group}{b.price ? ` · ${formatMoney(b.price, b.currency)}` : ''}</span>
                      <Badge tone={b.remaining <= 1 ? 'coral' : 'ok'}>{b.expired ? 'istekao' : `ostalo ${b.remaining} od ${b.total}`}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {pkgList.length > 0 && (
                <ul className="mb-3 flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
                  {pkgList.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>{dateSr(p.purchased_at)} · {p.groups?.name} · {p.classes_total} čas. · {formatMoney(p.price, p.currency)}{p.paid_at ? ` · plaćen ${dateSr(p.paid_at)}` : ''}{p.expires_at ? ` · važi do ${dateSr(p.expires_at)}` : ''}</span>
                      <form action={deletePackagePurchase}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={`/ucenici/${s.id}`} /><ConfirmButton message="Obrisati paket? Zaduženje za njega ostaje, obriši ga na stranici Uplate." className="font-bold text-coral-dark hover:underline">obriši</ConfirmButton></form>
                    </li>
                  ))}
                </ul>
              )}
              {mem.length > 0 && (
                <form action={assignPackage} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                  <input type="hidden" name="back" value={`/ucenici/${s.id}`} />
                  <input type="hidden" name="student_id" value={s.id} />
                  <select name="package_id" className="input sm:col-span-2" defaultValue="">
                    <option value="">Ručni unos (bez kataloga)</option>
                    {catalogList.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.lessons} čas. · {formatMoney(c.price, c.currency)}</option>)}
                  </select>
                  <select name="group_id" className="input sm:col-span-2" required>
                    {mem.map((m) => <option key={m.group_id} value={m.group_id}>{m.groups?.name}</option>)}
                  </select>
                  {siblings.map((sib) => (
                    <div key={sib.id} className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <label className="flex items-center gap-2 text-[13px] font-bold text-ink"><input type="checkbox" name="extra_student_id" value={sib.id} className="h-4 w-4 accent-[#5B2A86]" />{fullName(sib)}</label>
                      <select name={`group_for_${sib.id}`} className="input h-9 w-auto text-sm" defaultValue={mem[0]?.group_id}>
                        {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                  ))}
                  <input name="classes" type="number" min={1} step="1" className="input" placeholder="Broj časova" />
                  <input name="price" type="number" min={0} step="0.01" className="input" placeholder="Cena" />
                  <select name="currency" className="input" defaultValue="EUR"><option value="EUR">EUR</option><option value="RSD">RSD</option></select>
                  <label className="block"><span className="label">Datum uplate</span><input name="paid_at" type="date" className="input" /></label>
                  <label className="flex items-start gap-2 sm:col-span-2 text-[13px] font-semibold text-ink-2"><input type="checkbox" name="auto_expires" defaultChecked className="mt-0.5 h-4 w-4 accent-[#5B2A86]" />Rok po rasporedu (10 časova jednom nedeljno traje 10 nedelja). Ako predavač otkaže čas bez nadoknade, rok se produžava.</label>
                  <label className="block sm:col-span-2"><span className="label">Važi do, ako isključiš rok po rasporedu</span><input name="expires_at" type="date" className="input" /></label>
                  <label className="flex items-start gap-2 sm:col-span-2 text-[13px] font-semibold text-ink-2"><input type="checkbox" name="shared" className="mt-0.5 h-4 w-4 accent-[#5B2A86]" />Zajednički čas (duo): deca dele jedan fond časova i jednu cenu.</label>
                  <div className="sm:col-span-2"><button className="btn btn-soft">Dodaj paket</button></div>
                </form>
              )}
            </Card>
          )}

          <Card title="Članarine" actions={<Link href="/uplate" className="text-[13px] font-bold text-brand">Sve uplate →</Link>}>
            {advance > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ok-soft px-3 py-2">
                <span className="text-[14px] font-extrabold text-ok">Avans: {formatMoney(advance)}</span>
                <form action={distributeAdvance}><input type="hidden" name="student_id" value={s.id} /><button className="btn btn-sm btn-soft">Rasporedi na zaduženja</button></form>
              </div>
            )}
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
                        <div className="text-[12px] font-semibold text-mut">{c.description ?? c.groups?.name ?? ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[14px] font-bold tabular-nums">{formatMoney(c.amount, c.currency)}</div>
                        <Badge tone={ok ? 'ok' : paid > 0 ? 'soft' : 'coral'}>{ok ? 'Plaćeno' : paid > 0 ? `Uplaćeno ${formatMoney(paid, c.currency)}` : 'Nije plaćeno'}</Badge>
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
                  const st = attendanceStats(inMonth);
                  const pres = st.present;
                  const pct = st.pct ?? 100;
                  return (
                    <li key={m}>
                      <div className="mb-1 flex justify-between text-[13px] font-bold"><span className="text-ink-2">{periodLabel(m)}</span><span className={pct < 70 ? 'text-coral-dark' : 'text-ink'}>{pct}% · {pres}/{st.counted}</span></div>
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
                <ConfirmButton message={s.active ? `Ispisati ${fullName(s)}? Učenik izlazi iz grupa, a link za roditelje se gasi.` : `Vratiti ${fullName(s)} u aktivne?`} className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-soft'}`}>{s.active ? 'Ispiši učenika' : 'Vrati u aktivne'}</ConfirmButton>
              </form>
              {!s.active && (
                <form action={deleteStudent}>
                  <input type="hidden" name="id" value={s.id} />
                  <TypedConfirm label="Obriši trajno" className="btn btn-sm btn-ghost" warning="Brišu se i sve uplate, zaduženja i prisustvo ovog učenika, pa se izveštaji menjaju." />
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
