"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export type ClubNavLabels = {
  label: string;
  dashboard: string;
  stats: string;
  invoices: string;
  members: string;
  announcements: string;
  info: string;
};

/** Tab row of the club space: every sub-page is one tap away from any other. */
export function ClubNav({ labels }: { labels: ClubNavLabels }) {
  const pathname = usePathname();
  const items = [
    { href: "/club", label: labels.dashboard },
    { href: "/club/statistiques", label: labels.stats },
    { href: "/club/factures", label: labels.invoices },
    { href: "/club/membres", label: labels.members },
    { href: "/club/annonces", label: labels.announcements },
    { href: "/club/infos", label: labels.info },
  ];
  return (
    <nav aria-label={labels.label} className="-mx-4 overflow-x-auto px-4 pb-1">
      <ul className="flex w-max gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold whitespace-nowrap transition",
                  active ? "border-ink bg-inverse text-on-inverse" : "border-line text-ink hover:border-ink-soft",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
