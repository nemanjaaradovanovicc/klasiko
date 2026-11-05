import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { QrImage } from '@/components/qr-image';
import { familyReference, ipsPayload, studentReference } from '@/lib/ips';
import { WEEKDAYS, addDays, attendanceStats, currentPeriod, dateLong, dateSr, parsePeriod, periodLabel, rsd, shiftPeriod, time, todayISO, fullName } from '@/lib/format';
import { waUrl } from '@/lib/phone';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { packageBalances } from '@/lib/packages-db';
import { cancelAbsence, reportAbsence } from './actions';

export const metadata: Metadata = { title: 'Pregled za roditelje', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = { datum: 'Izaberi datum od danas do narednih 60 dana.', pokusaji: 'Previše pokušaja. Probaj ponovo kasnije.', upis: 'Izostanak nije sačuvan. Pozovi školu.' };

// Javna stranica za roditelja: pristup samo preko tajnog linka, bez prijave. Braća i sestre dele jedan link.
export default async function ParentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mesec?: string; dete?: string; javljeno?: string; greska?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: link } = await db.from('parent_links').select('student_id, org_id, revoked, expires_at').eq('token', token).maybeSingle();
  if (!link || link.revoked || new Date(link.expires_at) < new Date()) notFound();
  const period = parsePeriod(sp.mesec);
  const today = todayISO();

  type St = { id: string; org_id: string; first_name: string; last_name: string; ref_no: number; active: boolean; family_id: string | null };
  const [{ data: linked }, { data: org }] = await Promise.all([
    db.from('students').select('id, org_id, first_name, last_name, ref_no, active, family_id').eq('id', link.student_id).eq('org_id', link.org_id).maybeSingle<St>(),
    db.from('organizations').select('name, phone, email, bank_account, payee_name, city, status').eq('id', link.org_id).single(),
  ]);
  if (!linked || !org || org.status === 'cancelled' || !linked.active) notFound();
  const { data: famRows } = linked.family_id
    ? await db.from('students').select('id, org_id, first_name, last_name, ref_no, active, family_id').eq('org_id', link.org_id).eq('family_id', linked.family_id).eq('active', true).order('first_name')
    : { data: [linked] };
  const kids = (famRows ?? [linked]) as St[];
  const ids = kids.map((k) => k.id);
  const child = kids.find((k) => String(k.ref_no) === sp.dete) ?? linked;

  type C = { id: string; period: string; amount: number; description: string | null; student_id: string; payments: { amount: number; paid_at: string }[] };
  type A = { status: string; session_id: string; sessions: { date: string; start_time: string; status: string; note: string | null; group_id: string; groups: { name: string } | null } };
  type G = { id: string; name: string; color: string; active: boolean; profiles: { full_name: string } | null; schedule_slots: { weekday: number; start_time: string; end_time: string; rooms: { name: string } | null }[] };
  const [{ data: members }, att, charges, { data: notices }, balances] = await Promise.all([
    db.from('group_members').select('groups(id, name, color, active, profiles(full_name), schedule_slots(weekday, start_time, end_time, rooms(name)))').eq('student_id', child.id),
    fetchAll<A>((a, b) => db.from('attendance').select('status, session_id, sessions!inner(date, start_time, status, note, group_id, groups(name))').eq('student_id', child.id).gte('sessions.date', `${period}-01`).lt('sessions.date', `${shiftPeriod(period, 1)}-01`).order('session_id').range(a, b)),
    // Sva zaduženja, da nijedan stariji dug ne ostane skriven.
    fetchAll<C>((a, b) => db.from('charges').select('id, period, amount, description, student_id, payments(amount, paid_at)').in('student_id', ids).eq('org_id', link.org_id).order('period', { ascending: false }).order('id').range(a, b)),
    db.from('absence_notices').select('id, date, note, student_id').in('student_id', ids).gte('date', today).order('date'),
    packageBalances(db, link.org_id, today, [child.id]),
  ]);
  const groups = ((members ?? []) as unknown as { groups: G | null }[]).map((m) => m.groups).filter((g): g is G => !!g && g.active);
  const groupIds = groups.map((g) => g.id);
  const { data: anns } = await db.from('announcements').select('id, title, body, created_at, group_id').eq('org_id', link.org_id).gte('created_at', addDays(today, -60)).or(groupIds.length ? `group_id.is.null,group_id.in.(${groupIds.join(',')})` : 'group_id.is.null').order('created_at', { ascending: false }).limit(5);
  await db.from('parent_links').update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 365 * 86400000).toISOString() }).eq('token', token);

  const inMonth = att.sort((a, b) => b.sessions.date.localeCompare(a.sessions.date));
  const stats = attendanceStats(inMonth);
  const chs = charges.map((c) => {
    const paid = c.payments.reduce((a, p) => a + Number(p.amount), 0);
    return { ...c, paid, remaining: Math.max(0, Number(c.amount) - paid) };
  });
  const unpaid = chs.filter((c) => c.remaining > 0).sort((a, b) => a.period.localeCompare(b.period));
  const debt = unpaid.reduce((a, c) => a + c.remaining, 0);
  const paidChs = chs.filter((c) => c.paid > 0).slice(0, 24);
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const many = kids.length > 1;
  const name = fullName(child);
  const wa = org.phone ? waUrl(org.phone, `Dobar dan, pišem u vezi sa ${name}.`) : null;
  const payee = org.payee_name || org.name;
  const q = (m: string, d?: number) => `/r/${token}?mesec=${m}${(d ?? child.ref_no) !== linked.ref_no ? `&dete=${d ?? child.ref_no}` : ''}`;
  // Jedan QR za ceo dug: uplata se u školi raspoređuje na sva otvorena zaduženja.
  const totalQr = org.bank_account && unpaid.length > 1 ? ipsPayload({ account: org.bank_account, payee, amount: debt, purpose: `Clanarine ${linked.last_name || linked.first_name}`, payer: fullName(linked), reference: familyReference(linked.ref_no) }) : null;

  return (
    <main className="min-h-dvh bg-soft px-4 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-line"><img src="/logo.png" alt="" width={40} height={40} /></span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-mut">{org.name}</div>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-brand">{many ? kids.map((k) => k.first_name).join(', ') : name}</h1>
          </div>
        </header>

        {unpaid.length > 0 ? (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-extrabold text-ink">Za uplatu</h2>
              <span className="text-[22px] font-extrabold tabular-nums text-coral-dark">{rsd(debt)}</span>
            </div>
            {totalQr && (
              <div className="mt-3 flex items-center gap-4 rounded-2xl bg-soft-2 p-4">
                <QrImage payload={totalQr} size={112} />
                <div className="min-w-0 text-[13px] font-semibold text-ink-2">
                  <div className="font-extrabold text-ink">Plati sve jednom uplatom</div>
                  <div className="mt-1">Skeniraj kod u aplikaciji svoje banke („IPS skeniraj”).</div>
                  <div className="mt-1">Račun: <b className="tabular-nums text-ink">{org.bank_account}</b></div>
                  <div>Poziv na broj: <b className="tabular-nums text-ink">{familyReference(linked.ref_no)}</b></div>
                </div>
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {unpaid.map((c) => {
                const kid = kidById.get(c.student_id) ?? linked;
                const qr = org.bank_account
                  ? ipsPayload({ account: org.bank_account, payee, amount: c.remaining, purpose: `Clanarina ${periodLabel(c.period)} ${fullName(kid)}`, payer: fullName(kid), reference: studentReference(kid.ref_no, c.period) })
                  : null;
                const details = (
                  <div className="flex items-center gap-4 border-t border-line pt-3">
                    {qr && <QrImage payload={qr} size={112} />}
                    <div className="min-w-0 text-[13px] font-semibold text-ink-2">
                      <div>Skeniraj kod u aplikaciji svoje banke („IPS skeniraj”).</div>
                      <div className="mt-1">Račun: <b className="tabular-nums text-ink">{org.bank_account}</b></div>
                      <div>Poziv na broj: <b className="tabular-nums text-ink">{studentReference(kid.ref_no, c.period)}</b></div>
                    </div>
                  </div>
                );
                return (
                  <li key={c.id} className="rounded-2xl bg-soft p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-extrabold text-ink">{periodLabel(c.period)}{many ? ` · ${kid.first_name}` : ''}</div>
                        <div className="truncate text-[13px] font-semibold text-mut">{c.description}</div>
                      </div>
                      <div className="shrink-0 text-[17px] font-extrabold tabular-nums">{rsd(c.remaining)}</div>
                    </div>
                    {org.bank_account && (totalQr
                      ? <details className="mt-3"><summary className="cursor-pointer text-[13px] font-bold text-brand">Plati samo ovo</summary><div className="mt-3">{details}</div></details>
                      : <div className="mt-3">{details}</div>)}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="rounded-3xl bg-ok-soft p-5 text-center">
            <div className="text-[17px] font-extrabold text-ok">Sve je plaćeno ✓</div>
            <div className="text-[13px] font-semibold text-ink-2">Hvala na redovnim uplatama.</div>
          </section>
        )}

        {(anns ?? []).length > 0 && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Obaveštenja škole</h2>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {(anns ?? []).map((n) => (
                <li key={n.id} className="py-2.5">
                  <div className="font-extrabold text-ink">{n.title}</div>
                  {n.body && <p className="mt-0.5 whitespace-pre-line text-[14px] font-medium text-ink-2">{n.body}</p>}
                  <div className="mt-0.5 text-[12px] font-semibold text-mut">{dateSr(n.created_at.slice(0, 10))}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {many && (
          <nav className="flex flex-wrap gap-2" aria-label="Izaberi dete">
            {kids.map((k) => (
              <Link key={k.id} href={q(period, k.ref_no)} className={`btn btn-sm ${k.id === child.id ? '' : 'btn-soft'}`}>{k.first_name}</Link>
            ))}
          </nav>
        )}

        {balances.length > 0 && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Paket časova{many ? `, ${child.first_name}` : ''}</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {balances.map((b) => (
                <li key={b.group_id} className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate font-bold text-ink">{b.group}</span>
                  <span className={`font-extrabold tabular-nums ${b.remaining <= 1 ? 'text-coral-dark' : 'text-ok'}`}>{b.expired ? 'istekao' : `još ${b.remaining} od ${b.total}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <Link href={q(shiftPeriod(period, -1))} className="btn btn-sm btn-soft" aria-label="Prethodni mesec">←</Link>
            <h2 className="text-center text-[16px] font-extrabold text-ink">Izveštaj{many ? ` za ${child.first_name}` : ''}, {periodLabel(period).toLowerCase()}</h2>
            {period < currentPeriod() ? <Link href={q(shiftPeriod(period, 1))} className="btn btn-sm btn-soft" aria-label="Sledeći mesec">→</Link> : <span className="w-9" aria-hidden />}
          </div>
          {inMonth.length === 0 ? (
            <p className="mt-3 text-center text-[14px] font-semibold text-mut">Nema upisanih časova za ovaj mesec.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Prisustvo</div><div className="text-[22px] font-extrabold text-brand">{stats.pct === null ? '—' : `${stats.pct}%`}</div></div>
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Bio/la</div><div className="text-[22px] font-extrabold text-ink">{stats.present}</div></div>
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Izostanci</div><div className="text-[22px] font-extrabold text-ink">{stats.absent}</div></div>
              </div>
              {stats.excused > 0 && <p className="mt-2 text-center text-[12px] font-semibold text-mut">Opravdano: {stats.excused}. Opravdani izostanci se ne računaju u procenat.</p>}
              <ul className="mt-4 flex flex-col divide-y divide-line">
                {inMonth.map((r, i) => (
                  <li key={i} className="py-2.5">
                    <div className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="min-w-0 truncate font-bold text-ink">{dateSr(r.sessions.date)} · {r.sessions.groups?.name}</span>
                      <span className={`chip ${r.status === 'present' ? 'bg-ok-soft text-ok' : r.status === 'excused' ? 'bg-[#EEEAF2] text-[#6b6375]' : 'bg-coral-soft text-coral-dark'}`}>{r.status === 'present' ? 'Bio/la' : r.status === 'excused' ? 'Opravdano' : 'Nije bio/la'}</span>
                    </div>
                    {r.sessions.note && <p className="mt-1 text-[13px] font-medium text-ink-2">{r.sessions.note}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section id="izostanak" className="scroll-mt-4 rounded-3xl bg-white p-5 ring-1 ring-line">
          <h2 className="text-[16px] font-extrabold text-ink">Javi izostanak</h2>
          <p className="mt-1 text-[13px] font-semibold text-mut">Škola odmah vidi poruku. Predavač pri upisu odlučuje da li je izostanak opravdan.</p>
          {sp.javljeno && <div className="mt-3 rounded-xl bg-ok-soft px-3 py-2 text-[13px] font-bold text-ok">Izostanak je javljen školi.</div>}
          {sp.greska && ERR[sp.greska] && <div className="mt-3 rounded-xl bg-coral-soft px-3 py-2 text-[13px] font-bold text-coral-dark">{ERR[sp.greska]}</div>}
          <form action={reportAbsence} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="token" value={token} />
            {many ? (
              <label className="block sm:col-span-2"><span className="label">Dete</span>
                <select name="student_id" className="input" defaultValue={child.id}>{kids.map((k) => <option key={k.id} value={k.id}>{fullName(k)}</option>)}</select>
              </label>
            ) : <input type="hidden" name="student_id" value={child.id} />}
            <label className="block"><span className="label">Datum</span><input name="date" type="date" className="input" min={today} max={addDays(today, 60)} defaultValue={today} required /></label>
            <label className="block"><span className="label">Razlog (opciono)</span><input name="note" className="input" maxLength={300} placeholder="npr. prehlada" /></label>
            <div className="sm:col-span-2"><button className="btn btn-soft">Pošalji školi</button></div>
          </form>
          {(notices ?? []).length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {(notices ?? []).map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                  <span className="min-w-0 font-semibold text-ink-2">{many ? `${kidById.get(n.student_id)?.first_name}, ` : ''}{dateLong(n.date)}{n.note ? ` · ${n.note}` : ''}</span>
                  <form action={cancelAbsence}><input type="hidden" name="token" value={token} /><input type="hidden" name="id" value={n.id} /><button className="text-[13px] font-bold text-coral-dark hover:underline">poništi</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {groups.length > 0 && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Raspored{many ? `, ${child.first_name}` : ''}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id} className="rounded-2xl bg-soft p-3.5" style={{ borderLeft: `4px solid ${g.color}` }}>
                  <div className="font-extrabold text-ink">{g.name}</div>
                  {g.profiles?.full_name && <div className="text-[13px] font-semibold text-mut">{g.profiles.full_name}</div>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[...g.schedule_slots].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((s, i) => (
                      <span key={i} className="rounded-lg bg-white px-2 py-1 text-[12px] font-bold text-ink-2">{WEEKDAYS[s.weekday]} {time(s.start_time)}–{time(s.end_time)}{s.rooms ? `, ${s.rooms.name}` : ''}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {paidChs.length > 0 && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Uplate</h2>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {paidChs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                  <span className="font-semibold text-ink-2">{periodLabel(c.period)}{many ? ` · ${kidById.get(c.student_id)?.first_name}` : ''}</span>
                  <span className="font-bold tabular-nums text-ok">{rsd(c.paid)}{c.remaining === 0 ? ' ✓' : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          {wa && <a href={wa} target="_blank" rel="noopener" className="btn h-12 bg-[#1FA855] hover:bg-[#178a45]">Piši školi na WhatsApp</a>}
          {org.phone && <a href={`tel:${org.phone}`} className="btn btn-soft h-12">Pozovi {org.phone}</a>}
        </section>
        <p className="text-center text-[11px] font-semibold text-mut">Ovaj link je samo za tebe, jer prikazuje podatke o detetu i njegov raspored. Ne prosleđuj ga drugima. Ako si ga izgubio/la ili podelio/la, zamoli školu da ga poništi. Pokreće ga <a href="https://www.klasiko.rs" className="font-bold text-brand">Klasiko</a>.</p>
      </div>
    </main>
  );
}
