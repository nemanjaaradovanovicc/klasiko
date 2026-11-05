import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { orgAccess } from '@/lib/auth';
import { addDays, currentPeriod, fullName, periodLabel, rsd, todayISO } from '@/lib/format';
import { createChargesForPeriod } from '@/lib/charges';
import { emailEnabled, sendEmail } from '@/lib/email';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { pruneAttempts } from '@/lib/throttle';
import { parentUrl } from '@/lib/parent';
import type { Organization } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const AFTER_DUE_DAYS = 3;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Jednom dnevno (vercel.json): mesečna zaduženja i podsetnici za škole koje su ih uključile.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Nije dozvoljeno.' }, { status: 401 });
  const db = createAdminClient();
  const today = todayISO();
  const period = currentPeriod();
  const day = Number(today.slice(8, 10));
  await pruneAttempts();

  const orgs = await fetchAll<Organization & { last_auto_period: string | null }>((a, b) => db.from('organizations').select('*').or('auto_charges.eq.true,auto_reminders.eq.true').order('id').range(a, b));
  const summary = { orgs: orgs.length, charges: 0, emails: 0, errors: [] as string[] };

  for (const org of orgs) {
    if (!orgAccess(org).ok) continue;
    try {
      // Jednom po mesecu: obrisano zaduženje se ne vraća samo od sebe sledećeg dana.
      if (org.auto_charges && day >= org.auto_charge_day && org.last_auto_period !== period) {
        const res = await createChargesForPeriod(db, org, period);
        if (res.error) summary.errors.push(`${org.id}: ${res.error}`);
        else {
          summary.charges += res.created;
          await db.from('organizations').update({ last_auto_period: period }).eq('id', org.id);
        }
      }
      if (org.auto_reminders && emailEnabled()) summary.emails += await sendAutoReminders(db, org, today);
    } catch (e) {
      summary.errors.push(`${org.id}: ${e instanceof Error ? e.message : 'greška'}`);
    }
  }
  if (summary.errors.length) console.error('Cron greške', summary.errors);
  return NextResponse.json(summary);
}

async function sendAutoReminders(db: ReturnType<typeof createAdminClient>, org: Organization, today: string): Promise<number> {
  type C = { id: string; period: string; due_date: string | null; description: string | null; amount: number; student_id: string; payments: { amount: number }[]; students: { id: string; first_name: string; last_name: string; parent_email: string | null; email: string | null; active: boolean; family_id: string | null } | null };
  // Samo zaduženja čiji je rok u prozoru, da se stari dugovi ne šalju svaki dan.
  const from = addDays(today, -(AFTER_DUE_DAYS + 7));
  const to = addDays(today, org.reminder_days_before);
  const charges = await fetchAll<C>((a, b) => db.from('charges').select('id, period, due_date, description, amount, student_id, payments(amount), students(id, first_name, last_name, parent_email, email, active, family_id)').eq('org_id', org.id).gte('due_date', from).lte('due_date', to).order('id').range(a, b));

  const byEmail = new Map<string, { kind: 'before_due' | 'after_due'; charge: C; remaining: number }[]>();
  for (const c of charges) {
    const st = c.students;
    const address = (st?.parent_email || st?.email || '').trim().toLowerCase();
    const remaining = Number(c.amount) - c.payments.reduce((x, p) => x + Number(p.amount), 0);
    if (!st?.active || !address || remaining <= 0 || !c.due_date) continue;
    const kind = c.due_date >= today ? 'before_due' : c.due_date <= addDays(today, -AFTER_DUE_DAYS) ? 'after_due' : null;
    if (!kind) continue;
    byEmail.set(address, [...(byEmail.get(address) ?? []), { kind, charge: c, remaining }]);
  }

  let sent = 0;
  for (const [address, items] of byEmail) {
    // Upis pre slanja: jedinstveni indeks garantuje da isti podsetnik ne ode dvaput.
    const fresh: typeof items = [];
    for (const it of items) {
      const { data } = await db.from('reminders').upsert({ org_id: org.id, student_id: it.charge.student_id, charge_id: it.charge.id, channel: 'email', kind: it.kind }, { onConflict: 'charge_id,kind,channel', ignoreDuplicates: true }).select('id');
      if (data?.length) fresh.push(it);
    }
    if (fresh.length === 0) continue;
    // Link porodice može da glasi na brata ili sestru.
    const families = [...new Set(fresh.map((f) => f.charge.students?.family_id).filter(Boolean))] as string[];
    const { data: siblings } = families.length ? await db.from('students').select('id').eq('org_id', org.id).in('family_id', families) : { data: [] };
    const linkIds = [...new Set([...fresh.map((f) => f.charge.student_id), ...(siblings ?? []).map((x) => x.id)])];
    const { data: link } = await db.from('parent_links').select('token').eq('org_id', org.id).eq('revoked', false).in('student_id', linkIds).limit(1).maybeSingle();
    const total = fresh.reduce((a, f) => a + f.remaining, 0);
    const late = fresh.some((f) => f.kind === 'after_due');
    const res = await sendEmail({
      to: address,
      replyTo: org.email,
      subject: `${org.name}: ${late ? 'rok za uplatu je prošao' : 'podsetnik za uplatu'}`,
      text: [
        'Dobar dan!',
        '',
        late ? 'Podsećamo da uplata još nije evidentirana:' : 'Podsećamo da uskoro dospeva uplata:',
        ...fresh.map((f) => `${fullName(f.charge.students!)}, ${periodLabel(f.charge.period)}${f.charge.description ? ` (${f.charge.description})` : ''}: ${rsd(f.remaining)}`),
        `Ukupno: ${rsd(total)}`,
        org.bank_account ? `Račun: ${org.bank_account}` : '',
        link ? `QR kod za uplatu i detalji: ${parentUrl(link.token)}` : '',
        '',
        `Ako ste već uplatili, zanemarite poruku. Hvala! ${org.name}`,
      ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n'),
    });
    if (res.ok) sent++;
    else console.error('Podsetnik nije poslat', org.id, res.error);
  }
  return sent;
}
