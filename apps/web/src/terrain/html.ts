/**
 * Tiny HTML templating for the "terrain" pages: plain strings, escaped by
 * default, no framework runtime sent to the browser.
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

type Part = SafeHtml | string | number | null | undefined | false | Part[];

function render(part: Part): string {
  if (part === null || part === undefined || part === false) return "";
  if (part instanceof SafeHtml) return part.value;
  if (Array.isArray(part)) return part.map(render).join("");
  return escapeHtml(part);
}

/** html`<p>${userText}</p>` — interpolations are escaped unless wrapped in raw(). */
export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1]!;
  });
  return new SafeHtml(out);
}

export const raw = (s: string) => new SafeHtml(s);

/** Safe value for an inline <script> (JSON that cannot close the tag). */
export function jsonForScript(value: unknown): SafeHtml {
  return raw(JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"));
}
