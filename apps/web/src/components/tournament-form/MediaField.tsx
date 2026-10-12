"use client";
import { useId, useState } from "react";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { getBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/components/ui/cn";
import { confirmUpload, prepareUpload, removeMedia } from "@/app/(app)/club/concours/actions";
import { MEDIA_BUCKET, acceptOf, checkMediaFile, type MediaKind } from "./media";

/** Public address of a stored poster or rules PDF (no network call). */
export function mediaUrl(path: string): string {
  return getBrowserClient().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Poster image or rules PDF: picked here, sent straight to storage with a
 * one-time upload URL from the server, then checked by the server.
 */
export function MediaField({
  tournamentId,
  kind,
  label,
  hint,
  path,
  onChange,
  error: formError,
}: {
  tournamentId: string;
  kind: MediaKind;
  label: string;
  hint: string;
  path: string | null;
  onChange: (path: string | null) => void;
  error?: string;
}) {
  const t = getMessages().wizard.media;
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setError(null);
    const problem = checkMediaFile(kind, file);
    if (problem) {
      setError(t.errors[problem]!);
      return;
    }
    setBusy(true);
    try {
      const ticket = await prepareUpload(tournamentId, kind, { type: file.type, size: file.size });
      if (!ticket.ok) throw new Error(ticket.error);
      const { error: uploadError } = await getBrowserClient()
        .storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (uploadError) throw new Error("upload");
      const done = await confirmUpload(tournamentId, kind, ticket.path, path);
      if (!done.ok) throw new Error(done.error);
      onChange(done.path);
    } catch (e) {
      const code = e instanceof Error ? e.message : "upload";
      setError(t.errors[code] ?? t.errors.upload!);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!path) return;
    setBusy(true);
    setError(null);
    const old = path;
    onChange(null);
    // Best effort: an orphan file is harmless, a stuck form is not.
    await removeMedia(tournamentId, kind, old).catch(() => null);
    setBusy(false);
  }

  const shownError = error ?? formError;
  return (
    <div className="grid gap-2" aria-busy={busy}>
      <span id={`${id}-label`} className="text-sm font-bold">
        {label}
      </span>
      {path && kind === "poster" && (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from storage
        <img src={mediaUrl(path)} alt={t.posterAlt} className="max-h-64 w-auto max-w-full justify-self-start rounded-[var(--radius)] border border-line object-contain" />
      )}
      {path && kind === "rules" && (
        <a href={mediaUrl(path)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 font-bold text-accent-ink underline">
          <Icon name="arrowRight" size={18} />
          {t.open}
        </a>
      )}
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(
            "inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius)] border-2 border-ink px-5 font-bold hover:bg-surface-2",
            "has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
            busy && "pointer-events-none opacity-50",
          )}
        >
          <Icon name={kind === "poster" ? "image" : "plus"} size={20} />
          {busy ? t.uploading : path ? t.change : t.choose}
          <input
            type="file"
            accept={acceptOf(kind)}
            disabled={busy}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-desc`}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void send(file);
            }}
          />
        </label>
        {path && !busy && (
          <button type="button" onClick={remove} className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius)] px-4 font-bold text-ink-soft hover:bg-surface-2 hover:text-ink">
            <Icon name="close" size={20} />
            {t.remove}
          </button>
        )}
      </div>
      <p id={`${id}-desc`} role={shownError ? "alert" : undefined} className={cn("text-sm", shownError ? "font-bold text-danger" : "text-ink-soft")}>
        {shownError ?? hint}
      </p>
    </div>
  );
}
