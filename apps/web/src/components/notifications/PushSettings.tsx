"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { disablePush, followedTeamsRaw, parseFollowedTeams, subscribePushChanges } from "@/lib/push-client";
import { setEmailFallback } from "./actions";
import { NotifyButton, usePushState, type NotificationTexts } from "./NotifyButton";

/**
 * Profile « Notifications »: this device (on/off), the email fallback of the
 * account, and the teams this device follows (each can be stopped).
 */
export function PushSettings({ texts, account }: { texts: NotificationTexts; account: { email: string | null; emailOptIn: boolean } | null }) {
  const p = texts.profile;
  const { support, on } = usePushState();
  const teamsRaw = useSyncExternalStore(subscribePushChanges, followedTeamsRaw, () => "[]");
  const teams = parseFollowedTeams(teamsRaw);
  const [emailOn, setEmailOn] = useState(account?.emailOptIn ?? false);
  const [emailError, setEmailError] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleEmail() {
    const next = !emailOn;
    startTransition(async () => {
      const result = await setEmailFallback(next);
      setEmailError(!result.ok);
      if (result.ok) setEmailOn(next);
    });
  }

  return (
    <div className="grid gap-5">
      <p className="text-ink-soft">{p.intro}</p>

      <div className="grid gap-2">
        {support !== "server" && support !== "supported" ? (
          <NotifyButton texts={texts} />
        ) : on ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="font-bold">{p.deviceOn}</p>
            <Button type="button" variant="outline" onClick={() => void disablePush()}>{p.disable}</Button>
          </div>
        ) : account ? (
          <div className="grid gap-2">
            <p role="status" className="font-bold">{p.deviceOff}</p>
            <NotifyButton texts={{ ...texts, button: p.enable }} />
          </div>
        ) : (
          <p className="font-bold">{p.deviceOff}</p>
        )}
        {!account && <p className="text-sm text-ink-soft">{p.guest}</p>}
      </div>

      {account && (
        <div className="grid gap-2">
          <p className="eyebrow">{p.emailTitle}</p>
          <p className="text-ink-soft">{emailOn ? p.emailOn.replace("{email}", account.email ?? "") : p.emailOff}</p>
          <Button type="button" variant="outline" className="justify-self-start" disabled={pending} onClick={toggleEmail}>
            {emailOn ? p.emailDisable : p.emailEnable}
          </Button>
          {emailError && <p role="alert" className="text-sm font-bold text-danger">{texts.error}</p>}
        </div>
      )}

      <div className="grid gap-2">
        <p className="eyebrow">{p.teamsTitle}</p>
        {teams.length === 0 ? (
          <p className="text-sm text-ink-soft">{support === "server" ? "" : p.teamsEmpty}</p>
        ) : (
          <ul className="grid gap-1">
            {teams.map((t) => (
              <li key={`${t.code}:${t.team}`} className="flex min-h-12 items-center justify-between gap-3 border-b border-line">
                <Link href={`/c/${t.code}?equipe=${t.team}`} className="font-bold tabular hover:underline">
                  {p.team.replace("{code}", t.code).replace("{number}", String(t.team))}
                </Link>
                <button type="button" className="min-h-12 px-2 text-sm font-bold text-ink-soft underline" onClick={() => void disablePush(t)}>
                  {p.stopTeam}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
