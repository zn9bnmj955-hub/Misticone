import "server-only";

/**
 * Transactional emails. OWNED BY THE PAYMENTS SLICE.
 *
 * Contract: sendEmail() never throws for delivery problems (it logs and
 * returns { ok: false }); callers decide whether that matters. Provider:
 * Resend when RESEND_API_KEY is set; in development the local Mailpit inbox
 * (http://127.0.0.1:54324, the same one Supabase uses); otherwise the
 * console.
 */
export type EmailMessage = {
  to: string | string[];
  subject: string;
  /** Plain text version (always provided). */
  text: string;
  /** Optional HTML version. */
  html?: string;
  replyTo?: string;
};

export { renderEmail, type EmailBlock, type EmailContent } from "./layout";

type SendResult = { ok: boolean; id?: string; error?: string };

const TIMEOUT_MS = 10_000;
const DEFAULT_FROM = "OrgaSport <noreply@orgasport.local>";

/** "OrgaSport <noreply@x.fr>" → { name: "OrgaSport", email: "noreply@x.fr" }. */
export function parseAddress(value: string): { name: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1]!.trim(), email: match[2]!.trim() };
  return { name: "", email: value.trim() };
}

async function viaResend(key: string, from: string, to: string[], m: EmailMessage): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject: m.subject, text: m.text, html: m.html, ...(m.replyTo && { reply_to: m.replyTo }) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok) return { ok: false, error: `resend_${res.status}${body?.message ? `: ${body.message}` : ""}` };
  return { ok: true, id: body?.id };
}

/** Local test inbox (Mailpit, shipped with the Supabase CLI). */
async function viaMailpit(from: string, to: string[], m: EmailMessage): Promise<SendResult> {
  const base = (process.env.EMAIL_DEV_MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
  const sender = parseAddress(from);
  const res = await fetch(`${base}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: { Email: sender.email, Name: sender.name },
      To: to.map((Email) => ({ Email })),
      Subject: m.subject,
      Text: m.text,
      ...(m.html && { HTML: m.html }),
      ...(m.replyTo && { ReplyTo: [{ Email: m.replyTo }] }),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { ID?: string } | null;
  if (!res.ok) return { ok: false, error: `mailpit_${res.status}` };
  return { ok: true, id: body?.ID };
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const to = (Array.isArray(message.to) ? message.to : [message.to]).map((a) => a.trim()).filter(Boolean);
  if (to.length === 0) return { ok: false, error: "no_recipient" };
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const production = process.env.NODE_ENV === "production";
  try {
    const key = process.env.RESEND_API_KEY?.trim();
    if (key) {
      const sent = await viaResend(key, from, to, message);
      if (!sent.ok) console.error(`[email] Resend refused "${message.subject}": ${sent.error}`);
      return sent;
    }
    if (!production) {
      const sent = await viaMailpit(from, to, message).catch((e: unknown) => ({ ok: false, error: String(e) }) as SendResult);
      if (sent.ok) return sent;
      // No local inbox: show the email in the server log so nothing is lost while developing.
      console.info(`[email] (not delivered: ${sent.error}) To: ${to.join(", ")}\nSubject: ${message.subject}\n\n${message.text}`);
      return { ok: false, error: "no_provider" };
    }
    // Production without a provider: never print the content (it may hold PIN codes).
    console.error(`[email] RESEND_API_KEY is not set: "${message.subject}" was not sent to ${to.length} recipient(s).`);
    return { ok: false, error: "no_provider" };
  } catch (e) {
    console.error(`[email] sending "${message.subject}" failed`, e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
