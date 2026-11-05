import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { PageHeader, Card, Badge } from '@/components/ui';
import { fullName, todayISO, dateLong, belgradeDayStart } from '@/lib/format';
import { Scanner } from './scanner';
import { undoCheckinForm } from './actions';
import { ConfirmButton } from '@/components/confirm';

export const metadata = { title: 'Dolasci' };

export default async function CheckinsPage() {
  const ctx = await requireOrg();
  const today = todayISO();
  const supabase = await createClient();
  const [sts, { data: rows }] = await Promise.all([
    fetchAll<{ id: string; first_name: string; last_name: string }>((a, b) => supabase.from('students').select('id, first_name, last_name').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b)),
    supabase.from('checkins').select('id, kind, at, picked_up_by, student_id, students(first_name, last_name)').eq('org_id', ctx.org.id).gte('at', belgradeDayStart(today)).order('at', { ascending: false }).limit(500),
  ]);
  type R = { id: string; kind: 'in' | 'out'; at: string; picked_up_by: string | null; student_id: string; students: { first_name: string; last_name: string } | null };
  const list = (rows ?? []) as unknown as R[];
  const state = new Map<string, 'in' | 'out'>();
  for (const r of [...list].reverse()) state.set(r.student_id, r.kind);
  const inside = [...state.entries()].filter(([, k]) => k === 'in').length;
  const t = (iso: string) => new Date(iso).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Belgrade' });

  return (
    <>
      <PageHeader title="Dolasci" subtitle={`${dateLong(today)} · trenutno prisutno: ${inside}`} actions={ctx.isOwner && <Link href="/dolasci/kartice" className="btn btn-soft">QR kartice</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Scanner students={sts.map((s) => ({ id: s.id, name: fullName(s), state: state.get(s.id) ?? null }))} />
        <Card title={`Danas (${list.length})`}>
          {list.length === 0 ? (
            <p className="text-[14px] font-semibold text-mut">Još nema dolazaka danas.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {list.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{r.students ? fullName(r.students) : ''}</span>
                    {r.picked_up_by && <span className="block truncate text-[12px] font-semibold text-mut">Preuzeo/la: {r.picked_up_by}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2"><Badge tone={r.kind === 'in' ? 'ok' : 'soft'}>{r.kind === 'in' ? 'Došao' : 'Otišao'}</Badge><span className="text-[13px] font-bold tabular-nums text-mut">{t(r.at)}</span>
                    <form action={undoCheckinForm}><input type="hidden" name="id" value={r.id} /><ConfirmButton message={`Poništiti ovaj upis (${r.students ? fullName(r.students) : ''})?`} className="text-[12px] font-bold text-coral-dark hover:underline">poništi</ConfirmButton></form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
