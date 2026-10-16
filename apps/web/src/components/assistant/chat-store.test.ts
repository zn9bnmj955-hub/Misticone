import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A question sent before React first read the store (a click replayed by
 * React during hydration, on a slow phone or a busy dev server) must not be
 * lost: reading the saved conversation afterwards used to replace the
 * answer being written, leaving the question alone and the suggestions gone.
 */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const sseBody = [
  'data: {"type":"text","text":"Une partie se joue en 13 points."}\n\n',
  'data: {"type":"done","suggestions":["Comment s\'inscrire à un concours ?"]}\n\n',
].join("");

describe("chat store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sseBody, { status: 200, headers: { "content-type": "text/event-stream" } })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the answer of a question sent before the first read of the store", async () => {
    const { chatStore } = await import("./chat-store");
    const sending = chatStore.send("La règle du but à 13", "/assistant");
    // React reads the store for the first time while the answer is on its way.
    const during = chatStore.getSnapshot();
    expect(during.busy).toBe(true);
    expect(during.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

    await sending;
    const after = chatStore.getSnapshot();
    expect(after.busy).toBe(false);
    const answer = after.messages[after.messages.length - 1]!;
    expect(answer.role).toBe("assistant");
    expect(answer.content).toContain("13 points");
    expect(answer.suggestions).toEqual(["Comment s'inscrire à un concours ?"]);
  });

  it("still restores the conversation saved in the tab", async () => {
    const first = await import("./chat-store");
    first.chatStore.getSnapshot();
    await first.chatStore.send("La règle du but à 13");
    vi.resetModules();
    const { chatStore } = await import("./chat-store");
    const restored = chatStore.getSnapshot();
    expect(restored.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(restored.messages[1]!.content).toContain("13 points");
  });
});
