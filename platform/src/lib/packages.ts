// Paketi časova: koliko je ostalo učeniku (kupljeno minus odslušano), računato iz prisustva.
export type PackageRow = { student_id: string; group_id: string; classes_total: number; purchased_at: string; expires_at: string | null };
export type PresenceRow = { student_id: string; group_id: string; date: string };

export function packageBalance(packages: PackageRow[], presence: PresenceRow[], today: string): { total: number; used: number; remaining: number; expired: boolean } {
  const live = packages.filter((p) => !p.expires_at || p.expires_at >= today);
  if (live.length === 0) return { total: 0, used: 0, remaining: 0, expired: packages.length > 0 };
  const from = live.map((p) => p.purchased_at).sort()[0];
  const total = live.reduce((a, p) => a + p.classes_total, 0);
  const used = presence.filter((x) => x.date >= from).length;
  return { total, used, remaining: Math.max(0, total - used), expired: false };
}
