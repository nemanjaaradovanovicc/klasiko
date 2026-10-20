import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { Certificates } from '@/components/certificates';
import { fullName } from '@/lib/format';

export const metadata = { title: 'Diploma' };

export default async function StudentCertificate({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from('students').select('id, first_name, last_name').eq('id', id).eq('org_id', ctx.org.id).single();
  if (!s) notFound();
  return (
    <>
      <div className="print:hidden"><PageHeader title="Diploma ili sertifikat" subtitle={fullName(s)} back={{ href: `/ucenici/${s.id}`, label: 'Karton učenika' }} /></div>
      <Certificates names={[fullName(s)]} school={ctx.org.name} signer={ctx.profile.full_name} city={ctx.org.city ?? ''} />
    </>
  );
}
