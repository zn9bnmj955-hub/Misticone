/**
 * Can an open Stripe Checkout session be replaced by a new payment?
 * Only when Stripe confirms it is expired: a session already paid (or whose
 * payment is still being confirmed, e.g. bank debit) must never be replaced,
 * or the club could pay twice for the same tournament.
 */
export type SessionState = { status: string | null; payment_status?: string | null };

export interface SessionClient {
  retrieve(id: string): Promise<SessionState>;
  expire(id: string): Promise<SessionState>;
}

/** "replace": the session is expired on Stripe's side; "processing": it was (or may be) paid. */
export async function closeSessionForReplacement(client: SessionClient, sessionId: string): Promise<"replace" | "processing"> {
  const current = await client.retrieve(sessionId); // errors propagate: never guess.
  if (current.status === "expired") return "replace";
  if (current.status !== "open") return "processing";
  try {
    const expired = await client.expire(sessionId);
    if (expired.status === "expired") return "replace";
  } catch {
    // Paid between the two calls, or Stripe unavailable: check again below.
  }
  const after = await client.retrieve(sessionId);
  return after.status === "expired" ? "replace" : "processing";
}
