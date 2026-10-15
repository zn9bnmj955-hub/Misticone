import { describe, expect, it, vi } from "vitest";
import { closeSessionForReplacement, type SessionState } from "./replace-session";

function client(states: SessionState[], expire: () => Promise<SessionState>) {
  const retrieve = vi.fn(async () => states.shift()!);
  return { retrieve, expire: vi.fn(expire) };
}

describe("closeSessionForReplacement", () => {
  it("replaces an open session once Stripe confirms the expiry", async () => {
    const c = client([{ status: "open" }], async () => ({ status: "expired" }));
    expect(await closeSessionForReplacement(c, "cs_1")).toBe("replace");
  });

  it("replaces a session already expired", async () => {
    const c = client([{ status: "expired" }], async () => ({ status: "expired" }));
    expect(await closeSessionForReplacement(c, "cs_1")).toBe("replace");
    expect(c.expire).not.toHaveBeenCalled();
  });

  it("refuses when the session is already paid (webhook late)", async () => {
    const c = client([{ status: "complete", payment_status: "paid" }], async () => ({ status: "expired" }));
    expect(await closeSessionForReplacement(c, "cs_1")).toBe("processing");
    expect(c.expire).not.toHaveBeenCalled();
  });

  it("refuses when the payment is still being confirmed (asynchronous method)", async () => {
    const c = client([{ status: "complete", payment_status: "unpaid" }], async () => ({ status: "expired" }));
    expect(await closeSessionForReplacement(c, "cs_1")).toBe("processing");
  });

  it("refuses when Stripe rejects the expiry because the session was just paid", async () => {
    const c = client([{ status: "open" }, { status: "complete", payment_status: "paid" }], async () => {
      throw new Error("Only Checkout Sessions with a status of `open` can be expired.");
    });
    expect(await closeSessionForReplacement(c, "cs_1")).toBe("processing");
  });

  it("does not guess when Stripe cannot be read", async () => {
    const c = { retrieve: vi.fn(async () => Promise.reject(new Error("down"))), expire: vi.fn() };
    await expect(closeSessionForReplacement(c, "cs_1")).rejects.toThrow("down");
  });
});
