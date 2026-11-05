import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Flash, Empty, Badge } from '@/components/ui';
import { ConfirmButton } from '@/components/confirm';
import { dateSr } from '@/lib/format';
import { emailEnabled } from '@/lib/email';
import { createAnnouncement, deleteAnnouncement } from './actions';

export const metadata = { title: 'Obaveštenja' };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: list }, { data: groups }] = await Promise.all([
    supabase.from('announcements').select('id, title, body, created_at, group_id, groups(name)').eq('org_id', ctx.org.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('groups').select('id, name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
  ]);
  const rows = (list ?? []) as unknown as { id: string; title: string; body: string | null; created_at: string; group_id: string | null; groups: { name: string } | null }[];
  return (
    <>
      <PageHeader title="Obaveštenja" subtitle="Roditelji ih vide na svom linku" />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <Empty title="Još nema obaveštenja" text="Npr. „Ne radimo 15. i 16. februara” ili „Javni čas je u subotu u 18 h”." />
          ) : rows.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-extrabold text-ink">{n.title}</div>
                <Badge tone={n.group_id ? 'soft' : 'brand'}>{n.groups?.name ?? 'Svi'}</Badge>
              </div>
              {n.body && <p className="mt-1 whitespace-pre-line text-[14px] font-medium text-ink-2">{n.body}</p>}
              <div className="mt-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-mut">
                <span>{dateSr(n.created_at.slice(0, 10))}</span>
                {ctx.isOwner && <form action={deleteAnnouncement}><input type="hidden" name="id" value={n.id} /><ConfirmButton message="Obrisati obaveštenje?" className="font-bold text-coral-dark hover:underline">obriši</ConfirmButton></form>}
              </div>
            </div>
          ))}
        </div>
        <Card title="Novo obaveštenje">
          <form action={createAnnouncement} className="flex flex-col gap-3">
            <label className="block"><span className="label">Kome</span>
              <select name="group_id" className="input" defaultValue="" required={!ctx.isOwner}>
                {ctx.isOwner ? <option value="">Svim roditeljima</option> : <option value="">Izaberi grupu</option>}
                {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Naslov</span><input name="title" className="input" maxLength={140} required /></label>
            <label className="block"><span className="label">Tekst</span><textarea name="body" className="input" rows={4} maxLength={4000} /></label>
            {emailEnabled() && (
              <label className="flex items-center gap-3 text-[14px] font-semibold text-ink-2"><input type="checkbox" name="send_email" className="h-5 w-5 accent-[#5B2A86]" /> Pošalji i na email roditelja</label>
            )}
            <div><button className="btn">Objavi</button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
