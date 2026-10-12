"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@orgasport/ui";
import { cn } from "@/components/ui/cn";

export type NavLabels = {
  home: string;
  tournaments: string;
  myDraw: string;
  assistant: string;
  profile: string;
  myClub: string;
  mainNav: string;
};

type Item = { href: string; label: string; icon: string; center?: boolean };

function items(labels: NavLabels, clubMode: boolean): Item[] {
  const list: Item[] = [
    { href: "/accueil", label: labels.home, icon: "home" },
    { href: "/concours", label: labels.tournaments, icon: "trophy" },
    { href: "/tirage", label: labels.myDraw, icon: "target", center: true },
  ];
  if (clubMode) list.push({ href: "/club", label: labels.myClub, icon: "club" });
  list.push({ href: "/assistant", label: labels.assistant, icon: "sparkle" });
  list.push({ href: "/profil", label: labels.profile, icon: "user" });
  return list;
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Bottom tab bar (mobile). */
export function TabBar({ labels, clubMode }: { labels: NavLabels; clubMode: boolean }) {
  const pathname = usePathname();
  const list = items(labels, clubMode);
  return (
    <nav
      aria-label={labels.mainNav}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-end gap-1 px-1 pb-2 text-[11px] font-bold leading-tight",
                  active ? "text-ink" : "text-ink-soft",
                )}
              >
                {item.center ? (
                  <span className="-mt-6 grid size-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-[var(--shadow-pop)] ring-4 ring-bg">
                    <Icon name={item.icon} size={28} />
                  </span>
                ) : (
                  <span className={cn("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-accent-soft text-accent-ink")}>
                    <Icon name={item.icon} size={22} />
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Left sidebar (desktop), same structure as the tab bar. */
export function SideNav({ labels, clubMode }: { labels: NavLabels; clubMode: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label={labels.mainNav}>
      <ul className="grid gap-1">
        {items(labels, clubMode).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-3 text-base font-bold transition",
                  item.center
                    ? "my-2 bg-accent text-on-accent hover:brightness-105"
                    : active
                      ? "bg-accent-soft text-accent-ink"
                      : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon name={item.icon} size={22} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
