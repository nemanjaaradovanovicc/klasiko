'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { currentPeriod } from '@/lib/format';
import { debtMessage, loadDebts } from '@/lib/debts';
import { emailEnabled, sendEmail } from '@/lib/email';
import { parentUrl } from '@/lib/parent';
import { fetchAll } from '@/lib/supabase/fetch-all';

// Beleži da je roditelju poslat podsetnik preko WhatsApp-a.
export async function logWhatsappReminder(studentIds: string[]): Promise<{ ok?: boolean }> {
  const ctx = await requireOwner();
  const supabase = await createClient();
  if (studentIds.length) await supabase.from('reminders').insert(studentIds.map((id) => ({ org_id: ctx.org.id, student_id: id, channel: 'whatsapp', kind: 'manual', sent_by: ctx.userId })));
  revalidatePath('/uplate/dugovanja');
  return { ok: true };
}

// Podsetnik mejlom svima sa dugom koji imaju email roditelja.
export async function emailAllDebtors(): Promise<{ sent?: number; failed?: number; error?: string }> {
  const ctx = await requireOwner();
  if (!emailEnabled()) return { error: 'Slanje emaila nije podešeno na serveru.' };
  const supabase = await createClient();
  const [rows, links] = await Promise.all([
    loadDebts(supabase, ctx.org.id, currentPeriod()),
    fetchAll<{ student_id: string; token: string }>((a, b) => supabase.from('parent_links').select('student_id, token').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)),
  ]);
  const linkBy = new Map(links.map((l) => [l.student_id, l.token]));
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (!row.email) continue;
    const token = row.familyIds.map((id) => linkBy.get(id)).find(Boolean);
    const res = await sendEmail({ to: row.email, replyTo: ctx.org.email, subject: `${ctx.org.name}: podsetnik za uplatu`, text: debtMessage(row, ctx.org.name, ctx.org.bank_account, token ? parentUrl(token) : null) });
    if (res.ok) {
      sent++;
      await supabase.from('reminders').insert(row.students.map((s) => ({ org_id: ctx.org.id, student_id: s.id, channel: 'email', kind: 'manual', sent_by: ctx.userId })));
    } else failed++;
  }
  revalidatePath('/uplate/dugovanja');
  return { sent, failed };
}
