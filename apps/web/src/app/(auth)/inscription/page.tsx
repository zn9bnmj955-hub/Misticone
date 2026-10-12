import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().onboarding.chooseTitle };

export default function OnboardingStart() {
  const m = getMessages();
  const doors = [
    { href: "/inscription/joueur", icon: "petanque", ...m.landing.doors.play },
    { href: "/inscription/club", icon: "club", ...m.landing.doors.organize },
    { href: "/inscription/invite", icon: "arrowRight", ...m.landing.doors.guest },
  ];
  return (
    <div className="grid gap-6 pt-6">
      <div className="grid gap-2">
        <h1 className="display text-5xl">{m.onboarding.chooseTitle}</h1>
        <p className="text-lg text-ink-soft">{m.onboarding.chooseText}</p>
      </div>
      <ul className="grid gap-3">
        {doors.map((d) => (
          <li key={d.href}>
            <Link href={d.href} className="flex min-h-20 items-center gap-4 rounded-[var(--radius-lg)] border-2 border-line bg-surface p-4 hover:border-ink">
              <span className="grid size-12 place-items-center rounded-full bg-accent text-on-accent">
                <Icon name={d.icon} />
              </span>
              <span className="grid flex-1">
                <span className="display text-3xl">{d.title}</span>
                <span className="text-sm text-ink-soft">{d.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
