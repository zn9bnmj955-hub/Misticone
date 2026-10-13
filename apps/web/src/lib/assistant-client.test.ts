import { describe, expect, it, vi } from "vitest";
import {
  MAX_SENT_TURNS,
  STORAGE_KEY,
  applyEvent,
  createSseParser,
  loadConversation,
  saveConversation,
  streamAssistant,
  toApiTurns,
  type ChatMessage,
  type StreamEvent,
} from "./assistant-client";

const enc = new TextEncoder();
const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

/** A fetch answering with the given byte chunks as an SSE body. */
function fakeFetch(chunks: (string | Uint8Array)[], init: ResponseInit = { status: 200 }) {
  return vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(typeof ch === "string" ? enc.encode(ch) : ch);
        c.close();
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" }, ...init });
  }) as unknown as typeof fetch;
}

async function collect(fetchImpl: typeof fetch, signal?: AbortSignal) {
  const events: StreamEvent[] = [];
  await streamAssistant({ turns: [{ role: "user", content: "Bonjour" }], page: "/accueil", fetchImpl, signal }, (e) => events.push(e));
  return events;
}

describe("SSE parser", () => {
  it("keeps incomplete events buffered across chunks", () => {
    const p = createSseParser();
    const raw = sse({ type: "text", text: "Bon" }, { type: "text", text: "jour" });
    expect(p.push(raw.slice(0, 10))).toEqual([]);
    const cut = raw.indexOf("\n\n") + 5; // the first event plus the start of the second
    expect(p.push(raw.slice(10, cut))).toEqual([{ type: "text", text: "Bon" }]);
    expect(p.push(raw.slice(cut))).toEqual([{ type: "text", text: "jour" }]);
  });

  it("reads several events in one chunk, CRLF and comments, and drops malformed data", () => {
    const p = createSseParser();
    const raw = `: ping\r\n\r\ndata: {"type":"tool","name":"my_next_match"}\r\n\r\ndata: {oops}\n\ndata: {"type":"nope"}\n\n${sse({ type: "quota", used: 2, limit: 5 })}`;
    expect(p.push(raw)).toEqual([
      { type: "tool", name: "my_next_match" },
      { type: "quota", used: 2, limit: 5 },
    ]);
  });

  it("flushes a last event without its blank line and sanitizes done / error", () => {
    const p = createSseParser();
    expect(p.push('data: {"type":"done","suggestions":["A",3,"","B"]}')).toEqual([]);
    expect(p.flush()).toEqual([{ type: "done", suggestions: ["A", "B"] }]);
    expect(createSseParser().push(sse({ type: "error", code: "weird" }))).toEqual([{ type: "error", code: "unavailable" }]);
  });
});

describe("streamAssistant", () => {
  it("streams events split anywhere, including inside a multi-byte character", async () => {
    const bytes = enc.encode(sse({ type: "text", text: "Prochain match à 15 h" }, { type: "done", suggestions: ["Et après ?"] }));
    const at = bytes.indexOf(0xc3) + 1; // in the middle of « à »
    const fetchImpl = fakeFetch([bytes.slice(0, at), bytes.slice(at, at + 7), bytes.slice(at + 7)]);
    expect(await collect(fetchImpl)).toEqual([
      { type: "text", text: "Prochain match à 15 h" },
      { type: "done", suggestions: ["Et après ?"] },
    ]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/assistant");
    expect(JSON.parse(init.body)).toEqual({ turns: [{ role: "user", content: "Bonjour" }], page: "/accueil" });
  });

  it("turns HTTP failures into error codes", async () => {
    const limited = vi.fn(async () => Response.json({ error: { code: "limited", message: "…" } }, { status: 429 })) as unknown as typeof fetch;
    expect(await collect(limited)).toEqual([{ type: "error", code: "limited" }]);
    const html = vi.fn(async () => new Response("<h1>502</h1>", { status: 502 })) as unknown as typeof fetch;
    expect(await collect(html)).toEqual([{ type: "error", code: "unavailable" }]);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await collect(offline)).toEqual([{ type: "error", code: "offline" }]);
  });

  it("reports a stream cut before the end, ignores what follows done, and stays silent when aborted", async () => {
    expect(await collect(fakeFetch([sse({ type: "text", text: "Le but" })]))).toEqual([
      { type: "text", text: "Le but" },
      { type: "error", code: "unavailable" },
    ]);
    expect(await collect(fakeFetch([sse({ type: "done", suggestions: [] }, { type: "text", text: "trop tard" })]))).toEqual([
      { type: "done", suggestions: [] },
    ]);
    const ctrl = new AbortController();
    ctrl.abort();
    const aborted = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    expect(await collect(aborted, ctrl.signal)).toEqual([]);
  });
});

describe("conversation", () => {
  const msg = (role: ChatMessage["role"], content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: Math.random().toString(36),
    role,
    content,
    done: true,
    ...extra,
  });

  it("sends at most 12 turns, starting with the person, merging repeated speakers", () => {
    const many = Array.from({ length: 20 }, (_, i) => msg(i % 2 ? "assistant" : "user", `t${i}`));
    const turns = toApiTurns([...many, msg("user", "dernière")]);
    expect(turns.length).toBeLessThanOrEqual(MAX_SENT_TURNS);
    expect(turns[0]!.role).toBe("user");
    expect(turns.at(-1)).toEqual({ role: "user", content: "dernière" });
    expect(toApiTurns([msg("user", "A"), msg("assistant", "", { error: "busy" }), msg("user", "B")])).toEqual([{ role: "user", content: "A\n\nB" }]);
    expect(toApiTurns([msg("assistant", "x".repeat(3000)), msg("user", "q")])).toEqual([{ role: "user", content: "q" }]);
    expect(toApiTurns([msg("user", "q"), msg("assistant", "y".repeat(2500)), msg("user", "r")])[1]!.content).toHaveLength(2000);
  });

  it("applies streamed events to the answer being written only", () => {
    let list: ChatMessage[] = [msg("user", "Q"), msg("assistant", "", { done: false })];
    list = applyEvent(list, { type: "text", text: "Ré" });
    list = applyEvent(list, { type: "text", text: "ponse" });
    list = applyEvent(list, { type: "done", suggestions: ["Suite ?"] });
    expect(list[1]).toMatchObject({ content: "Réponse", done: true, suggestions: ["Suite ?"] });
    expect(applyEvent(list, { type: "text", text: "!" })).toBe(list);
  });

  it("saves and restores from storage, survives broken or unavailable storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as Storage;
    saveConversation(
      { messages: [msg("user", "Q"), msg("assistant", "R", { suggestions: ["S"] }), msg("assistant", "", { done: false })], quota: { used: 1, limit: 5 } },
      storage,
    );
    const back = loadConversation(storage);
    expect(back.quota).toEqual({ used: 1, limit: 5 });
    expect(back.messages.map((m) => m.content)).toEqual(["Q", "R"]);
    expect(back.messages.every((m) => m.done)).toBe(true);
    data.set(STORAGE_KEY, "{not json");
    expect(loadConversation(storage)).toEqual({ messages: [], quota: null });
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(loadConversation(throwing)).toEqual({ messages: [], quota: null });
    expect(() => saveConversation({ messages: [], quota: null }, throwing)).not.toThrow();
    expect(loadConversation(null)).toEqual({ messages: [], quota: null });
  });
});
