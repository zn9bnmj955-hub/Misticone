"use client";
import {
  MAX_CHARS,
  MAX_KEPT,
  applyEvent,
  clearConversation,
  loadConversation,
  saveConversation,
  streamAssistant,
  toApiTurns,
  type ChatMessage,
  type Quota,
} from "@/lib/assistant-client";

/**
 * One conversation per browser tab, shared by the /assistant page and the
 * bubble (read with useSyncExternalStore: the server and the first render
 * see an empty chat, the saved one appears right after hydration).
 */
export type ChatState = {
  messages: ChatMessage[];
  quota: Quota | null;
  busy: boolean;
  /** Tool being used right now (status line). */
  tool: string | null;
  /** Id of the answer just finished, announced to screen readers. */
  finished: string | null;
};

const EMPTY: ChatState = { messages: [], quota: null, busy: false, tool: null, finished: null };
let state: ChatState = EMPTY;
let loaded = false;
let controller: AbortController | null = null;
let seq = 0;
const listeners = new Set<() => void>();

const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Reads the conversation saved in the tab, once. Done before the first read
 * AND before the first change: a click replayed by React during hydration can
 * send a question before anything read the store, and loading afterwards
 * would replace the answer being written.
 */
function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  state = { ...EMPTY, ...loadConversation() };
}

function set(patch: Partial<ChatState>, persist = false) {
  ensureLoaded();
  state = { ...state, ...patch };
  if (persist) saveConversation({ messages: state.messages, quota: state.quota });
  for (const l of listeners) l();
}

/** Ends the current answer: an empty interrupted answer disappears. */
function settle(): ChatMessage[] {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "assistant" || last.done !== false) return state.messages;
  if (!last.content.trim()) return state.messages.slice(0, -1);
  return [...state.messages.slice(0, -1), { ...last, done: true }];
}

export const chatStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ChatState {
    ensureLoaded();
    return state;
  },
  getServerSnapshot(): ChatState {
    return EMPTY;
  },

  async send(question: string, page?: string) {
    ensureLoaded();
    const q = question.trim().slice(0, MAX_CHARS);
    if (!q || state.busy) return;
    const user: ChatMessage = { id: newId(), role: "user", content: q };
    const answer: ChatMessage = { id: newId(), role: "assistant", content: "", done: false };
    const turns = toApiTurns([...state.messages, user]);
    const mine = new AbortController();
    controller = mine;
    set({ messages: [...state.messages, user, answer].slice(-MAX_KEPT), busy: true, tool: null, finished: null }, true);

    await streamAssistant({ turns, page, signal: mine.signal }, (e) => {
      if (controller !== mine) return; // stopped or replaced meanwhile
      if (e.type === "tool") set({ tool: e.name });
      else if (e.type === "quota") set({ quota: { used: e.used, limit: e.limit } });
      else set({ messages: applyEvent(state.messages, e), tool: null });
    });

    if (controller !== mine) return;
    controller = null;
    const messages = settle();
    const last = messages[messages.length - 1];
    set({ messages, busy: false, tool: null, finished: last?.role === "assistant" ? last.id : null }, true);
  },

  /** Stops the answer being written (closing the bubble, « Arrêter »). */
  stop() {
    if (!controller) return;
    controller.abort();
    controller = null;
    set({ messages: settle(), busy: false, tool: null }, true);
  },

  /** Asks the last question again after a failure. */
  retry(page?: string) {
    ensureLoaded();
    if (state.busy) return;
    const i = state.messages.findLastIndex((m) => m.role === "user");
    if (i === -1) return;
    const question = state.messages[i]!.content;
    set({ messages: state.messages.slice(0, i) });
    void chatStore.send(question, page);
  },

  reset() {
    controller?.abort();
    controller = null;
    clearConversation();
    set({ ...EMPTY });
  },
};
