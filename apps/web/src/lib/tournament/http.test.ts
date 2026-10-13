import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./staff", () => ({ getStaffActor: async () => null }));

const { clientIp } = await import("./http");
const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe("client IP for rate limits", () => {
  it("prefers the hosting platform's header", () => {
    expect(clientIp(req({ "x-nf-client-connection-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" }))).toBe("198.51.100.7");
  });
  it("ignores the spoofable left-most forwarded value", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.77, 198.51.100.9" }))).toBe("198.51.100.9");
  });
  it("falls back to a fixed key locally", () => {
    expect(clientIp(req({}))).toBe("local");
  });
});
