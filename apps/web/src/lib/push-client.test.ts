import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disablePush,
  enablePush,
  followedTeams,
  isEnabledFor,
  isIos,
  parseFollowedTeams,
  PUSH_TEAMS_KEY,
  pushSupport,
  urlBase64ToUint8Array,
} from "./push-client";

const VAPID = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", platform: "Linux armv8l", maxTouchPoints: 5 };
const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };

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

/** A browser with service workers and push; `permission` is what the prompt answers. */
function browser(opts: { permission?: NotificationPermission; answer?: NotificationPermission; nav?: object; push?: boolean } = {}) {
  const sub = {
    endpoint: "https://push.example.org/send/abc",
    toJSON: () => ({ endpoint: "https://push.example.org/send/abc", keys: { p256dh: "p".repeat(40), auth: "a".repeat(12) } }),
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = { getSubscription: vi.fn(async () => null as typeof sub | null), subscribe: vi.fn(async () => sub) };
  const reg = { pushManager };
  const serviceWorker = { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) };
  const Notification = {
    permission: opts.permission ?? "default",
    requestPermission: vi.fn(async () => {
      Notification.permission = opts.answer ?? "granted";
      return Notification.permission;
    }),
  };
  const fetch = vi.fn(async () => ({ ok: true }) as Response);
  vi.stubGlobal("navigator", { ...(opts.nav ?? ANDROID), ...(opts.push === false ? {} : { serviceWorker }) });
  vi.stubGlobal("Notification", opts.push === false ? undefined : Notification);
  vi.stubGlobal("PushManager", opts.push === false ? undefined : function PushManager() {});
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("fetch", fetch);
  return { sub, pushManager, serviceWorker, Notification, fetch };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("push support", () => {
  it("detects iPhones and iPads (desktop-looking Safari with touch)", () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIos(ANDROID)).toBe(false);
  });

  it("reports supported, denied, unsupported and iOS-needs-install", () => {
    browser();
    expect(pushSupport()).toBe("supported");
    browser({ permission: "denied" });
    expect(pushSupport()).toBe("denied");
    browser({ push: false });
    expect(pushSupport()).toBe("unsupported");
    browser({ push: false, nav: IPHONE });
    expect(pushSupport()).toBe("ios_needs_install");
  });

  it("decodes the VAPID key", () => {
    const bytes = urlBase64ToUint8Array(VAPID);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe("enablePush", () => {
  it("asks permission, subscribes, posts the team and remembers it", async () => {
    const b = browser();
    expect(await enablePush({ code: "7kq2", team: 14 }, VAPID)).toEqual({ ok: true });
    expect(b.Notification.requestPermission).toHaveBeenCalledOnce();
    expect(b.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(b.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    const [url, init] = b.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/push/subscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ code: "7KQ2", team: 14, subscription: { endpoint: b.sub.endpoint } });
    expect(isEnabledFor("7KQ2", 14)).toBe(true);
    expect(isEnabledFor()).toBe(true);
    expect(localStorage.getItem(PUSH_TEAMS_KEY)).toBe('["7KQ2:14"]');
    // Following the same team twice keeps one entry.
    await enablePush({ code: "7KQ2", team: 14 }, VAPID);
    expect(followedTeams()).toEqual([{ code: "7KQ2", team: 14 }]);
    expect(b.pushManager.subscribe).toHaveBeenCalledTimes(2);
  });

  it("stops when the person refuses or dismisses, without subscribing", async () => {
    let b = browser({ answer: "denied" });
    expect(await enablePush({ code: "7KQ2", team: 3 }, VAPID)).toEqual({ ok: false, reason: "denied" });
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    b = browser({ answer: "default" });
    expect(await enablePush({}, VAPID)).toEqual({ ok: false, reason: "dismissed" });
    expect(b.fetch).not.toHaveBeenCalled();
    expect(isEnabledFor()).toBe(false);
  });

  it("never prompts when unsupported, on iOS outside the home screen, or without a key", async () => {
    browser({ push: false, nav: IPHONE });
    expect(await enablePush({}, VAPID)).toEqual({ ok: false, reason: "ios_needs_install" });
    const b = browser();
    expect(await enablePush({}, "")).toEqual({ ok: false, reason: "config" });
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("does not remember the team when the server refuses", async () => {
    const b = browser();
    b.fetch.mockResolvedValueOnce({ ok: false } as Response);
    expect(await enablePush({ code: "7KQ2", team: 14 }, VAPID)).toEqual({ ok: false, reason: "server" });
    expect(isEnabledFor("7KQ2", 14)).toBe(false);
  });
});

describe("disablePush", () => {
  it("stops one team, then the whole device", async () => {
    const b = browser();
    await enablePush({ code: "7KQ2", team: 14 }, VAPID);
    await enablePush({ code: "GP3M", team: 2 }, VAPID);
    b.pushManager.getSubscription.mockResolvedValue(b.sub);
    b.fetch.mockClear();

    expect(await disablePush({ code: "7KQ2", team: 14 })).toBe(true);
    expect(JSON.parse(String((b.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ endpoint: b.sub.endpoint, code: "7KQ2", team: 14 });
    expect(followedTeams()).toEqual([{ code: "GP3M", team: 2 }]);
    expect(b.sub.unsubscribe).not.toHaveBeenCalled();

    expect(await disablePush()).toBe(true);
    expect(JSON.parse(String((b.fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ endpoint: b.sub.endpoint });
    expect(b.sub.unsubscribe).toHaveBeenCalledOnce();
    expect(followedTeams()).toEqual([]);
    expect(isEnabledFor()).toBe(false);
  });

  it("ignores malformed local data", () => {
    expect(parseFollowedTeams('["7KQ2:14","bad",3,"0O1I:2"]')).toEqual([{ code: "7KQ2", team: 14 }]);
    expect(parseFollowedTeams("{")).toEqual([]);
  });
});
