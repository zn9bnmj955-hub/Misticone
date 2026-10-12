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

export async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; id?: string; error?: string }> {
  void message;
  throw new Error("sendEmail: not implemented yet");
}
