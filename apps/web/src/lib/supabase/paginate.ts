/** Supabase/PostgREST caps every response at `max_rows` (1000): read big tables page by page. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Reads every row of a query, page by page. `page(from, to)` must apply a
 * stable order and `.range(from, to)`. Any error is thrown: callers never
 * work on a silently truncated list.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => Page<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const list = data ?? [];
    rows.push(...list);
    if (list.length < pageSize) return rows;
  }
}

/** Splits ids for `.in()` filters: the ids travel in the URL, which is limited in length (414 beyond ~200 uuids). */
export function chunk<T>(list: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Throws the error of a single Supabase response, returns its data otherwise. */
export function must<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw res.error;
  return res.data;
}
