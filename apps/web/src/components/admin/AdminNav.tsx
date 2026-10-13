"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

const LINKS = [
  { href: "/admin", key: "overview" },
  { href: "/admin/tarifs", key: "plans" },
  { href: "/admin/codes-promo", key: "promos" },
  { href: "/admin/paiements", key: "payments" },
  { href: "/admin/concours", key: "tournaments" },
  { href: "/admin/actualites", key: "news" },
] as const;

/** Tab row of the admin area: every section is one tap away. */
export function AdminNav() {
  const t = getMessages().admin;
  const labels = { ...t.nav, news: getMessages().feed.admin.nav };
  const pathname = usePathname();
  return (
    <nav aria-label={t.navLabel}>
      <ul className="flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const current = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-full border-2 px-4 font-bold transition",
                  current ? "border-ink bg-inverse text-on-inverse" : "border-line text-ink hover:border-ink-soft",
                )}
              >
                {labels[l.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
