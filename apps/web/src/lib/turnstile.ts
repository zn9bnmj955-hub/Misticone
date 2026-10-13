/**
 * Cloudflare Turnstile (free anti-bot check) on public forms. Optional in
 * development; mandatory in production (missing keys = refused). Once
 * configured, it fails closed: no valid token, no registration.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && turnstileSiteKey());
}

let warned = false;

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileSiteKey()) {
    // In production the public forms must be protected: refuse until the keys are set.
    if (process.env.NODE_ENV === "production") {
      if (!warned) console.error("Turnstile keys missing: public registrations are refused (set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY)");
      warned = true;
      return false;
    }
    return true;
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "local") body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
