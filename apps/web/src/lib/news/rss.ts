import { XMLParser } from "fast-xml-parser";

/**
 * RSS 2.0 / RSS 1.0 (RDF) / Atom parsing for the news of the home feed.
 * Only the title, the link and the date are kept: the feed shows « titre,
 * source, lien » and never copies the articles themselves.
 */

export type FeedEntry = { title: string; url: string; publishedAt: string | null };

export const MAX_TITLE_LENGTH = 300;
export const MAX_ENTRIES = 50;
const MAX_URL_LENGTH = 2000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true, // <atom:link>, <dc:date>, <rdf:RDF> → link, date, RDF
  processEntities: true,
  htmlEntities: true,
  parseTagValue: false, // a title "2024" stays a string
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  Eacute: "É",
  Egrave: "È",
  Agrave: "À",
  Ccedil: "Ç",
  oelig: "œ",
};

/** Second decoding pass: many feeds escape their titles twice (« &amp;eacute; »). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[code] ?? m;
  });
}

/** Plain text of a title: entities decoded, tags removed, spaces collapsed, at most 300 characters. */
export function cleanTitle(raw: string): string {
  const text = decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;
}

/** An absolute http(s) URL, or null (javascript:, data:, mailto:… are refused). */
export function safeHttpUrl(raw: string, base?: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const out = url.toString();
    return out.length <= MAX_URL_LENGTH ? out : null;
  } catch {
    return null;
  }
}

/** ISO date, or null when the feed's date is missing or unreadable. */
export function toIsoDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

type Node = Record<string, unknown>;

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.length > 0 ? text(node[0]) : "";
  if (node && typeof node === "object") return text((node as Node)["#text"]);
  return "";
}

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** RSS <link>text</link>, or Atom <link rel="alternate" href="…"/> (the article, not the feed itself). */
function linkOf(item: Node, base: string | undefined): string | null {
  const links = asArray(item.link);
  const candidates: string[] = [];
  for (const l of links) {
    if (typeof l === "string") candidates.push(l);
    else if (l && typeof l === "object") {
      const o = l as Node;
      const href = typeof o["@_href"] === "string" ? (o["@_href"] as string) : text(o);
      const rel = typeof o["@_rel"] === "string" ? (o["@_rel"] as string) : "alternate";
      if (rel === "alternate") candidates.unshift(href);
      else if (rel !== "self" && rel !== "enclosure" && rel !== "replies") candidates.push(href);
    }
  }
  // RSS fallback: a permalink guid.
  const guid = item.guid;
  if (guid != null) {
    const permalink = typeof guid === "object" ? (guid as Node)["@_isPermaLink"] !== "false" : true;
    if (permalink) candidates.push(text(guid));
  }
  for (const c of candidates) {
    const url = safeHttpUrl(c, base);
    if (url) return url;
  }
  return null;
}

/** Removes the DOCTYPE (and its internal entities): no entity expansion from untrusted feeds. */
function stripDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, "");
}

/**
 * Entries of an RSS or Atom document, newest first as published, without
 * duplicates. Items without a usable http(s) link or title are skipped.
 * Throws when the document is not a feed at all.
 */
export function parseFeed(xml: string, baseUrl?: string): FeedEntry[] {
  const doc = parser.parse(stripDoctype(xml)) as Node;
  let items: unknown[];
  let isAtom = false;
  if (doc.rss && typeof doc.rss === "object") {
    const channel = (doc.rss as Node).channel;
    items = asArray(channel && typeof channel === "object" ? (asArray(channel)[0] as Node).item : undefined);
  } else if (doc.feed && typeof doc.feed === "object") {
    items = asArray((doc.feed as Node).entry);
    isAtom = true;
  } else if (doc.RDF && typeof doc.RDF === "object") {
    items = asArray((doc.RDF as Node).item);
  } else {
    throw new Error("NOT_A_FEED");
  }

  const seen = new Set<string>();
  const out: FeedEntry[] = [];
  for (const raw of items) {
    if (out.length >= MAX_ENTRIES) break;
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Node;
    const title = cleanTitle(text(item.title));
    const url = linkOf(item, baseUrl);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const date = isAtom ? text(item.published) || text(item.updated) : text(item.pubDate) || text(item.date) || text(item.published);
    out.push({ title, url, publishedAt: toIsoDate(date) });
  }
  return out;
}
