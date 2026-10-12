/**
 * Poster and rules PDF of a tournament. Files go to the public bucket
 * `tournament-media` under `<tournamentId>/`: the server picks the path and
 * checks the real content (magic bytes) after the upload, so a file renamed
 * to .png cannot be published. Pure helpers shared by the browser and the
 * server actions.
 */
export const MEDIA_BUCKET = "tournament-media";

export const MEDIA_KINDS = ["poster", "rules"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const MB = 1024 * 1024;

export const MEDIA_RULES: Record<MediaKind, { maxBytes: number; types: Record<string, string> }> = {
  poster: { maxBytes: 5 * MB, types: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } },
  rules: { maxBytes: 10 * MB, types: { "application/pdf": "pdf" } },
};

const TYPE_OF_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

/** Value of the `accept` attribute of the file input. */
export function acceptOf(kind: MediaKind): string {
  return Object.keys(MEDIA_RULES[kind].types).join(",");
}

/** Problem with a picked file before sending it, or null. */
export function checkMediaFile(kind: MediaKind, file: { type: string; size: number }): "bad_type" | "too_big" | null {
  const rules = MEDIA_RULES[kind];
  if (!rules.types[file.type]) return "bad_type";
  if (file.size <= 0 || file.size > rules.maxBytes) return "too_big";
  return null;
}

/** `<tournamentId>/poster-<timestamp>.png` or `<tournamentId>/rules-<timestamp>.pdf`. */
export function mediaPath(tournamentId: string, kind: MediaKind, type: string, nowMs: number): string {
  const ext = MEDIA_RULES[kind].types[type];
  if (!ext) throw new Error(`unsupported type ${type}`);
  return `${tournamentId}/${kind}-${nowMs}.${ext}`;
}

/** True when `path` is a file of this kind that belongs to this tournament. */
export function isMediaPathOf(tournamentId: string, kind: MediaKind, path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith(`${tournamentId}/`)) return false;
  const name = path.slice(tournamentId.length + 1);
  const exts = Object.values(MEDIA_RULES[kind].types).join("|");
  return new RegExp(`^${kind}-\\d{10,16}\\.(${exts})$`).test(name);
}

/** MIME type announced by a stored path ("…/poster-1.png" → "image/png"). */
export function typeOfPath(path: string): string | null {
  const ext = path.split(".").pop() ?? "";
  return TYPE_OF_EXT[ext] ?? null;
}

/** Real type of a file from its first bytes, or null when unknown. */
export function sniffType(bytes: Uint8Array): string | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}
