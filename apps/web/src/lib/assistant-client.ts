/**
 * Browser side of the assistant: posts the conversation to /api/assistant
 * and reads the Server-Sent Events stream with fetch (EventSource cannot
 * POST). Pure helpers (stream parser, turn selection, event reducer,
 * storage) are exported for the tests and the chat store.
 */

export const MAX_CHARS = 2000;
/** Turns sent to the server (the API refuses more). */
export const MAX_SENT_TURNS = 12;
/** Messages kept on screen / in sessionStorage. */
export const MAX_KEPT = 30;
export const STORAGE_KEY = "os_assistant_chat";
export const OPEN_EVENT = "os:assistant";

export type ErrorCode = "busy" | "unavailable" | "refused" | "too_long" | "limited" | "invalid" | "offline";
const ERROR_CODES = new Set<ErrorCode>(["busy", "unavailable", "refused", "too_long", "limited", "invalid", "offline"]);

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; suggestions: string[] }
  | { type: "error"; code: ErrorCode }
  | { type: "quota"; used: number; limit: number };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** false while the answer is being written. */
  done?: boolean;
  suggestions?: string[];
  error?: ErrorCode;
};
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Quota = { used: number; limit: number };
export type Conversation = { messages: ChatMessage[]; quota: Quota | null };

/** Only well-formed events get through: the stream is data, not trusted code. */
function toEvent(raw: unknown): StreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "text":
      return typeof e.text === "string" ? { type: "text", text: e.text } : null;
    case "tool":
      return typeof e.name === "string" ? { type: "tool", name: e.name } : null;
    case "done":
      return {
        type: "done",
        suggestions: Array.isArray(e.suggestions) ? e.suggestions.filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, 4) : [],
      };
    case "error":
      return { type: "error", code: ERROR_CODES.has(e.code as ErrorCode) ? (e.code as ErrorCode) : "unavailable" };
    case "quota":
      return typeof e.used === "number" && typeof e.limit === "number" ? { type: "quota", used: e.used, limit: e.limit } : null;
    default:
      return null;
  }
}

/**
 * Incremental SSE parser: events are separated by a blank line and may be
 * split anywhere across network chunks, so incomplete text stays buffered.
 */
export function createSseParser() {
  let buffer = "";
  const parseBlock = (block: string): StreamEvent | null => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(l.startsWith("data: ") ? 6 : 5))
      .join("\n");
    if (!data) return null;
    try {
      return toEvent(JSON.parse(data));
    } catch {
      return null;
    }
  };
  const drain = (final: boolean): StreamEvent[] => {
    const events: StreamEvent[] = [];
    let at: number;
    while ((at = buffer.indexOf("\n\n")) !== -1) {
      const e = parseBlock(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
      if (e) events.push(e);
    }
    if (final && buffer.trim()) {
      const e = parseBlock(buffer);
      if (e) events.push(e);
      buffer = "";
    }
    return events;
  };
  return {
    push(chunk: string): StreamEvent[] {
      buffer += chunk.replace(/\r\n?/g, "\n");
      return drain(false);
    },
    flush(): StreamEvent[] {
      return drain(true);
    },
  };
}

const isAbort = (e: unknown, signal?: AbortSignal) => Boolean(signal?.aborted) || (e instanceof Error && e.name === "AbortError");

/**
 * Sends the conversation and calls `onEvent` for every streamed event. Never
 * throws: failures become an `error` event, and an abort ends silently.
 */
export async function streamAssistant(
  opts: { turns: ChatTurn[]; page?: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turns: opts.turns, page: opts.page?.slice(0, 120) }),
      signal: opts.signal,
    });
  } catch (e) {
    if (!isAbort(e, opts.signal)) onEvent({ type: "error", code: "offline" });
    return;
  }
  if (!res.ok || !res.body) {
    let code: ErrorCode = res.status === 429 ? "limited" : "unavailable";
    try {
      const j = (await res.json()) as { error?: { code?: string } };
      if (ERROR_CODES.has(j?.error?.code as ErrorCode)) code = j.error!.code as ErrorCode;
    } catch {
      // Not JSON: keep the status-based code.
    }
    onEvent({ type: "error", code });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let finished = false;
  const forward = (events: StreamEvent[]) => {
    for (const e of events) {
      if (finished) return;
      if (e.type === "done" || e.type === "error") finished = true;
      onEvent(e);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      forward(parser.push(decoder.decode(value, { stream: true })));
    }
    forward(parser.push(decoder.decode()));
    forward(parser.flush());
  } catch (e) {
    if (isAbort(e, opts.signal)) return;
    if (!finished) onEvent({ type: "error", code: "unavailable" });
    return;
  }
  // The connection closed before the end of the answer.
  if (!finished && !opts.signal?.aborted) onEvent({ type: "error", code: "unavailable" });
}

/**
 * What the server receives: the last 12 non-empty turns, starting with the
 * person, consecutive turns of the same speaker merged (a failed answer
 * leaves two questions in a row), each within the 2000-character limit.
 */
export function toApiTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${content}`;
    else turns.push({ role: m.role, content });
  }
  let out = turns.slice(-MAX_SENT_TURNS);
  while (out.length > 0 && out[0]!.role !== "user") out = out.slice(1);
  return out.map((t) => ({
    role: t.role,
    // Keep the start of an answer, but the end (latest words) of a question.
    content: t.role === "assistant" ? t.content.slice(0, MAX_CHARS).trim() : t.content.slice(-MAX_CHARS).trim(),
  }));
}

/** Applies a streamed event to the answer being written (the last message). */
export function applyEvent(messages: ChatMessage[], e: StreamEvent): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || last.done !== false) return messages;
  let next: ChatMessage;
  if (e.type === "text") next = { ...last, content: last.content + e.text };
  else if (e.type === "done") next = { ...last, done: true, suggestions: e.suggestions };
  else if (e.type === "error") next = { ...last, done: true, error: e.code };
  else return messages;
  return [...messages.slice(0, -1), next];
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Reads the saved conversation; anything malformed is dropped. */
export function loadConversation(storage: Storage | null = defaultStorage()): Conversation {
  const empty: Conversation = { messages: [], quota: null };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as { messages?: unknown; quota?: unknown };
    const messages = (Array.isArray(data.messages) ? data.messages : [])
      .filter(
        (m): m is ChatMessage =>
          Boolean(m) && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content.slice(0, MAX_CHARS * 4),
        done: true,
        suggestions: Array.isArray(m.suggestions) ? m.suggestions.filter((s) => typeof s === "string").slice(0, 4) : undefined,
        error: m.error && ERROR_CODES.has(m.error) ? m.error : undefined,
      }))
      // An answer cut by a reload with nothing written is just noise.
      .filter((m) => m.role === "user" || m.content.trim() !== "" || m.error)
      .slice(-MAX_KEPT);
    const q = data.quota as Quota | null | undefined;
    const quota = q && typeof q.used === "number" && typeof q.limit === "number" ? { used: q.used, limit: q.limit } : null;
    return { messages, quota };
  } catch {
    return empty;
  }
}

export function saveConversation(c: Conversation, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ messages: c.messages.slice(-MAX_KEPT), quota: c.quota }));
  } catch {
    // Private mode or full storage: the conversation just won't survive a reload.
  }
}

export function clearConversation(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}

/** Opens the assistant bubble with a question ready to send (e.g. from the tournament form). */
export function openAssistant(question: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question: question.slice(0, MAX_CHARS) } }));
}
