import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * TM2: the service worker keeps the scoring table page and its build files
 * after a first online opening, then serves them without network. Only
 * same-origin terrain pages and fingerprinted build files may be stored
 * (never an API answer, another site or a page with a query string).
 */

const ORIGIN = "https://orgasport.test";
const SOURCE = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8");

type Listener = (event: Record<string, unknown>) => void;

function worker(opts: { online: boolean }) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    const key = (req: string | Request) => (typeof req === "string" ? new URL(req, ORIGIN).href : req.url);
    return {
      put: async (req: string | Request, res: Response) => void m.set(key(req), res),
      match: async (req: string | Request, o?: { ignoreSearch?: boolean }) => {
        const k = key(req);
        const hit = m.get(k) ?? (o?.ignoreSearch ? m.get(k.split("?")[0]!) : undefined);
        return hit?.clone();
      },
      keys: async (req?: string | Request, o?: { ignoreSearch?: boolean }) => {
        const all = [...m.keys()];
        if (req === undefined) return all.map((u) => new Request(u));
        const k = key(req);
        return all.filter((u) => (o?.ignoreSearch ? u.split("?")[0] === k.split("?")[0] : u === k)).map((u) => new Request(u));
      },
    };
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  const fakeFetch = async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    fetched.push(url);
    if (!opts.online) throw new TypeError("Failed to fetch");
    return new Response(`<html>${new URL(url).pathname}</html>`, { status: 200 });
  };
  vm.runInNewContext(SOURCE, {
    self,
    caches: { open: async (name: string) => store(name) },
    fetch: fakeFetch,
    URL,
    Response,
    Request,
    Promise,
    Array,
  });

  async function message(data: unknown) {
    let done: Promise<unknown> = Promise.resolve();
    const replies: unknown[] = [];
    listeners.get("message")!({
      data,
      source: { postMessage: (m: unknown) => replies.push(m) },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    await done;
    return replies;
  }

  /** Returns the service worker's answer, or null when it lets the browser handle the request. */
  async function request(path: string, headers: Record<string, string> = {}) {
    const answers: Promise<Response>[] = [];
    listeners.get("fetch")!({
      request: new Request(new URL(path, ORIGIN).href, { headers }),
      respondWith: (p: Promise<Response>) => void answers.push(p),
    });
    return answers.length ? await answers[0]! : null;
  }

  const keys = (name: string) => [...(stores.get(name)?.keys() ?? [])].map((k) => k.replace(ORIGIN, ""));
  return { message, request, keys, fetched, open: store, setOnline: (v: boolean) => (opts.online = v) };
}

describe("service worker: scoring table without network (TM2)", () => {
  it("keeps the table page and its build files, and nothing else", async () => {
    const sw = worker({ online: true });
    const replies = await sw.message({
      type: "cache-page",
      path: "/c/7KQ2/table",
      urls: [
        "/c/7KQ2/table",
        `${ORIGIN}/_next/static/chunks/app-123.js`,
        "/_next/static/css/table-9.css",
        "/api/t/7KQ2/state",
        "/c/7KQ2/table?secret=1",
        "/club/concours",
        "https://evil.example/_next/static/chunks/x.js",
        "javascript:alert(1)",
      ],
    });
    expect(replies).toEqual([{ type: "page-cached", path: "/c/7KQ2/table" }]);
    expect(sw.keys("terrain-v1")).toEqual(["/c/7KQ2/table"]);
    expect(sw.keys("static-v1").sort()).toEqual(["/_next/static/chunks/app-123.js", "/_next/static/css/table-9.css"]);
    expect(sw.fetched.some((u) => u.includes("/api/") || u.includes("evil") || u.includes("/club/"))).toBe(false);
  });

  it("ignores other messages and caps the number of files", async () => {
    const sw = worker({ online: true });
    expect(await sw.message({ type: "other", urls: ["/c/7KQ2/table"] })).toEqual([]);
    await sw.message({ type: "cache-page", urls: Array.from({ length: 250 }, (_, i) => `/_next/static/chunks/${i}.js`) });
    expect(sw.keys("static-v1")).toHaveLength(200);
  });

  it("reopens the table and its build files from the cache when the network is down", async () => {
    const sw = worker({ online: true });
    await sw.message({ type: "cache-page", urls: ["/c/7KQ2/table", "/_next/static/chunks/app-123.js"] });
    sw.setOnline(false);
    const page = await sw.request("/c/7KQ2/table");
    expect(page?.status).toBe(200);
    expect(await page?.text()).toBe("<html>/c/7KQ2/table</html>");
    expect(await (await sw.request("/_next/static/chunks/app-123.js"))?.text()).toContain("app-123.js");
    // A file never stored is a network error, not a stale or empty answer.
    expect((await sw.request("/_next/static/chunks/missing.js"))?.type).toBe("error");
    // Another tournament never opened here: plain "Hors connexion".
    expect((await sw.request("/c/GP3M/table"))?.status).toBe(503);
  });

  it("never answers a React Server Components request with the cached HTML page", async () => {
    const sw = worker({ online: false });
    expect(await sw.request("/c/7KQ2/table?_rsc=abc")).toBeNull();
    expect(await sw.request("/c/7KQ2/table", { RSC: "1" })).toBeNull();
  });

  it("T4: an offline reload shows the newest live fragment in the cached page, never an older one, never a fragment alone", async () => {
    const sw = worker({ online: true });
    await sw.message({ type: "cache-page", urls: ["/c/7KQ2"] });
    const page = '<html><body><div id="live" data-version="5"><p>ancien</p></div><!--/live--><script>var OS_V=5;</script></body></html>';
    const cache = sw.open("terrain-v1");
    await cache.put("/c/7KQ2", new Response(page));
    await cache.put("/c/7KQ2?fragment=1", new Response('<div id="live" data-version="7"><p>récent</p></div>'));
    sw.setOnline(false);
    const merged = await (await sw.request("/c/7KQ2"))!.text();
    expect(merged).toBe('<html><body><div id="live" data-version="7"><p>récent</p></div><!--/live--><script>var OS_V=7;</script></body></html>');
    // Another view of the same page (?vue=…) never opened: the cached page, not the fragment alone.
    expect(await (await sw.request("/c/7KQ2?vue=tableau"))!.text()).toContain("<html>");
    await cache.put("/c/7KQ2?fragment=1", new Response('<div id="live" data-version="3"><p>vieux</p></div>'));
    expect(await (await sw.request("/c/7KQ2"))!.text()).toBe(page);
  });

  it("T4: keeps the teams page, and never caches the « Enregistrer pour hors ligne » download", async () => {
    const sw = worker({ online: true });
    await sw.message({ type: "cache-page", urls: ["/c/7KQ2/equipes"] });
    expect(sw.keys("terrain-v1")).toEqual(["/c/7KQ2/equipes"]);
    expect(await sw.request("/c/7KQ2?enregistrer=1")).toBeNull();
  });
});
