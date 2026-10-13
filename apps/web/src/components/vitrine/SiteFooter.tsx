import Link from "next/link";
import { LogoMark, Wordmark } from "@orgasport/ui";
import { getMessages } from "@/i18n";

export function SiteFooter() {
  const m = getMessages();
  return (
    <footer className="border-t border-line px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 text-sm text-ink-soft">
        <span className="flex items-center gap-2 text-ink">
          <LogoMark size={22} />
          <Wordmark className="text-lg" />
        </span>
        <nav aria-label={m.legal.title}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link href="/decouvrir" className="font-semibold text-ink underline-offset-4 hover:underline">
                {m.videos.footerLink}
              </Link>
            </li>
            {Object.entries(m.legal.pages).map(([slug, title]) => (
              <li key={slug}>
                <Link href={`/legal/${slug}`} className="underline-offset-4 hover:underline">
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
