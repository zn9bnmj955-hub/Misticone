"use client";
import { useState, useTransition } from "react";
import { Icon } from "@orgasport/ui";
import { buttonClass } from "@/components/ui/Button";
import type { FollowResult } from "@/app/(app)/club/actions";

export type FollowLabels = { follow: string; following: string; unfollow: string; hint: string };

/** « Suivre ce club » toggle: the state flips at once, and comes back if the server refuses. */
export function FollowButton({
  clubId,
  initial,
  labels,
  action,
}: {
  clubId: string;
  initial: boolean;
  labels: FollowLabels;
  action: (clubId: string, follow: boolean) => Promise<FollowResult>;
}) {
  const [following, setFollowing] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !following;
    setFollowing(next);
    setError(null);
    startTransition(async () => {
      const result = await action(clubId, next).catch(() => null);
      if (!result?.ok) {
        setFollowing(!next);
        setError(result && !result.ok ? result.error : null);
      }
    });
  }

  return (
    <div className="grid gap-1.5 justify-items-start">
      <button type="button" onClick={toggle} disabled={pending} aria-pressed={following} className={buttonClass(following ? "outline" : "primary")}>
        <Icon name={following ? "check" : "bell"} size={20} />
        {following ? labels.following : labels.follow}
      </button>
      {following ? (
        <button type="button" onClick={toggle} disabled={pending} className="min-h-10 text-sm font-semibold text-ink-soft underline underline-offset-4">
          {labels.unfollow}
        </button>
      ) : (
        <p className="text-sm text-ink-soft">{labels.hint}</p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
