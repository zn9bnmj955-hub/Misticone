import type { ReactNode } from "react";
import { getMessages } from "@/i18n";
import { ClubNav } from "./ClubNav";

/** Title and tab row shared by every page of the club space. */
export function ClubPageHeader({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  const m = getMessages();
  return (
    <header className="grid gap-4">
      <ClubNav labels={m.clubSpace.nav} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="display text-5xl">{title}</h1>
          {intro && <p className="text-ink-soft">{intro}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
