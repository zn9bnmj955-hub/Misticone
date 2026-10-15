import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { LIVE_SCRIPT } from "./live-script";

/** Runs the page script against minimal browser stubs and a fake clock. */
function boot(version: number) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const sockets: { sent: string[]; onopen?: () => void; onmessage?: (e: { data: string }) => void }[] = [];
  const requests: string[] = [];
  const el = (attrs: Record<string, string>) => ({ getAttribute: (k: string) => attrs[k] ?? null, className: "" });
  const document = { body: el({ "data-code": "7KQ2", "data-ws": "ws://x" }), documentElement: el({}), hidden: false, addEventListener() {}, getElementById: () => null, createElement: () => ({}) };
  class FakeDate { valueOf() { return now; } }
  const ctx = {
    OS_V: version, document, Date: FakeDate, Math, JSON, parseInt,
    location: { pathname: "/c/7KQ2", search: "" },
    navigator: { onLine: true },
    window: { WebSocket: true, JSON, addEventListener() {} },
    WebSocket: function (this: (typeof sockets)[number]) { this.sent = []; this.send = (s: string) => this.sent.push(s); sockets.push(this); } as unknown,
    XMLHttpRequest: function (this: Record<string, unknown>) { this.open = (_m: string, u: string) => requests.push(u); this.send = () => { this.readyState = 4; this.status = 204; (this.onreadystatechange as () => void)(); }; } as unknown,
    setTimeout: (fn: () => void, ms: number) => timers.push({ at: now + ms, fn }),
    clearTimeout() {}, setInterval() {}, clearInterval() {},
  };
  (ctx.WebSocket as { prototype: object }).prototype = {};
  runInNewContext(LIVE_SCRIPT, ctx);
  const ws = sockets[0]!;
  ws.onopen!();
  const tick = (ms: number) => {
    now += ms;
    for (const t of timers.splice(0).sort((a, b) => a.at - b.at)) if (t.at <= now) t.fn(); else timers.push(t);
  };
  const push = (v: number) => ws.onmessage!({ data: JSON.stringify({ event: "broadcast", payload: { payload: { version: v } } }) });
  return { ws, requests, tick, push };
}

describe("live script", () => {
  it("joins the tournament channel as a private channel", () => {
    const { ws } = boot(10);
    expect(JSON.parse(ws.sent[0]!).payload.config.private).toBe(true);
  });

  it("ignores absurd version jumps and refreshes at most once every 10 s", () => {
    const { requests, tick, push } = boot(10);
    push(999_999_999);
    tick(1000);
    expect(requests).toHaveLength(0);
    push(11);
    tick(1000);
    expect(requests).toHaveLength(1);
    for (let i = 0; i < 20; i++) { push(12); tick(400); } // 8 s of spam
    expect(requests).toHaveLength(1);
    tick(3000);
    expect(requests).toHaveLength(2);
  });
});
