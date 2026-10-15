import { myTeamCookie } from "./cookies";

/**
 * Cache rule of a public tournament page response.
 *
 * Only a live refresh (`?fragment=1`) of a device without a team cookie and without a message is the same for
 * everyone: the CDN may keep it 4 s to absorb the simultaneous reloads after each score (the browser never keeps
 * it: max-age=0). Every fragment response, cached or not, varies on the device's team cookie so that a cached copy
 * is never served to a phone that carries `os_t_CODE` (`Netlify-Vary` for Netlify's CDN, `Vary` for the others).
 */
export function terrainCacheHeaders(opts: { code: string; fragment: boolean; mine: boolean; message: boolean }): Record<string, string> {
  if (!opts.fragment) return { "cache-control": "no-store" };
  const vary = { vary: "Cookie", "netlify-vary": `cookie=${myTeamCookie(opts.code)}` };
  if (opts.mine || opts.message) return { "cache-control": "no-store", ...vary };
  return { "cache-control": "public, max-age=0, s-maxage=4, stale-while-revalidate=4", ...vary };
}
