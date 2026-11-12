import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Stat, Badge, Flash, Empty, Field, Select, TextArea } from '@/components/ui';
import { ConfirmButton } from '@/components/confirm';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { currentPeriod, dateSr, fullName, parsePeriod, periodLabel, shiftPeriod, time, todayISO } from '@/lib/format';
import { TRIAL_OUTCOME_LABEL, trialStats, type TrialLesson } from '@/lib/trials';
import { saveTrial, setTrialOutcome, deleteTrial } from './actions';

export const metadata = { title: 'Probni časovi' };

const OK: Record<string, string> = {
  upisan: 'Probni čas je upisan.',
  izmena: 'Izmene su sačuvane.',
  ishod: 'Ishod je sačuvan.',
  obrisan: 'Probni čas je obrisan.',
};
const TONE = { pending: 'coral', enrolled: 'ok', declined: 'gray' } as const;
const COLS = 'id, org_id, date, start_time, teacher_id, group_id, first_name, last_name, phone, email, note, outcome, outcome_at, student_id, created_at';

export default async function TrialsPage({ searchParams }: { searchParams: Promise<{ mesec?: string; izmeni?: string; ok?: string; err?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const period = parsePeriod(sp.mesec);
  const start = `${period}-01`;
  const end = `${shiftPeriod(period, 1)}-01`;
  const isCurrent = period === currentPeriod();
  const supabase = await createClient();
  const editId = sp.izmeni && /^[0-9a-f-]{36}$/i.test(sp.izmeni) ? sp.izmeni : null;

  // Predavač kroz RLS dobija samo svoje probne časove i svoje grupe.
  const [rows, { data: older }, { data: groups }, { data: profiles }, { data: editing }] = await Promise.all([
    fetchAll<TrialLesson>((a, b) => supabase.from('trial_lessons').select(COLS).eq('org_id', ctx.org.id).gte('date', start).lt('date', end).order('date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    isCurrent
      ? supabase.from('trial_lessons').select(COLS).eq('org_id', ctx.org.id).eq('outcome', 'pending').lt('date', start).order('date', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    supabase.from('groups').select('id, name, active').eq('org_id', ctx.org.id).order('name'),
    ctx.isOwner ? supabase.from('profiles').select('id, full_name, active').eq('org_id', ctx.org.id).order('full_name') : Promise.resolve({ data: null }),
    editId ? supabase.from('trial_lessons').select(COLS).eq('id', editId).eq('org_id', ctx.org.id).maybeSingle<TrialLesson>() : Promise.resolve({ data: null }),
  ]);
  const waiting = (older ?? []) as TrialLesson[];
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const teacherName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || 'Bez imena']));
  const stats = trialStats(rows);
  const label = periodLabel(period);
  const back = `/probni?mesec=${period}`;
  const edit = editing ?? null;

  const groupOptions = (groups ?? []).filter((g) => g.active || g.id === edit?.group_id).map((g) => ({ value: g.id, label: g.name }));
  const teacherOptions = (profiles ?? []).filter((p) => p.active || p.id === edit?.teacher_id).map((p) => ({ value: p.id, label: p.full_name || 'Bez imena' }));
  // Vlasnik bira ko je držao čas, da se probni ne upiše na pogrešnu osobu. Ako je u školi sam, izbor je već popunjen.
  const defaultTeacher = edit?.teacher_id ?? (teacherOptions.length === 1 ? teacherOptions[0].value : '');

  const item = (t: TrialLesson) => {
    const meta = [
      ctx.isOwner ? (t.teacher_id ? teacherName.get(t.teacher_id) ?? 'Bivši korisnik' : 'Bez predavača') : null,
      t.group_id ? groupName.get(t.group_id) ?? null : null,
    ].filter(Boolean).join(' · ');
    return (
      <li key={t.id} className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-extrabold text-ink">{fullName(t)}</div>
            <div className="text-[13px] font-semibold text-mut">{dateSr(t.date)}{t.start_time ? ` u ${time(t.start_time)}` : ''}{meta ? ` · ${meta}` : ''}</div>
          </div>
          <Badge tone={TONE[t.outcome]}>{TRIAL_OUTCOME_LABEL[t.outcome]}</Badge>
        </div>
        {(t.phone || t.email) && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] font-bold">
            {t.phone && <a className="text-brand" href={`tel:${t.phone.replace(/[^\d+]/g, '')}`}>{t.phone}</a>}
            {t.email && <a className="min-w-0 truncate text-brand" href={`mailto:${t.email}`}>{t.email}</a>}
          </div>
        )}
        {t.note && <p className="mt-1 whitespace-pre-line text-[14px] font-medium text-ink-2">{t.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {t.outcome === 'pending' ? (
            <form action={setTrialOutcome} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="back" value={back} />
              <button className="btn btn-sm" name="outcome" value="enrolled">Upisao/la se</button>
              <button className="btn btn-sm btn-soft" name="outcome" value="declined">Nije se upisao/la</button>
            </form>
          ) : (
            <>
              {t.outcome === 'enrolled' && ctx.isOwner && (
                t.student_id
                  ? <Link href={`/ucenici/${t.student_id}`} className="btn btn-sm btn-soft">Karton učenika</Link>
                  : <Link href={`/ucenici/novi?probni=${t.id}`} className="btn btn-sm">Dodaj u učenike</Link>
              )}
              <form action={setTrialOutcome}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="outcome" value="pending" />
                <button className="text-[13px] font-bold text-mut hover:text-brand">Promeni ishod</button>
              </form>
            </>
          )}
          <div className="ml-auto flex items-center gap-3 text-[13px] font-bold">
            <Link href={`${back}&izmeni=${t.id}#novi`} className="text-mut hover:text-brand">Izmeni</Link>
            {(ctx.isOwner || t.outcome === 'pending') && (
              <form action={deleteTrial}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="back" value={back} />
                <ConfirmButton message={`Obrisati probni čas: ${fullName(t)}?`} className="font-bold text-coral-dark hover:underline">Obriši</ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Probni časovi"
        subtitle={ctx.isOwner ? label : `${label} · tvoji probni časovi`}
        actions={
          <>
            <Link href={`/probni?mesec=${shiftPeriod(period, -1)}`} className="btn btn-soft" aria-label="Prethodni mesec">←</Link>
            {!isCurrent && <Link href="/probni" className="btn btn-soft">Ovaj mesec</Link>}
            <Link href={`/probni?mesec=${shiftPeriod(period, 1)}`} className="btn btn-soft" aria-label="Sledeći mesec">→</Link>
          </>
        }
      />
      <Flash ok={sp.ok ? OK[sp.ok] : undefined} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Probnih časova" value={stats.total} tone="brand" hint={label.toLowerCase()} />
        <Stat label="Upisalo se" value={stats.enrolled} tone="ok" hint={stats.pct === null ? 'još nema ishoda' : `${stats.pct}% od onih sa ishodom`} />
        <Stat label="Nije se upisalo" value={stats.declined} />
        <Stat label="Čeka odluku" value={stats.pending} tone={stats.pending ? 'coral' : 'default'} hint={stats.pending ? 'upiši ishod kad se zna' : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px] xl:items-start">
        <section id="novi" className="scroll-mt-24 xl:order-2">
          <Card title={edit ? 'Izmena probnog časa' : 'Upiši probni čas'}>
            <form action={saveTrial} className="flex flex-col gap-3">
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum" name="date" type="date" required defaultValue={edit?.date ?? todayISO()} />
                <Field label="Vreme" name="start_time" type="time" defaultValue={edit?.start_time ? time(edit.start_time) : ''} />
                <Field label="Ime" name="first_name" required defaultValue={edit?.first_name} autoComplete="off" />
                <Field label="Prezime" name="last_name" defaultValue={edit?.last_name} autoComplete="off" />
                <Field label="Telefon" name="phone" type="tel" defaultValue={edit?.phone} autoComplete="off" />
                <Field label="Email" name="email" type="email" defaultValue={edit?.email} autoComplete="off" />
              </div>
              {ctx.isOwner && <Select label="Probni čas je držao/la" name="teacher_id" required defaultValue={defaultTeacher} placeholder="Izaberi" options={teacherOptions} />}
              {groupOptions.length > 0 && <Select label="Grupa ili kurs" name="group_id" defaultValue={edit?.group_id ?? ''} placeholder="Nije određeno" options={groupOptions} />}
              <TextArea label="Napomena" name="note" defaultValue={edit?.note} placeholder="Nivo, utisak, šta je dogovoreno..." rows={2} />
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn">{edit ? 'Sačuvaj izmene' : 'Upiši probni čas'}</button>
                {edit && <Link href={back} className="text-[14px] font-bold text-mut hover:text-brand">Odustani</Link>}
              </div>
              <p className="text-[12px] font-semibold text-mut">Probni čas se vodi odvojeno od redovnih časova i ne ulazi u prisustvo ni u broj održanih časova. Ishod upiši kad kandidat odluči.</p>
            </form>
          </Card>
        </section>

        <div className="flex min-w-0 flex-col gap-6 xl:order-1">
          {rows.length === 0 ? (
            <Empty title="Nema probnih časova u ovom mesecu" text={ctx.isOwner ? 'Predavači ovde upisuju svaki održan probni čas, a ti vidiš koliko se kandidata posle njega upisalo.' : 'Upiši svaki probni čas koji održiš, pa kasnije dodaj da li se kandidat upisao.'} />
          ) : (
            <ul className="flex flex-col gap-3">{rows.map(item)}</ul>
          )}
          {waiting.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-extrabold text-ink">Čekaju odluku iz ranijih meseci</h2>
              <ul className="flex flex-col gap-3">{waiting.map(item)}</ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
