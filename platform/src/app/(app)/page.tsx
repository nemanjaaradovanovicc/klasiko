import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Stat, Badge, Flash } from '@/components/ui';
import { InstallCard } from '@/components/pwa';
import { currentPeriod, dateLong, isoWeekday, rsd, time, todayISO, fullName, periodLabel, addDays, absenceStreaks } from '@/lib/format';

export const metadata = { title: 'Pregled' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();
  const period = currentPeriod();

  const [{ data: slots }, { data: sessions }, studentsRes, groupsRes, roomsRes, chargesRes, myHeldRes, { data: recentAtt }] = await Promise.all([
    supabase
      .from('schedule_slots')
      .select('start_time, end_time, rooms(name), groups!inner(id, name, color, active, group_members(student_id))')
      .eq('org_id', ctx.org.id)
      .eq('weekday', isoWeekday(today))
      .eq('groups.active', true)
      .order('start_time'),
    supabase.from('sessions').select('group_id, start_time, status').eq('org_id', ctx.org.id).eq('date', today),
    ctx.isOwner ? supabase.from('students').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('active', true) : Promise.resolve({ count: 0 }),
    supabase.from('groups').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('active', true),
    ctx.isOwner ? supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id) : Promise.resolve({ count: 0 }),
    ctx.isOwner
      ? supabase.from('charges').select('id, amount, due_date, student_id, students(first_name, last_name), payments(amount)').eq('org_id', ctx.org.id).eq('period', period)
      : Promise.resolve({ data: [] }),
    !ctx.isOwner ? supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('teacher_id', ctx.userId).eq('status', 'held').gte('date', `${period}-01`) : Promise.resolve({ count: 0 }),
    supabase.from('attendance').select('student_id, status, students(first_name, last_name, parent_phone, phone, active), sessions!inner(date, group_id, groups(name))').eq('org_id', ctx.org.id).gte('sessions.date', addDays(today, -60)).limit(3000),
  ]);
  type AR = { student_id: string; status: string; students: { first_name: string; last_name: string; parent_phone: string | null; phone: string | null; active: boolean } | null; sessions: { date: string; group_id: string; groups: { name: string } | null } };
  const attRows = ((recentAtt ?? []) as unknown as AR[]).filter((r) => r.students?.active).map((r) => ({ ...r, date: r.sessions.date }));
  const streaks = absenceStreaks(attRows).slice(0, 8);
  const { data: mk } = await supabase.from('sessions').select('id, date, start_time, status, makeup_for, group_id, groups(name)').eq('org_id', ctx.org.id).or(`and(status.eq.cancelled,date.gte.${addDays(today, -60)}),and(status.eq.planned,date.gte.${today})`).order('date');
  type MK = { id: string; date: string; start_time: string; status: string; makeup_for: string | null; group_id: string; groups: { name: string } | null };
  const mkList = (mk ?? []) as unknown as MK[];
  const { data: mkFor } = await supabase.from('sessions').select('makeup_for').eq('org_id', ctx.org.id).not('makeup_for', 'is', null);
  const covered = new Set((mkFor ?? []).map((m) => m.makeup_for));
  const needMakeup = mkList.filter((m) => m.status === 'cancelled' && !covered.has(m.id));
  const plannedMakeups = mkList.filter((m) => m.status === 'planned');

  type S = { start_time: string; end_time: string; rooms: { name: string } | null; groups: { id: string; name: string; color: string; group_members: { student_id: string }[] } };
  const todays = (slots ?? []) as unknown as S[];
  const done = new Set((sessions ?? []).filter((s) => s.status !== 'planned').map((s) => `${s.group_id}:${s.start_time.slice(0, 5)}`));
  type C = { id: string; amount: number; due_date: string | null; student_id: string; students: { first_name: string; last_name: string } | null; payments: { amount: number }[] };
  const charges = ((chargesRes as { data: unknown }).data ?? []) as C[];
  const expected = charges.reduce((a, c) => a + Number(c.amount), 0);
  const collected = charges.reduce((a, c) => a + Math.min(Number(c.amount), c.payments.reduce((x, p) => x + Number(p.amount), 0)), 0);
  const late = charges.filter((c) => c.due_date && c.due_date < today && c.payments.reduce((x, p) => x + Number(p.amount), 0) < Number(c.amount));
  const studentCount = (studentsRes as { count: number | null }).count ?? 0;
  const groupCount = groupsRes.count ?? 0;
  const roomCount = (roomsRes as { count: number | null }).count ?? 0;

  const steps = [
    { done: roomCount > 0, label: 'Dodaj sale ili učionice', href: '/podesavanja#sale' },
    { done: groupCount > 0, label: 'Napravi grupe sa cenom i terminima', href: '/grupe/nova' },
    { done: studentCount > 0, label: 'Dodaj učenike ili ih uvezi iz Excel-a', href: '/ucenici/uvoz' },
    { done: !!ctx.org.bank_account, label: 'Unesi tekući račun za IPS QR uplate', href: '/podesavanja' },
    { done: charges.length > 0, label: 'Napravi zaduženja za ovaj mesec', href: '/uplate' },
  ];
  const showSteps = ctx.isOwner && steps.some((s) => !s.done);
  const first = (ctx.profile.full_name || '').split(' ')[0];

  return (
    <>
      <PageHeader title={`Dobar dan${first ? `, ${first}` : ''}`} subtitle={dateLong(today)} />
      <Flash ok={sp.ok === 'lozinka' ? 'Lozinka je sačuvana. Dobro došao u Klasiko!' : undefined} />
      <InstallCard />

      {ctx.isOwner && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Časovi danas" value={todays.length} tone="brand" hint={`${todays.filter((s) => done.has(`${s.groups.id}:${time(s.start_time)}`)).length} upisano`} />
          <Stat label="Aktivni učenici" value={studentCount} hint={`${groupCount} grupa`} />
          <Stat label={`Naplaćeno, ${periodLabel(period).toLowerCase()}`} value={rsd(collected)} hint={expected ? `od ${rsd(expected)}` : 'nema zaduženja'} tone="ok" />
          <Stat label="Kasni sa uplatom" value={late.length} tone={late.length ? 'coral' : 'default'} />
        </div>
      )}

      {showSteps && (
        <Card title="Prvi koraci" className="mb-6">
          <ol className="grid gap-2 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={i}>
                <Link href={s.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold ${s.done ? 'bg-ok-soft text-ok' : 'bg-soft text-ink hover:bg-soft-2'}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${s.done ? 'bg-ok text-white' : 'bg-white text-brand ring-1 ring-line-2'}`}>{s.done ? '✓' : i + 1}</span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13px] font-semibold text-mut">Treba ti pomoć oko prenosa podataka? Pošalji tabelu na <a className="font-extrabold text-brand" href="https://wa.me/381638219713" target="_blank" rel="noopener">WhatsApp</a> i uvešćemo je besplatno.</p>
        </Card>
      )}

      {(needMakeup.length > 0 || plannedMakeups.length > 0) && (
        <Card title="Nadoknade" className="mb-6">
          <ul className="flex flex-col divide-y divide-line">
            {needMakeup.slice(0, 6).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><div className="truncate font-bold text-ink">{m.groups?.name}</div><div className="text-[12px] font-semibold text-coral-dark">Otkazan {dateLong(m.date).split(',')[1]?.trim()} u {time(m.start_time)}, nema nadoknadu</div></div>
                <Link href={`/prisustvo/${m.group_id}?datum=${m.date}&vreme=${time(m.start_time)}`} className="btn btn-sm btn-soft">Zakaži</Link>
              </li>
            ))}
            {plannedMakeups.slice(0, 6).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><div className="truncate font-bold text-ink">{m.groups?.name}</div><div className="text-[12px] font-semibold text-mut">Nadoknada {dateLong(m.date)} u {time(m.start_time)}</div></div>
                <Badge>zakazano</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {streaks.length > 0 && (
        <Card title="Propustili 2 ili više časova zaredom" className="mb-6">
          <ul className="flex flex-col divide-y divide-line">
            {streaks.map(({ student_id, streak, last }) => {
              const st = last.students!;
              const phone = st.parent_phone || st.phone;
              return (
                <li key={student_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    {ctx.isOwner ? <Link href={`/ucenici/${student_id}`} className="font-extrabold text-ink hover:text-brand">{fullName(st)}</Link> : <span className="font-extrabold text-ink">{fullName(st)}</span>}
                    <div className="text-[12px] font-semibold text-mut">{last.sessions.groups?.name} · {streak} časa zaredom</div>
                  </div>
                  {phone && (
                    <a className="btn btn-sm btn-soft" target="_blank" rel="noopener" href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '381')}?text=${encodeURIComponent(`Dobar dan! Primetili smo da ${fullName(st)} nije bio/la na poslednja ${streak} časa. Da li je sve u redu? Ako treba, dogovorićemo nadoknadu. ${ctx.org.name}`)}`}>Javi se roditelju</a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Današnji časovi" actions={<Link href="/prisustvo" className="text-[13px] font-bold text-brand">Prisustvo →</Link>}>
          {todays.length === 0 ? (
            <p className="text-[15px] font-semibold text-mut">Danas nema časova po rasporedu.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {todays.map((s, i) => {
                const key = `${s.groups.id}:${time(s.start_time)}`;
                return (
                  <li key={i}>
                    <Link href={`/prisustvo/${s.groups.id}?datum=${today}&vreme=${time(s.start_time)}`} className="flex items-center gap-3 rounded-xl bg-soft px-3 py-2.5 hover:bg-soft-2" style={{ borderLeft: `4px solid ${s.groups.color}` }}>
                      <span className="w-12 text-[15px] font-extrabold tabular-nums">{time(s.start_time)}</span>
                      <span className="min-w-0 flex-1 truncate font-bold text-ink">{s.groups.name}</span>
                      <span className="text-[12px] font-semibold text-mut">{s.groups.group_members.length} uč.</span>
                      {done.has(key) ? <Badge tone="ok">Upisano</Badge> : <Badge tone="coral">Upiši</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {ctx.isOwner ? (
          <Card title="Kasne sa uplatom" actions={<Link href="/uplate?prikaz=neplaceno" className="text-[13px] font-bold text-brand">Uplate →</Link>}>
            {late.length === 0 ? (
              <p className="text-[15px] font-semibold text-mut">{charges.length ? 'Svi su u roku.' : 'Još nema zaduženja za ovaj mesec.'}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {late.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <Link href={`/ucenici/${c.student_id}`} className="font-bold text-ink hover:text-brand">{c.students ? fullName(c.students) : ''}</Link>
                    <span className="text-[14px] font-extrabold tabular-nums text-coral-dark">{rsd(Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card title="Moje grupe">
            <p className="text-[15px] font-semibold text-mut">Imaš {groupCount} {groupCount === 1 ? 'grupu' : 'grupa'}. Ovog meseca si održao/la <b className="text-ink">{(myHeldRes as { count: number | null }).count ?? 0}</b> {((myHeldRes as { count: number | null }).count ?? 0) === 1 ? 'čas' : 'časova'}.</p>
            <Link href="/grupe" className="btn btn-soft mt-3">Pogledaj grupe</Link>
          </Card>
        )}
      </div>
    </>
  );
}
