import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => null }));

const { checkInvitation, hashInvitationToken, isInvitationToken, newInvitationToken } = await import("./clubs");

describe("invitation tokens", () => {
  it("creates 32-byte base64url tokens and stores only their sha256", () => {
    const { token, hash } = newInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInvitationToken().token));
    expect(tokens.size).toBe(200);
  });

  it("hashes deterministically", () => {
    expect(hashInvitationToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("recognises the token shape only", () => {
    expect(isInvitationToken(newInvitationToken().token)).toBe(true);
    expect(isInvitationToken("short")).toBe(false);
    expect(isInvitationToken(`${"a".repeat(42)}/`)).toBe(false);
  });

  it("rejects malformed tokens without touching the database", async () => {
    await expect(checkInvitation("../../etc", "x@y.fr", new Date())).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});
