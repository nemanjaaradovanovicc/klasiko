import { describe, expect, it } from 'vitest';
import { applyChosenPassword, passwordError, type PasswordAdmin } from '@/lib/passwords';

function admin() {
  const calls: { op: string; attrs?: unknown }[] = [];
  const state: { user: { id: string } | null; getError?: string; updateError?: string; createError?: string } = { user: { id: 'u1' } };
  const api: PasswordAdmin = {
    async getUserById() {
      calls.push({ op: 'get' });
      return { user: state.user, error: state.getError ?? null };
    },
    async updateUserById(_id, attrs) {
      calls.push({ op: 'update', attrs });
      return { error: state.updateError ?? null };
    },
    async createUser(attrs) {
      calls.push({ op: 'create', attrs });
      return { error: state.createError ?? null };
    },
  };
  return { api, calls, state };
}

const member = { id: 'u1', email: 'ana@skola.rs', full_name: 'Ana' };

describe('lozinka koju vlasnik upisuje', () => {
  it('odbija kraću od 8 znakova i ne dira nalog', async () => {
    expect(passwordError('kratka')).toMatch(/8/);
    const a = admin();
    expect(await applyChosenPassword(a.api, member, 'kratka')).toEqual({ error: 'Lozinka mora imati najmanje 8 znakova.' });
    expect(a.calls).toEqual([]);
  });
  it('menja lozinku postojećeg naloga i ne šalje pozivnicu', async () => {
    const a = admin();
    expect(await applyChosenPassword(a.api, member, 'tajna-lozinka')).toEqual({});
    expect(a.calls.map((c) => c.op)).toEqual(['get', 'update']);
    expect(a.calls[1].attrs).toEqual({ password: 'tajna-lozinka', email_confirm: true });
  });
  it('pravi nalog sa istim id-jem ako auth korisnik ne postoji', async () => {
    const a = admin();
    a.state.user = null;
    a.state.getError = 'User not found';
    expect(await applyChosenPassword(a.api, member, 'tajna-lozinka')).toEqual({});
    expect(a.calls.map((c) => c.op)).toEqual(['get', 'create']);
    expect(a.calls[1].attrs).toEqual({
      id: 'u1',
      email: 'ana@skola.rs',
      password: 'tajna-lozinka',
      email_confirm: true,
      user_metadata: { full_name: 'Ana' },
    });
    expect(JSON.stringify(a.calls[1].attrs)).not.toContain('invite');
  });
  it('ne pravi nalog kad provera naloga padne iz drugog razloga', async () => {
    const a = admin();
    a.state.user = null;
    a.state.getError = 'network down';
    expect(await applyChosenPassword(a.api, member, 'tajna-lozinka')).toEqual({ error: 'Nalog za prijavu nije proveren.' });
    expect(a.calls.map((c) => c.op)).toEqual(['get']);
  });
  it('javlja da email već postoji i ne vraća lozinku', async () => {
    const a = admin();
    a.state.user = null;
    a.state.getError = 'User not found';
    a.state.createError = 'A user with this email address has already been registered';
    const res = await applyChosenPassword(a.api, member, 'tajna-lozinka');
    expect(res).toEqual({ error: 'Korisnik sa tim emailom već postoji.' });
    expect(JSON.stringify(res)).not.toContain('tajna-lozinka');
  });
  it('ne vraća lozinku u odgovoru', async () => {
    const a = admin();
    const res = await applyChosenPassword(a.api, member, 'tajna-lozinka');
    expect(res).not.toHaveProperty('password');
    expect(JSON.stringify(res)).not.toContain('tajna-lozinka');
  });
});
