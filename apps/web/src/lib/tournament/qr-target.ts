import { env } from "@/lib/env";

/**
 * Address encoded in a tournament QR code: the public page, or the scoring
 * table (`cible=table`, volunteer sheet). Never carries a PIN.
 */
export function qrTarget(code: string, cible: string | null): string {
  return `${env.siteUrl}/c/${code}${cible === "table" ? "/table" : ""}`;
}
