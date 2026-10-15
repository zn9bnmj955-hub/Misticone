/**
 * Short in-memory cache of a value keyed by code and `state_version`.
 * On the tournament day thousands of phones reload the public page after
 * each score: instead of rebuilding the whole tournament for each of them,
 * one light query reads the version and the full state is loaded once per
 * version (concurrent requests share the same load). `ttlMs` bounds how long
 * edits that do not bump the version (name, address…) may stay unseen.
 */
export function createVersionedCache<T>(opts: {
  readVersion: (code: string) => Promise<number | null>;
  load: (code: string) => Promise<T | null>;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}) {
  const { readVersion, load, ttlMs = 15_000, maxEntries = 200, now = Date.now } = opts;
  const entries = new Map<string, { version: number; at: number; value: Promise<T | null> }>();

  return async function get(code: string): Promise<T | null> {
    const version = await readVersion(code);
    if (version === null) {
      entries.delete(code);
      return null;
    }
    const hit = entries.get(code);
    if (hit && hit.version === version && now() - hit.at < ttlMs) return hit.value;
    const value = load(code);
    entries.delete(code);
    entries.set(code, { version, at: now(), value });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    value.catch(() => {
      if (entries.get(code)?.value === value) entries.delete(code);
    });
    return value;
  };
}
