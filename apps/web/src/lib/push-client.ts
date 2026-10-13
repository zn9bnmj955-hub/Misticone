/**
 * Browser side of the "À vous de jouer" notifications.
 *
 * Rules: the permission prompt is only ever shown from a click (callers run
 * `enablePush` inside their click handler, and `requestPermission` is its very
 * first call so Safari keeps the user gesture); nothing here throws, every
 * failure is a reason the UI can explain. The terrain pages use the same
 * protocol in ES5 (`src/terrain/notify-script.ts`): keep both in step.
 */

export type PushSupport = "supported" | "ios_needs_install" | "unsupported" | "denied";
export type EnableResult = { ok: true } | { ok: false; reason: "unsupported" | "ios_needs_install" | "denied" | "dismissed" | "config" | "server" };
export interface FollowedTeam {
  code: string;
  team: number;
}

/** Teams this device follows ("7KQ2:14" strings, shared with the terrain script). */
export const PUSH_TEAMS_KEY = "os_push_teams";
/** "1" once this device has a push subscription sent to the server. */
export const PUSH_DEVICE_KEY = "os_push_device";
/** Fired on `globalThis` whenever the local push state changes. */
export const PUSH_CHANGE_EVENT = "os-push-change";
const ENDPOINT = "/api/push/subscribe";

// Browser globals, read lazily (absent on the server and in some browsers).
type Globals = {
  navigator?: Navigator & { standalone?: boolean };
  Notification?: typeof Notification;
  PushManager?: unknown;
  localStorage?: Storage;
  matchMedia?: (q: string) => MediaQueryList;
  fetch?: typeof fetch;
  dispatchEvent?: (e: Event) => boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
};
const g = () => globalThis as unknown as Globals;

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
export function isIos(nav: { userAgent?: string; platform?: string; maxTouchPoints?: number } | undefined = g().navigator): boolean {
  if (!nav) return false;
  return /iP(hone|ad|od)/.test(nav.userAgent ?? "") || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
}

function isStandalone(): boolean {
  const { navigator: nav, matchMedia } = g();
  if (nav?.standalone === true) return true;
  try {
    return Boolean(matchMedia?.("(display-mode: standalone)").matches);
  } catch {
    return false;
  }
}

export function pushSupport(): PushSupport {
  const { navigator: nav, Notification: N, PushManager } = g();
  if (!nav || !("serviceWorker" in nav) || !PushManager || !N) return isIos() && !isStandalone() ? "ios_needs_install" : "unsupported";
  return N.permission === "denied" ? "denied" : "supported";
}

/** VAPID public key (base64url) → bytes for `pushManager.subscribe`. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Local memory of what this device follows
// ---------------------------------------------------------------------------

function read(key: string): string | null {
  try {
    return g().localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    const ls = g().localStorage;
    if (value === null) ls?.removeItem(key);
    else ls?.setItem(key, value);
  } catch {
    /* private mode: the server still knows the subscription */
  }
}

function changed() {
  try {
    g().dispatchEvent?.(new Event(PUSH_CHANGE_EVENT));
  } catch {
    /* no event target (tests, old browsers) */
  }
}

/** Raw value, stable between calls (handy as a `useSyncExternalStore` snapshot). */
export function followedTeamsRaw(): string {
  return read(PUSH_TEAMS_KEY) ?? "[]";
}

export function parseFollowedTeams(raw: string): FollowedTeam[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((x) => {
      const m = typeof x === "string" ? /^([2-9A-HJKMNP-Z]{4,6}):(\d{1,5})$/.exec(x) : null;
      return m ? [{ code: m[1]!, team: Number(m[2]) }] : [];
    });
  } catch {
    return [];
  }
}

export function followedTeams(): FollowedTeam[] {
  return parseFollowedTeams(followedTeamsRaw());
}

const key = (code: string, team: number) => `${code.toUpperCase()}:${team}`;

function saveTeams(list: FollowedTeam[]) {
  write(PUSH_TEAMS_KEY, list.length ? JSON.stringify(list.map((x) => key(x.code, x.team))) : null);
}

/** Notifications are on for this device (no argument) or for one team on it. */
export function isEnabledFor(code?: string, team?: number): boolean {
  if (g().Notification?.permission !== "granted") return false;
  if (code && team) return followedTeams().some((x) => key(x.code, x.team) === key(code, team));
  return read(PUSH_DEVICE_KEY) === "1";
}

/** Subscribe to local changes (this tab and others); returns the unsubscribe function. */
export function subscribePushChanges(cb: () => void): () => void {
  const target = g();
  target.addEventListener?.(PUSH_CHANGE_EVENT, cb);
  target.addEventListener?.("storage", cb);
  return () => {
    target.removeEventListener?.(PUSH_CHANGE_EVENT, cb);
    target.removeEventListener?.("storage", cb);
  };
}

// ---------------------------------------------------------------------------
// Enable / disable
// ---------------------------------------------------------------------------

async function registration(): Promise<ServiceWorkerRegistration> {
  const sw = g().navigator!.serviceWorker;
  await sw.register("/sw.js", { scope: "/" });
  return sw.ready;
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const nav = g().navigator;
  if (!nav || !("serviceWorker" in nav)) return null;
  try {
    const reg = await nav.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function send(method: "POST" | "DELETE", body: unknown): Promise<boolean> {
  try {
    const res = await g().fetch!(ENDPOINT, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Call from a click handler only. Asks permission, subscribes this device and
 * tells the server which team it follows (none: the signed-in account's teams).
 */
export async function enablePush(
  target: { code?: string; team?: number } = {},
  vapidKey: string = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
): Promise<EnableResult> {
  const support = pushSupport();
  if (support !== "supported") return { ok: false, reason: support };
  if (!vapidKey) return { ok: false, reason: "config" };
  let permission: NotificationPermission;
  try {
    permission = await g().Notification!.requestPermission();
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  changed();
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };
  let sub: PushSubscription;
  try {
    const reg = await registration();
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
  } catch {
    return { ok: false, reason: "server" };
  }
  const { code, team } = target;
  const ok = await send("POST", { subscription: sub.toJSON(), ...(code ? { code: code.toUpperCase() } : {}), ...(code && team ? { team } : {}) });
  if (!ok) return { ok: false, reason: "server" };
  write(PUSH_DEVICE_KEY, "1");
  if (code && team && !isEnabledFor(code, team)) saveTeams([...followedTeams(), { code, team }]);
  changed();
  return { ok: true };
}

/** Stops one team (code + team) or every notification on this device (no argument). */
export async function disablePush(target: { code?: string; team?: number } = {}): Promise<boolean> {
  const { code, team } = target;
  const sub = await existingSubscription();
  let ok = true;
  if (code && team) {
    if (sub) ok = await send("DELETE", { endpoint: sub.endpoint, code: code.toUpperCase(), team });
    saveTeams(followedTeams().filter((x) => key(x.code, x.team) !== key(code, team)));
  } else {
    if (sub) {
      ok = await send("DELETE", { endpoint: sub.endpoint });
      try {
        await sub.unsubscribe();
      } catch {
        /* already gone */
      }
    }
    write(PUSH_DEVICE_KEY, null);
    saveTeams([]);
  }
  changed();
  return ok;
}
