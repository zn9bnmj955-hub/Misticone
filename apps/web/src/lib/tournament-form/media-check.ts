import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_BUCKET, MEDIA_RULES, isMediaPathOf, sniffType, typeOfPath, type MediaKind } from "@/components/tournament-form/media";

/**
 * Checks a stored poster / rules file for real: it belongs to this
 * tournament's folder, is not too big, and its first bytes match its type.
 * Used when an upload is confirmed and again before the form is frozen for
 * payment (a draft could point at a file that was never confirmed).
 */
export async function checkStoredMedia(tournamentId: string, kind: MediaKind, path: unknown): Promise<"ok" | "invalid" | "missing" | "too_big" | "bad_type"> {
  if (!isMediaPathOf(tournamentId, kind, path)) return "invalid";
  const { data: blob, error } = await createAdminClient().storage.from(MEDIA_BUCKET).download(path);
  if (error || !blob) return "missing";
  if (blob.size > MEDIA_RULES[kind].maxBytes) return "too_big";
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  return sniffType(head) === typeOfPath(path) ? "ok" : "bad_type";
}
