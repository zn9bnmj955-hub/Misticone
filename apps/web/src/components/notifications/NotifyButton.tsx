"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@orgasport/ui";
import type { Messages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { disablePush, enablePush, isEnabledFor, pushSupport, subscribePushChanges } from "@/lib/push-client";
import { IosInstallHelp } from "./IosInstallHelp";

export type NotificationTexts = Messages["notifications"];

/** Support + "on" flag as one primitive (stable `useSyncExternalStore` snapshot). */
export function usePushState(code?: string, team?: number) {
  const snap = useSyncExternalStore(
    subscribePushChanges,
    () => `${pushSupport()}|${isEnabledFor(code, team) ? 1 : 0}`,
    () => "server|0",
  );
  const [support, on] = snap.split("|");
  return { support: support as ReturnType<typeof pushSupport> | "server", on: on === "1" };
}

/**
 * « Me prévenir quand c'est à moi ». Never asks anything before the click;
 * explains instead of failing when the browser cannot (iPhone not installed,
 * blocked, unsupported). `code` + `team`: follow one team (no account
 * needed); none: this device receives the signed-in account's notifications.
 */
export function NotifyButton({ code, team, texts, className }: { code?: string; team?: number; texts: NotificationTexts; className?: string }) {
  const { support, on } = usePushState(code, team);
  const [phase, setPhase] = useState<"idle" | "asking" | "error">("idle");

  if (support === "server") return null;
  if (support === "ios_needs_install") return <IosInstallHelp texts={texts} />;
  if (support === "unsupported") return <p className="text-sm text-ink-soft">{texts.unsupported}</p>;
  if (support === "denied") return <p role="status" className="text-sm text-ink-soft">{texts.denied}</p>;

  if (on) {
    return (
      <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ""}`}>
        <span className="inline-flex items-center gap-2 font-bold">
          <Icon name="check" size={20} className="text-accent-ink" />
          {team ? texts.enabledTeam.replace("{number}", String(team)) : texts.enabled}
        </span>
        <button type="button" className="min-h-12 text-sm font-bold text-ink-soft underline" onClick={() => void disablePush({ code, team })}>
          {texts.stop}
        </button>
      </div>
    );
  }

  async function start() {
    setPhase("asking");
    const result = await enablePush({ code, team });
    // Refused or dismissed: the store now reports "denied" or the idle button again.
    setPhase(result.ok || result.reason === "denied" || result.reason === "dismissed" ? "idle" : "error");
  }

  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Button type="button" onClick={() => void start()} disabled={phase === "asking"} className="justify-self-start">
        <Icon name="bell" size={20} />
        {texts.button}
      </Button>
      {phase === "asking" && <p role="status" className="text-sm text-ink-soft">{texts.asking}</p>}
      {phase === "error" && <p role="alert" className="text-sm font-bold text-danger">{texts.error}</p>}
    </div>
  );
}
