// Supabase po podrazumevanom vraća najviše 1000 redova po upitu. Ovo čita sve, stranu po stranu.
// Upit mora imati stabilan redosled (.order), a build dobija opseg za .range(from, to).
type Page = { data: unknown; error: { message: string } | null };

export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<Page>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

// Upit sa .in(...) ide u delovima, jer dugačka lista ne staje u adresu zahteva.
export function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
