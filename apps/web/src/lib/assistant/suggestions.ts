/**
 * The model ends its answer with <suggestions>["…","…"]</suggestions>.
 * While streaming, everything from "<suggestions>" on is held back so the
 * person never sees the raw tag; at the end the list is parsed.
 */
const OPEN = "<suggestions>";
const CLOSE = "</suggestions>";

export class SuggestionFilter {
  private buffer = "";
  private hidden = "";
  private inside = false;

  /** Returns the text that can be shown now. */
  push(delta: string): string {
    if (this.inside) {
      this.hidden += delta;
      return "";
    }
    this.buffer += delta;
    const at = this.buffer.indexOf(OPEN);
    if (at >= 0) {
      const visible = this.buffer.slice(0, at);
      this.hidden = this.buffer.slice(at);
      this.buffer = "";
      this.inside = true;
      return visible;
    }
    // Keep a tail that could be the start of the tag.
    let keep = 0;
    for (let k = Math.min(OPEN.length - 1, this.buffer.length); k > 0; k--) {
      if (OPEN.startsWith(this.buffer.slice(-k))) {
        keep = k;
        break;
      }
    }
    const out = this.buffer.slice(0, this.buffer.length - keep);
    this.buffer = this.buffer.slice(this.buffer.length - keep);
    return out;
  }

  /** End of the answer: remaining visible text and the parsed suggestions. */
  finish(): { text: string; suggestions: string[] } {
    const text = this.inside ? "" : this.buffer;
    this.buffer = "";
    if (!this.inside) return { text, suggestions: [] };
    const body = this.hidden.slice(OPEN.length).split(CLOSE)[0] ?? "";
    try {
      const list = JSON.parse(body.trim());
      if (Array.isArray(list)) {
        return {
          text,
          suggestions: list
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 3),
        };
      }
    } catch {
      // Malformed list: no suggestions, the answer itself is fine.
    }
    return { text, suggestions: [] };
  }
}
