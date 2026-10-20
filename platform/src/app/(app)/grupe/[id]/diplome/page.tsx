import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { Certificates } from '@/components/certificates';
import { fullName } from '@/lib/format';

export const metadata = { title: 'Diplome za grupu' };

export default async function GroupCertificates({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();
  const { data: g } = await supabase.from('groups').select('id, name, level').eq('id', id).eq('org_id', ctx.org.id).single();
  if (!g) notFound();
  const { data: m } = await supabase.from('group_members').select('students(first_name, last_name, active)').eq('group_id', id);
  const names = ((m ?? []) as unknown as { students: { first_name: string; last_name: string; active: boolean } | null }[])
    .map((x) => x.students).filter((x): x is NonNullable<typeof x> => !!x && x.active).map(fullName).sort((a, b) => a.localeCompare(b, 'sr'));
  return (
    <>
      <div className="print:hidden"><PageHeader title="Diplome za grupu" subtitle={`${g.name} · ${names.length} učenika`} back={{ href: `/grupe/${g.id}`, label: g.name }} /></div>
      <Certificates names={names.length ? names : ['Ime učenika']} school={ctx.org.name} signer={ctx.profile.full_name} city={ctx.org.city ?? ''} defaultText={g.level ? `za uspešno završen nivo ${g.level}` : undefined} />
    </>
  );
}
