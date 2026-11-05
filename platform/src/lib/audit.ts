import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Dnevnik radnji. Greška u upisu nikad ne sme da obori radnju koju beleži.
export async function audit(actor: { userId?: string | null; email?: string | null }, action: string, opts: { orgId?: string | null; target?: string | null; details?: Record<string, unknown> } = {}) {
  try {
    await createAdminClient().from('audit_log').insert({ actor_id: actor.userId ?? null, actor_email: actor.email ?? null, action, org_id: opts.orgId ?? null, target: opts.target ?? null, details: opts.details ?? null });
  } catch (e) {
    console.error('Dnevnik nije upisan', action, e);
  }
}

export const AUDIT_LABEL: Record<string, string> = {
  'admin.enter_org': 'Admin Klasika je ušao u školu',
  'admin.create_org': 'Škola je napravljena',
  'admin.update_org': 'Podaci škole su izmenjeni',
  'admin.delete_org': 'Škola je obrisana',
  'admin.reset_password': 'Admin je resetovao lozinku',
  'admin.set_user_active': 'Admin je promenio status korisnika',
  'admin.subscription_payment': 'Evidentirana uplata pretplate',
  'admin.subscription_payment_deleted': 'Obrisana uplata pretplate',
  'org.register': 'Škola se registrovala',
  'team.reset_password': 'Resetovana lozinka člana tima',
  'team.set_active': 'Promenjen status člana tima',
  'team.add': 'Dodat član tima',
  'student.delete': 'Učenik je trajno obrisan',
  'group.delete': 'Grupa je trajno obrisana',
  'org.export': 'Izvezeni svi podaci škole',
};
