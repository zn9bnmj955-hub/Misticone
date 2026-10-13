import { describe, expect, it, vi } from "vitest";
import { FEED_USER_AGENT, downloadFeed, isPrivateHost } from "./download";
import { cleanTitle, parseFeed, safeHttpUrl } from "./rss";
import { toNewsRows } from "./rows";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE rss [<!ENTITY boom "BOOM">]>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Pétanque Infos</title>
    <atom:link href="https://example.org/feed.xml" rel="self" />
    <item>
      <title>Championnat de France &amp;eacute;dition 2026 : les &lt;b&gt;qualifiés&lt;/b&gt;</title>
      <link>https://example.org/actu/1</link>
      <pubDate>Mon, 12 Oct 2026 08:30:00 +0200</pubDate>
      <description>Un long texte qui ne doit jamais être copié.</description>
    </item>
    <item>
      <title><![CDATA[Le « Mondial » à Marseille]]></title>
      <guid isPermaLink="true">https://example.org/actu/2</guid>
      <dc:date>2026-10-11T18:00:00Z</dc:date>
    </item>
    <item><title>Lien piégé</title><link>javascript:alert(1)</link></item>
    <item><title>Sans lien</title></item>
    <item><title>Doublon</title><link>https://example.org/actu/1</link></item>
    <item><title>Relatif</title><link>/actu/3</link><pubDate>pas une date</pubDate></item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Foot amateur</title>
  <entry>
    <title type="html">Coupe du district &amp;#8211; le tirage</title>
    <link rel="self" href="https://example.org/feed/1" />
    <link rel="alternate" href="https://example.org/foot/1" />
    <updated>2026-10-10T12:00:00Z</updated>
    <published>2026-10-09T12:00:00Z</published>
  </entry>
  <entry>
    <title>Deuxième</title>
    <link href="http://example.org/foot/2" />
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS 2.0: title, link, date only, safely", () => {
    const entries = parseFeed(RSS, "https://example.org/feed.xml");
    expect(entries).toEqual([
      { title: "Championnat de France édition 2026 : les qualifiés", url: "https://example.org/actu/1", publishedAt: "2026-10-12T06:30:00.000Z" },
      { title: "Le « Mondial » à Marseille", url: "https://example.org/actu/2", publishedAt: "2026-10-11T18:00:00.000Z" },
      { title: "Relatif", url: "https://example.org/actu/3", publishedAt: null },
    ]);
  });

  it("reads Atom, preferring the alternate link and the publication date", () => {
    expect(parseFeed(ATOM)).toEqual([
      { title: "Coupe du district – le tirage", url: "https://example.org/foot/1", publishedAt: "2026-10-09T12:00:00.000Z" },
      { title: "Deuxième", url: "http://example.org/foot/2", publishedAt: null },
    ]);
  });

  it("refuses documents that are not feeds", () => {
    expect(() => parseFeed("<html><body>Bonjour</body></html>")).toThrow();
  });

  it("caps titles at 300 characters and keeps only http(s) links", () => {
    expect(cleanTitle("a".repeat(400))).toHaveLength(300);
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl(" https://example.org/a ")).toBe("https://example.org/a");
  });
});

describe("toNewsRows", () => {
  it("drops items older than 60 days and clamps future dates", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    const rows = toNewsRows(
      "src",
      [
        { title: "old", url: "https://e.org/1", publishedAt: "2026-07-01T00:00:00Z" },
        { title: "future", url: "https://e.org/2", publishedAt: "2027-01-01T00:00:00Z" },
        { title: "undated", url: "https://e.org/3", publishedAt: null },
      ],
      now,
    );
    expect(rows.map((r) => [r.title, r.published_at])).toEqual([
      ["future", "2026-10-13T10:00:00.000Z"],
      ["undated", null],
    ]);
  });
});

describe("downloadFeed", () => {
  it("sends a User-Agent and returns the text", async () => {
    const fetchImpl = vi.fn(async () => new Response(RSS, { headers: { "content-type": "application/rss+xml; charset=utf-8" } }));
    const res = await downloadFeed("https://example.org/feed.xml", { fetchImpl });
    expect(res).toMatchObject({ ok: true });
    const init = (fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1];
    expect((init.headers as Record<string, string>)["user-agent"]).toBe(FEED_USER_AGENT);
  });

  it("decodes the charset announced by the XML prolog", async () => {
    const latin1 = Uint8Array.from([...'<?xml version="1.0" encoding="ISO-8859-1"?><a>'].map((c) => c.charCodeAt(0)).concat([0xe9], [...'</a>'].map((c) => c.charCodeAt(0))));
    const res = await downloadFeed("https://example.org/f", { fetchImpl: async () => new Response(latin1) });
    expect(res.ok && res.text.includes("<a>é</a>")).toBe(true);
  });

  it("stops beyond the size limit", async () => {
    const res = await downloadFeed("https://example.org/big", { fetchImpl: async () => new Response("x".repeat(2000)), maxBytes: 1000 });
    expect(res).toEqual({ ok: false, error: "tooLarge" });
  });

  it("reports HTTP errors, timeouts and network failures", async () => {
    expect(await downloadFeed("https://example.org/404", { fetchImpl: async () => new Response("", { status: 404 }) })).toEqual({ ok: false, error: "http", status: 404 });
    const hang: typeof fetch = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    expect(await downloadFeed("https://example.org/slow", { fetchImpl: hang, timeoutMs: 20 })).toEqual({ ok: false, error: "timeout" });
    expect(await downloadFeed("https://example.org/down", { fetchImpl: async () => Promise.reject(new TypeError("fetch failed")) })).toEqual({ ok: false, error: "network" });
  });

  it("refuses non-http and private addresses without fetching", async () => {
    const fetchImpl = vi.fn();
    for (const url of ["file:///etc/passwd", "http://localhost:3000/x", "http://127.0.0.1/x", "http://192.168.1.2/x", "http://[::1]/x", "pas une url"]) {
      expect(await downloadFeed(url, { fetchImpl })).toEqual({ ok: false, error: "invalidUrl" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isPrivateHost("fdj.fr")).toBe(false);
  });
});
