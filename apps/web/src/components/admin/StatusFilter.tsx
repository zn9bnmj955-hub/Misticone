import Link from "next/link";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

/** Status chips as plain links (`?statut=`): the filter works without JavaScript and can be bookmarked. */
export function StatusFilter<T extends string>({
  basePath,
  options,
  current,
}: {
  basePath: string;
  options: { value: T; label: string }[];
  current: T | null;
}) {
  const t = getMessages().admin;
  const chips = [{ value: null, label: t.all }, ...options];
  return (
    <nav aria-label={t.filterLabel}>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = c.value === current;
          return (
            <li key={c.value ?? "all"}>
              <Link
                href={c.value ? `${basePath}?statut=${c.value}` : basePath}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-bold transition",
                  active ? "border-transparent bg-accent text-on-accent" : "border-line text-ink-soft hover:text-ink",
                )}
              >
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
