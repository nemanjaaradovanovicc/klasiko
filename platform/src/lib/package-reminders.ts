import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasNextPackage, packageReminderText, shouldRemindPackage } from '@/lib/packages';
import { packageBalances, type Balance } from '@/lib/packages-db';
import { emailEnabled, sendEmail } from '@/lib/email';
import { parentUrl } from '@/lib/parent';
import type { Organization } from '@/lib/types';

// Jedan mejl po paketu (ili porodičnom paketu), kad je ostao tačno jedan čas.
export async function sendPackageReminders(db: SupabaseClient, org: Organization, today: string): Promise<number> {
  if (!org.package_reminders || !emailEnabled()) return 0;
  const balances = await packageBalances(db, org.id, today);
  const due = balances.filter((b) => shouldRemindPackage(b.used, b.total, b.expired) && !hasNextPackage(balances, b));
  const groups = new Map<string, Balance[]>();
  for (const b of due) groups.set(b.bundle_id ?? b.id, [...(groups.get(b.bundle_id ?? b.id) ?? []), b]);

  let sent = 0;
  for (const items of groups.values()) {
    const anchor = [...items].sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))[0];
    const address = items.map((i) => i.email).find(Boolean);
    if (!address) continue;
    const { data } = await db.from('reminders').upsert({
      org_id: org.id,
      student_id: anchor.student_id,
      class_package_id: anchor.id,
      channel: 'email',
      kind: 'package_low',
    }, { onConflict: 'class_package_id,kind,channel', ignoreDuplicates: true }).select('id');
    if (!data?.length) continue;
    const families = [...new Set(items.map((i) => i.family_id).filter(Boolean))] as string[];
    const { data: siblings } = families.length ? await db.from('students').select('id').eq('org_id', org.id).in('family_id', families) : { data: [] };
    const linkIds = [...new Set([...items.map((i) => i.student_id), ...(siblings ?? []).map((x) => x.id)])];
    const { data: link } = await db.from('parent_links').select('token').eq('org_id', org.id).eq('revoked', false).in('student_id', linkIds).limit(1).maybeSingle();
    const price = Math.max(...items.map((i) => i.price));
    const res = await sendEmail({
      to: address,
      replyTo: org.email,
      subject: `${org.name}: još jedan čas u paketu`,
      text: packageReminderText({
        school: org.name,
        student: [...new Set(items.map((i) => i.name))].join(', '),
        used: anchor.used,
        total: anchor.total,
        price,
        currency: anchor.currency,
        instructions: org.payment_instructions,
        bankAccount: org.bank_account,
        link: link ? parentUrl(link.token) : null,
      }),
    });
    if (res.ok) sent++;
    else console.error('Podsetnik za paket nije poslat', org.id, res.error);
  }
  return sent;
}
