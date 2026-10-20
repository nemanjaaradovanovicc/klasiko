import { requireOwner } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { Matcher } from './matcher';

export const metadata = { title: 'Uvoz izvoda' };

export default async function StatementPage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Uplate sa izvoda" subtitle="Klasiko sam prepozna ko je platio" back={{ href: '/uplate', label: 'Uplate' }} />
      <Matcher />
    </>
  );
}
