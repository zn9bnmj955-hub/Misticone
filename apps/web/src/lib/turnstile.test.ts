import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileEnabled, verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("turnstile", () => {
  it("is a no-op when not configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileEnabled()).toBe(false);
    expect(await verifyTurnstile(null)).toBe(true);
  });

  it("refuses in production when the keys are missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("tok")).toBe(false);
  });

  it("fails closed once configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    expect(await verifyTurnstile(null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await verifyTurnstile("tok")).toBe(false);
  });

  it("accepts a token validated by Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    const body = fetchMock.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });
});
