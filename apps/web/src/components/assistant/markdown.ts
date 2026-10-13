/**
 * A tiny, safe subset of Markdown for the assistant's answers: paragraphs,
 * line breaks, **bold**, bullet / numbered lists and links. The result is a
 * tree rendered with React elements (text is always escaped): model output
 * never reaches the page as HTML.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "link"; href: string; external: boolean; children: Inline[] };
export type Line = Inline[];
export type Block = { kind: "p"; lines: Line[] } | { kind: "ul" | "ol"; items: Line[] };

const BULLET = /^\s*[-*•]\s+(.+)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.+)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*$/;
/** **bold** | [label](url) | bare http(s) URL (trailing punctuation left out). */
const TOKEN = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^()\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"»])/g;

/**
 * Only http(s) URLs and same-site paths become links. An absolute URL of
 * this site is turned back into a path (opened in place, not in a new tab).
 */
export function safeHref(raw: string, origin?: string): { href: string; external: boolean } | null {
  const s = raw.trim();
  if (!s || /[\s\\\u0000-\u001f]/.test(s)) return null;
  if (s.startsWith("/")) return s.startsWith("//") ? null : { href: s, external: false };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (origin && url.origin === origin) return { href: `${url.pathname}${url.search}${url.hash}`, external: false };
  return { href: url.href, external: true };
}

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const prev = out[out.length - 1];
  if (prev?.kind === "text") prev.text += text;
  else out.push({ kind: "text", text });
}

export function parseInline(text: string, origin?: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    pushText(out, text.slice(last, at));
    if (m[1] !== undefined) {
      out.push({ kind: "strong", children: parseInline(m[1], origin) });
    } else if (m[2] !== undefined) {
      const link = safeHref(m[3]!, origin);
      if (link) out.push({ kind: "link", ...link, children: [{ kind: "text", text: m[2] }] });
      else pushText(out, m[2]);
    } else {
      const link = safeHref(m[4]!, origin);
      if (link) out.push({ kind: "link", ...link, children: [{ kind: "text", text: m[4]! }] });
      else pushText(out, m[4]!);
    }
    last = at + m[0].length;
  }
  pushText(out, text.slice(last));
  return out;
}

export function parseMarkdown(src: string, origin?: string): Block[] {
  const blocks: Block[] = [];
  // Whether the last block may still grow (no blank line since).
  let open = false;
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      open = false;
      continue;
    }
    const last = open ? blocks[blocks.length - 1] : undefined;
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const kind = bullet ? "ul" : "ol";
      const item = parseInline((bullet ?? ordered)![1]!.trim(), origin);
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      open = true;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      // Headings are shown as a bold line: answers are short, no big titles.
      blocks.push({ kind: "p", lines: [[{ kind: "strong", children: parseInline(heading[1]!, origin) }]] });
      open = false;
      continue;
    }
    const inline = parseInline(line.trim(), origin);
    if (last && last.kind === "p") last.lines.push(inline);
    else blocks.push({ kind: "p", lines: [inline] });
    open = true;
  }
  return blocks;
}
