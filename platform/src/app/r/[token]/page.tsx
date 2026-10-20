import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { QrImage } from '@/components/qr-image';
import { ipsPayload, studentReference } from '@/lib/ips';
import { WEEKDAYS, currentPeriod, dateSr, periodLabel, rsd, shiftPeriod, time, fullName } from '@/lib/format';
import { intlPhone } from '@/lib/parent';

export const metadata: Metadata = { title: 'Pregled za roditelje', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Javna stranica za roditelja: pristup samo preko tajnog linka, bez prijave.
export default async function ParentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mesec?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: link } = await db.from('parent_links').select('student_id, org_id, revoked').eq('token', token).maybeSingle();
  if (!link || link.revoked) notFound();
  const period = sp.mesec && /^\d{4}-\d{2}$/.test(sp.mesec) ? sp.mesec : currentPeriod();

  const [{ data: st }, { data: org }, { data: members }, { data: att }, { data: charges }] = await Promise.all([
    db.from('students').select('id, first_name, last_name, ref_no, active').eq('id', link.student_id).single(),
    db.from('organizations').select('name, phone, email, bank_account, payee_name, city, status').eq('id', link.org_id).single(),
    db.from('group_members').select('groups(id, name, color, active, profiles(full_name), schedule_slots(weekday, start_time, end_time, rooms(name)))').eq('student_id', link.student_id),
    db.from('attendance').select('status, sessions!inner(date, start_time, status, note, group_id, groups(name))').eq('student_id', link.student_id).gte('sessions.date', `${shiftPeriod(currentPeriod(), -5)}-01`).limit(500),
    db.from('charges').select('id, period, amount, description, payments(amount, paid_at)').eq('student_id', link.student_id).order('period', { ascending: false }).limit(12),
  ]);
  if (!st || !org || org.status === 'cancelled') notFound();
  db.from('parent_links').update({ last_seen_at: new Date().toISOString() }).eq('token', token).then(() => {});

  type G = { id: string; name: string; color: string; active: boolean; profiles: { full_name: string } | null; schedule_slots: { weekday: number; start_time: string; end_time: string; rooms: { name: string } | null }[] };
  const groups = ((members ?? []) as unknown as { groups: G | null }[]).map((m) => m.groups).filter((g): g is G => !!g && g.active);
  type A = { status: string; sessions: { date: string; start_time: string; status: string; note: string | null; group_id: string; groups: { name: string } | null } };
  const rows = ((att ?? []) as unknown as A[]).sort((a, b) => b.sessions.date.localeCompare(a.sessions.date));
  const inMonth = rows.filter((r) => r.sessions.date.startsWith(period));
  const counted = inMonth.filter((r) => r.status !== 'excused');
  const present = inMonth.filter((r) => r.status === 'present').length;
  const pct = counted.length ? Math.round((present / counted.length) * 100) : null;

  type C = { id: string; period: string; amount: number; description: string | null; payments: { amount: number; paid_at: string }[] };
  const chs = ((charges ?? []) as unknown as C[]).map((c) => {
    const paid = c.payments.reduce((a, p) => a + Number(p.amount), 0);
    return { ...c, paid, remaining: Math.max(0, Number(c.amount) - paid) };
  });
  const unpaid = chs.filter((c) => c.remaining > 0);
  const debt = unpaid.reduce((a, c) => a + c.remaining, 0);
  const name = fullName(st);
  const wa = org.phone ? `https://wa.me/${intlPhone(org.phone)}?text=${encodeURIComponent(`Dobar dan, pišem u vezi sa ${name}.`)}` : null;

  return (
    <main className="min-h-dvh bg-soft px-4 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-line"><img src="/logo.png" alt="" width={40} height={40} /></span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-mut">{org.name}</div>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-brand">{name}</h1>
          </div>
        </header>

        {unpaid.length > 0 ? (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-extrabold text-ink">Za uplatu</h2>
              <span className="text-[22px] font-extrabold tabular-nums text-coral-dark">{rsd(debt)}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {unpaid.map((c) => {
                const qr = org.bank_account && (org.payee_name || org.name)
                  ? ipsPayload({ account: org.bank_account, payee: org.payee_name || org.name, amount: c.remaining, purpose: `Clanarina ${periodLabel(c.period)} ${name}`, payer: name, reference: studentReference(st.ref_no, c.period) })
                  : null;
                return (
                  <li key={c.id} className="rounded-2xl bg-soft p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-extrabold text-ink">{periodLabel(c.period)}</div>
                        <div className="truncate text-[13px] font-semibold text-mut">{c.description}</div>
                      </div>
                      <div className="shrink-0 text-[17px] font-extrabold tabular-nums">{rsd(c.remaining)}</div>
                    </div>
                    {qr && (
                      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
                        <QrImage payload={qr} size={112} />
                        <div className="min-w-0 text-[13px] font-semibold text-ink-2">
                          <div>Skeniraj kod u aplikaciji svoje banke („IPS skeniraj”).</div>
                          <div className="mt-1">Račun: <b className="tabular-nums text-ink">{org.bank_account}</b></div>
                          <div>Poziv na broj: <b className="tabular-nums text-ink">{studentReference(st.ref_no, c.period)}</b></div>
                        </div>
                      </div>
                    )}
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

        <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/r/${token}?mesec=${shiftPeriod(period, -1)}`} className="btn btn-sm btn-soft" aria-label="Prethodni mesec">←</Link>
            <h2 className="text-[16px] font-extrabold text-ink">Izveštaj, {periodLabel(period).toLowerCase()}</h2>
            <Link href={`/r/${token}?mesec=${shiftPeriod(period, 1)}`} className="btn btn-sm btn-soft" aria-label="Sledeći mesec">→</Link>
          </div>
          {inMonth.length === 0 ? (
            <p className="mt-3 text-center text-[14px] font-semibold text-mut">Nema upisanih časova za ovaj mesec.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Prisustvo</div><div className="text-[22px] font-extrabold text-brand">{pct ?? 0}%</div></div>
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Bio/la</div><div className="text-[22px] font-extrabold text-ink">{present}</div></div>
                <div className="rounded-2xl bg-soft p-3"><div className="text-[12px] font-bold text-mut">Izostanci</div><div className="text-[22px] font-extrabold text-ink">{inMonth.length - present}</div></div>
              </div>
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

        {groups.length > 0 && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Raspored</h2>
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

        {chs.some((c) => c.paid > 0) && (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <h2 className="text-[16px] font-extrabold text-ink">Uplate</h2>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {chs.filter((c) => c.paid > 0).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                  <span className="font-semibold text-ink-2">{periodLabel(c.period)}</span>
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
        <p className="text-center text-[11px] font-semibold text-mut">Ovaj link je samo za tebe. Ne prosleđuj ga drugima. Pokreće ga <a href="https://www.klasiko.rs" className="font-bold text-brand">Klasiko</a>.</p>
      </div>
    </main>
  );
}
