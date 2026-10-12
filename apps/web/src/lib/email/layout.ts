import { escapeHtml } from "@/terrain/html";
import { TERRAIN_CSS } from "@/terrain/styles.generated";

/**
 * Branded transactional email: one HTML version (inline styles, tables,
 * no external image or font, readable in every mail client) and the same
 * content as plain text. Colors are the light-mode design tokens, read from
 * the generated token stylesheet so packages/ui/src/tokens.css stays the
 * only place where a color is written.
 */
export type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "links"; items: { label: string; url: string }[] }
  | { kind: "facts"; items: { label: string; value: string }[] }
  /** Codes to copy (PINs): big, spaced, monospace. */
  | { kind: "codes"; items: { label: string; value: string }[] }
  | { kind: "note"; text: string };

export type EmailContent = {
  brand: string;
  title: string;
  /** Preview line shown by mail clients next to the subject. */
  preheader?: string;
  blocks: EmailBlock[];
  footer: string[];
};

type Palette = Record<"bg" | "surface" | "surface2" | "ink" | "inkSoft" | "line" | "accent" | "accentInk" | "onAccent", string>;

/** Light-mode token values (the first :root block of the token stylesheet). */
export function lightPalette(css: string = TERRAIN_CSS): Palette {
  const block = /:root\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const tokens = new Map<string, string>();
  for (const decl of block.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0 && decl.startsWith("--os-")) tokens.set(decl.slice(5, i).trim(), decl.slice(i + 1).trim());
  }
  // A missing token falls back to the client's default color ("inherit").
  const t = (name: string) => tokens.get(name) ?? "inherit";
  return {
    bg: t("bg"),
    surface: t("surface"),
    surface2: t("surface-2"),
    ink: t("ink"),
    inkSoft: t("ink-soft"),
    line: t("line"),
    accent: t("accent"),
    accentInk: t("accent-ink"),
    onAccent: t("on-accent"),
  };
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const e = escapeHtml;
const safeUrl = (url: string) => (/^https?:\/\//.test(url) ? url : "#");

function blockHtml(b: EmailBlock, c: Palette): string {
  switch (b.kind) {
    case "paragraph":
      return `<p style="margin:0 0 14px;">${e(b.text)}</p>`;
    case "heading":
      return `<h2 style="margin:26px 0 10px;font:800 19px/1.25 ${FONT};color:${c.ink};">${e(b.text)}</h2>`;
    case "button":
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>` +
        `<td style="background:${c.accent};border-radius:10px;">` +
        `<a href="${e(safeUrl(b.url))}" style="display:inline-block;padding:14px 22px;font:700 16px/1.2 ${FONT};color:${c.onAccent};text-decoration:none;">${e(b.label)}</a>` +
        `</td></tr></table>`
      );
    case "links":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">` +
        b.items
          .map(
            (l) =>
              `<tr><td style="padding:0 0 10px;"><span style="font-size:14px;color:${c.inkSoft};">${e(l.label)}</span><br>` +
              `<a href="${e(safeUrl(l.url))}" style="font-weight:700;color:${c.accentInk};word-break:break-all;">${e(l.url)}</a></td></tr>`,
          )
          .join("") +
        `</table>`
      );
    case "facts":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border-top:1px solid ${c.line};">` +
        b.items
          .map(
            (f) =>
              `<tr><td width="45%" style="padding:8px 12px 8px 0;border-bottom:1px solid ${c.line};font-size:14px;color:${c.inkSoft};vertical-align:top;">${e(f.label)}</td>` +
              `<td style="padding:8px 0;border-bottom:1px solid ${c.line};font-weight:700;text-align:right;vertical-align:top;">${e(f.value)}</td></tr>`,
          )
          .join("") +
        `</table>`
      );
    case "codes":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">` +
        b.items
          .map(
            (code) =>
              `<tr><td style="padding:0 0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.surface2};border-radius:10px;"><tr>` +
              `<td style="padding:12px 14px;font-weight:700;">${e(code.label)}</td>` +
              `<td style="padding:12px 14px;text-align:right;font:800 24px/1 ${MONO};letter-spacing:0.18em;color:${c.ink};">${e(code.value)}</td>` +
              `</tr></table></td></tr>`,
          )
          .join("") +
        `</table>`
      );
    case "note":
      return `<p style="margin:0 0 14px;padding:12px 14px;background:${c.surface2};border-radius:10px;font-size:14px;color:${c.inkSoft};">${e(b.text)}</p>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.kind) {
    case "paragraph":
    case "note":
      return b.text;
    case "heading":
      return `${b.text.toUpperCase()}\n${"-".repeat(Math.min(60, b.text.length))}`;
    case "button":
      return `${b.label} : ${b.url}`;
    case "links":
      return b.items.map((l) => `- ${l.label} : ${l.url}`).join("\n");
    case "facts":
      return b.items.map((f) => `${f.label} : ${f.value}`).join("\n");
    case "codes":
      return b.items.map((code) => `  ${code.label} : ${code.value}`).join("\n");
  }
}

export function renderEmail(content: EmailContent, palette: Palette = lightPalette()): { html: string; text: string } {
  const c = palette;
  const html =
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${e(content.title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${c.bg};">` +
    (content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(content.preheader)}</div>` : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">` +
    `<tr><td style="padding:0 4px 12px;font:900 22px/1.2 ${FONT};color:${c.ink};letter-spacing:-0.01em;">${e(content.brand)}</td></tr>` +
    `<tr><td style="background:${c.surface};border:1px solid ${c.line};border-radius:16px;padding:28px 24px;font:16px/1.5 ${FONT};color:${c.ink};">` +
    `<h1 style="margin:0 0 16px;font:900 28px/1.15 ${FONT};color:${c.ink};">${e(content.title)}</h1>` +
    content.blocks.map((b) => blockHtml(b, c)).join("") +
    `</td></tr>` +
    `<tr><td style="padding:16px 4px;font:13px/1.5 ${FONT};color:${c.inkSoft};">${content.footer.map(e).join("<br>")}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = [content.title, "=".repeat(Math.min(60, content.title.length)), "", content.blocks.map(blockText).join("\n\n"), "", "--", ...content.footer].join("\n");
  return { html, text };
}
