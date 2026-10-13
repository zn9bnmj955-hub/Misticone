/**
 * Download of a news feed: http(s) only, no local/private address, 8 s
 * timeout, 1 MB cap (the body is read in chunks and abandoned beyond it),
 * an identifying User-Agent. Pure enough to be tested with a mocked fetch.
 */

export const FEED_TIMEOUT_MS = 8000;
export const FEED_MAX_BYTES = 1_000_000;
export const FEED_USER_AGENT = "OrgaSport-Actualites/1.0 (+https://orgasport.fr)";

export type DownloadError = "invalidUrl" | "http" | "tooLarge" | "timeout" | "network";
export type DownloadResult = { ok: true; text: string; url: string } | { ok: false; error: DownloadError; status?: number };

/** Hosts a feed must never point to (the server would fetch its own network). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 literal: loopback, unspecified, unique-local, link-local, IPv4-mapped.
  if (h.includes(":")) return h === "::1" || h === "::" || /^(fc|fd|fe[89ab])/.test(h) || h.startsWith("::ffff:");
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** The feed URL when it is an absolute public http(s) address, else null. */
export function feedUrlOrNull(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function charsetOf(contentType: string | null, head: Uint8Array): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  const prolog = new TextDecoder("latin1").decode(head.subarray(0, 200));
  return prolog.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? "utf-8";
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function downloadFeed(
  rawUrl: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<DownloadResult> {
  const url = feedUrlOrNull(rawUrl);
  if (!url) return { ok: false, error: "invalidUrl" };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? FEED_MAX_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FEED_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": FEED_USER_AGENT,
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
    });
    // A redirect may not land on a private address either.
    if (res.url && !feedUrlOrNull(res.url)) return { ok: false, error: "invalidUrl" };
    if (!res.ok) return { ok: false, error: "http", status: res.status };
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, error: "tooLarge" };
    if (!res.body) return { ok: true, text: "", url: url.toString() };

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "tooLarge" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { ok: true, text: decode(bytes, res.headers.get("content-type")), url: url.toString() };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (signal.aborted || name === "TimeoutError" || name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "network" };
  }
}
