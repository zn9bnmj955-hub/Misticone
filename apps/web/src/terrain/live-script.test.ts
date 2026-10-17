import { runInNewContext } from "node:vm";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";
import { LIVE_SCRIPT } from "./live-script";
import { NOTIFY_SCRIPT } from "./notify-script";

/** Runs the page script against minimal browser stubs and a fake clock. */
function boot(version: number, random = 0.99) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const sockets: { sent: string[]; send?: (s: string) => void; onopen?: () => void; onclose?: () => void; onmessage?: (e: { data: string }) => void }[] = [];
  const requests: string[] = [];
  const listeners: Record<string, () => void> = {};
  const el = (attrs: Record<string, string>) => ({ getAttribute: (k: string) => attrs[k] ?? null, className: "" });
  const document = { body: el({ "data-code": "7KQ2", "data-ws": "ws://x" }), documentElement: el({}), hidden: false, addEventListener() {}, getElementById: () => null, createElement: () => ({}) };
  class FakeDate { valueOf() { return now; } }
  const ctx = {
    OS_V: version, document, Date: FakeDate, Math: Object.create(Math, { random: { value: () => random } }), JSON, parseInt,
    location: { pathname: "/c/7KQ2", search: "" },
    navigator: { onLine: true },
    window: { WebSocket: true, JSON, addEventListener: (k: string, fn: () => void) => { listeners[k] = fn; } },
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
  return { ws, requests, tick, push, listeners };
}

describe("live script", () => {
  it("is plain ES5 (old phones and old computers): acorn ecmaVersion 5 accepts it", () => {
    expect(() => parse(LIVE_SCRIPT.replace("OS_V", "0"), { ecmaVersion: 5 })).not.toThrow();
    expect(() => parse(NOTIFY_SCRIPT, { ecmaVersion: 5 })).not.toThrow();
    // and the parser really rejects ES2015 syntax
    expect(() => parse("var f=()=>1;", { ecmaVersion: 5 })).toThrow();
    expect(() => parse("let a=`x`;", { ecmaVersion: 5 })).toThrow();
  });

  it("when the network comes back, waits a random 0.5 to 6 s before reloading", () => {
    const late = boot(10, 0.99);
    late.listeners.online!();
    late.tick(5000);
    expect(late.requests).toHaveLength(0);
    late.tick(1000);
    expect(late.requests).toHaveLength(1);
  });

  it("falls back to polling every 25 to 35 s (random) when the live channel is closed", () => {
    const early = boot(10, 0);
    early.ws.onclose!();
    early.tick(24_999);
    expect(early.requests).toHaveLength(0);
    early.tick(1);
    expect(early.requests).toHaveLength(1);
    const late = boot(10, 0.99);
    late.ws.onclose!();
    late.tick(34_000);
    expect(late.requests).toHaveLength(0);
    late.tick(1000);
    expect(late.requests).toHaveLength(1);
  });

  it("spreads reloads after an update between 0.5 and 6 s", () => {
    const early = boot(10, 0);
    early.push(11);
    early.tick(499);
    expect(early.requests).toHaveLength(0);
    early.tick(1);
    expect(early.requests).toHaveLength(1);
    const late = boot(10, 0.99);
    late.push(11);
    late.tick(5000);
    expect(late.requests).toHaveLength(0);
    late.tick(1000);
    expect(late.requests).toHaveLength(1);
  });

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
    tick(6000); // random delay (0.5 to 6 s) so that every phone does not reload at the same second
    expect(requests).toHaveLength(1);
    for (let i = 0; i < 20; i++) { push(12); tick(400); } // 8 s of spam
    expect(requests).toHaveLength(1);
    tick(3000);
    expect(requests).toHaveLength(2);
  });
});
