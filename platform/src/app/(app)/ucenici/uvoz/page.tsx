import { requireOwner } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { Importer } from './importer';

export const metadata = { title: 'Uvoz učenika' };

export default async function ImportPage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Uvoz iz Excel-a" subtitle="Prebaci postojeći spisak učenika za par minuta" back={{ href: '/ucenici', label: 'Učenici' }} />
      <Importer />
      <p className="mt-6 text-[13px] font-semibold text-mut">Ako ti je lakše, pošalji nam tabelu na WhatsApp i mi ćemo besplatno uvesti podatke umesto tebe.</p>
    </>
  );
}
