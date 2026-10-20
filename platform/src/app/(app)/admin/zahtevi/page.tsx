import Link from 'next/link';
import { requireSuper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { KINDS } from '@/lib/types';
import { updateDemo } from '../actions';

export const metadata = { title: 'Zahtevi za demo' };

const STATUSES: Record<string, string> = { new: 'Novo', contacted: 'Kontaktiran', trial: 'Probni nalog', won: 'Kupio', lost: 'Odustao' };

export default async function DemoRequests() {
  await requireSuper();
  const db = createAdminClient();
  const { data } = await db.from('demo_requests').select('*').order('created_at', { ascending: false }).limit(200);
  const list = data ?? [];
  return (
    <>
      <PageHeader title="Zahtevi za demo" subtitle="Prijave sa sajta klasiko.rs" back={{ href: '/admin', label: 'Admin' }} />
      {list.length === 0 ? (
        <Empty title="Još nema zahteva" text="Kad neko popuni formu za demo na sajtu, pojaviće se ovde." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((d) => {
            const wa = d.phone ? `https://wa.me/${String(d.phone).replace(/\D/g, '').replace(/^0/, '381')}` : null;
            return (
              <div key={d.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-extrabold text-ink">{d.name}</span>
                      <Badge tone={d.status === 'new' ? 'coral' : d.status === 'won' ? 'ok' : 'soft'}>{STATUSES[d.status]}</Badge>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-mut">
                      {[d.school, d.kind ? KINDS[d.kind] ?? d.kind : null, d.students_count ? `${d.students_count} učenika` : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-ink-2">
                      {d.phone && <a className="mr-3 font-bold text-brand" href={`tel:${d.phone}`}>{d.phone}</a>}
                      {d.email && <a className="font-bold text-brand" href={`mailto:${d.email}`}>{d.email}</a>}
                    </div>
                    {d.preferred_time && <div className="mt-1 text-[13px] font-semibold text-mut">Kada da se javiš: {d.preferred_time}</div>}
                    {d.message && <p className="mt-2 max-w-2xl text-[14px] font-medium text-ink-2">{d.message}</p>}
                    <div className="mt-1 text-[12px] font-semibold text-mut">{new Date(d.created_at).toLocaleString('sr-Latn-RS', { timeZone: 'Europe/Belgrade' })}{d.source ? ` · ${d.source}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wa && <a className="btn btn-sm btn-soft" href={wa} target="_blank" rel="noopener">WhatsApp</a>}
                    {!d.org_id && <Link className="btn btn-sm" href={`/admin?demo=${d.id}`}>Napravi probni nalog</Link>}
                  </div>
                </div>
                <form action={updateDemo} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <input type="hidden" name="id" value={d.id} />
                  <select name="status" defaultValue={d.status} className="input h-9 w-auto text-sm">
                    {Object.entries(STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input name="admin_notes" defaultValue={d.admin_notes ?? ''} placeholder="Beleška" className="input h-9 min-w-[200px] flex-1 text-sm" />
                  <button className="btn btn-sm btn-soft">Sačuvaj</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
