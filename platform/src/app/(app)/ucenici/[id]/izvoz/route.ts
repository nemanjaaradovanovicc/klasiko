import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';

// Svi podaci jednog učenika, kad roditelj zatraži pristup podacima.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();
  const { data: student } = await supabase.from('students').select('*').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!student) return new NextResponse('Učenik nije pronađen.', { status: 404 });
  const by = (table: string, order: string) => fetchAll<unknown>((a, b) => supabase.from(table).select('*').eq('org_id', ctx.org.id).eq('student_id', id).order(order).range(a, b));
  const [grupe, zaduzenja, uplate, prisustvo, dolasci, izostanci, paketi] = await Promise.all([
    by('group_members', 'group_id'), by('charges', 'id'), by('payments', 'id'), by('attendance', 'session_id'), by('checkins', 'id'), by('absence_notices', 'id'), by('class_packages', 'id'),
  ]);
  const body = { izvezeno: new Date().toISOString(), skola: ctx.org.name, ucenik: student, grupe, zaduzenja, uplate, prisustvo, dolasci, izostanci, paketi };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="klasiko-ucenik-${student.ref_no}.json"`, 'Cache-Control': 'no-store' },
  });
}
