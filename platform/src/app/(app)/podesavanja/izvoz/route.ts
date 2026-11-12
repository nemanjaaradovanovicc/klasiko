import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { audit } from '@/lib/audit';
import { todayISO } from '@/lib/format';

// Svi podaci škole u jednom fajlu: pravo na prenosivost i izlaz iz usluge.
const TABLES: [string, string][] = [
  ['rooms', 'id'], ['groups', 'id'], ['students', 'id'], ['group_members', 'group_id,student_id'], ['group_waitlist', 'group_id,student_id'],
  ['schedule_slots', 'id'], ['sessions', 'id'], ['attendance', 'session_id,student_id'], ['charges', 'id'], ['payments', 'id'],
  ['class_packages', 'id'], ['lesson_packages', 'id'], ['class_package_students', 'class_package_id,student_id'], ['package_extensions', 'class_package_id,session_id'], ['checkins', 'id'], ['absence_notices', 'id'], ['announcements', 'id'], ['reminders', 'id'], ['trial_lessons', 'id'],
];

export async function GET() {
  const ctx = await requireOwner();
  const supabase = await createClient();
  const out: Record<string, unknown> = { izvezeno: new Date().toISOString(), skola: ctx.org };
  for (const [table, order] of TABLES) {
    out[table] = await fetchAll<unknown>((a, b) => {
      let q = supabase.from(table).select('*').eq('org_id', ctx.org.id);
      for (const col of order.split(',')) q = q.order(col);
      return q.range(a, b);
    });
  }
  await audit({ userId: ctx.userId, email: ctx.email }, 'org.export', { orgId: ctx.org.id });
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="klasiko-podaci-${todayISO()}.json"`, 'Cache-Control': 'no-store' },
  });
}
