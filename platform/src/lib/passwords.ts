// Lozinka koju vlasnik sam unese. Ne šalje mejl ni pozivnicu. Ne vraća lozinku nazad.

export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Lozinka mora imati najmanje 8 znakova.';
  if (password.length > 72) return 'Lozinka može imati najviše 72 znaka.';
  return null;
}

export type PasswordAdmin = {
  getUserById(id: string): Promise<{ user: { id: string } | null; error?: string | null }>;
  updateUserById(id: string, attrs: { password: string; email_confirm: true }): Promise<{ error?: string | null }>;
  createUser(attrs: { id: string; email: string; password: string; email_confirm: true; user_metadata?: { full_name: string } }): Promise<{ error?: string | null }>;
};

export async function applyChosenPassword(
  admin: PasswordAdmin,
  member: { id: string; email: string; full_name: string },
  password: string,
): Promise<{ error?: string }> {
  const bad = passwordError(password);
  if (bad) return { error: bad };
  const existing = await admin.getUserById(member.id);
  const missing = !existing.user && (!existing.error || /not found/i.test(existing.error));
  if (existing.error && !missing) return { error: 'Nalog za prijavu nije proveren.' };
  if (existing.user) {
    const updated = await admin.updateUserById(member.id, { password, email_confirm: true });
    if (updated.error) return { error: 'Lozinka nije sačuvana.' };
    return {};
  }
  const created = await admin.createUser({
    id: member.id,
    email: member.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: member.full_name },
  });
  if (created.error) {
    return { error: /already|registered|exists/i.test(created.error) ? 'Korisnik sa tim emailom već postoji.' : 'Nalog za prijavu nije napravljen.' };
  }
  return {};
}
