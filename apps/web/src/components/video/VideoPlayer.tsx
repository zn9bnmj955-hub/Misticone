"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type VideoFile = { src: string; poster: string; width: number; height: number };

export type VideoPlayerProps = {
  title: string;
  /** Shown on the play button, e.g. « 1 min 15 ». */
  duration: string;
  /** 16:9 version (always) and 9:16 version (phones held upright). */
  wide: VideoFile;
  tall?: VideoFile;
  captions: string;
  chapters?: { at: number; label: string }[];
  labels: { play: string; subtitles: string; chapters: string; chapterAt: string; noVideo: string; download: string };
};

/** "Upright phone" at click time: `<source media>` is not reliable on every browser. */
const preferTall = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches;

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Poster first: no video byte is downloaded before the person asks for it.
 * The `<video>` element is created on click, with French subtitles on by
 * default, native controls and sound (never autoplay without a click).
 */
export function VideoPlayer({ title, duration, wide, tall, captions, chapters, labels }: VideoPlayerProps) {
  const [file, setFile] = useState<VideoFile | null>(null);
  const startAt = useRef(0);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!file || !v) return;
    if (startAt.current) v.currentTime = startAt.current;
    v.focus();
    v.play().catch(() => undefined); // The controls stay available if the browser refuses.
  }, [file]);

  const open = (at = 0) => {
    if (file && video.current) {
      video.current.currentTime = at;
      video.current.play().catch(() => undefined);
      return;
    }
    startAt.current = at;
    setFile(tall && preferTall() ? tall : wide);
  };

  const shown = file ?? wide;
  const upright = shown.height > shown.width;

  return (
    <div className="grid gap-3">
      <div
        className={
          upright
            ? "relative mx-auto aspect-[9/16] max-h-[80vh] w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] bg-stage"
            : "relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] bg-stage"
        }
      >
        {file ? (
          <video
            ref={video}
            className="size-full"
            controls
            playsInline
            preload="auto"
            poster={file.poster}
            width={file.width}
            height={file.height}
            aria-label={title}
            onPlay={(e) => {
              // One video at a time on the page.
              for (const other of document.querySelectorAll("video")) if (other !== e.currentTarget) other.pause();
            }}
          >
            <source src={file.src} type="video/mp4" />
            <track kind="subtitles" srcLang="fr" label={labels.subtitles} src={captions} default />
            {labels.noVideo}
          </video>
        ) : (
          <button type="button" onClick={() => open()} className="group absolute inset-0 text-on-accent" aria-label={labels.play}>
            <Image src={wide.poster} alt="" fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
            {/* Bottom corner: the poster's own title stays readable. */}
            <span className="absolute bottom-3 left-3 flex min-h-12 items-center gap-2 rounded-full bg-accent py-2 pl-3 pr-5 font-bold shadow-lg transition group-hover:scale-105 motion-reduce:transition-none">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
              <span className="tabular">{duration}</span>
            </span>
          </button>
        )}
      </div>

      {chapters && chapters.length > 0 && (
        <nav aria-label={labels.chapters}>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">{labels.chapters}</h3>
          <ol className="flex flex-wrap gap-2">
            {chapters.map((c) => (
              <li key={c.at}>
                <button
                  type="button"
                  onClick={() => open(c.at)}
                  className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:border-ink"
                  aria-label={labels.chapterAt.replace("{time}", clock(c.at)).replace("{label}", c.label)}
                >
                  <span className="tabular text-accent-ink">{clock(c.at)}</span>
                  {c.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <a href={(file ?? wide).src} download className="justify-self-start text-sm font-semibold underline underline-offset-4">
        {labels.download}
      </a>
    </div>
  );
}
