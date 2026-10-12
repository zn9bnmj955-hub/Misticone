import { Suspense, type ReactNode } from "react";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { buttonClass } from "@/components/ui/Button";
import { Section, Skeleton } from "@/components/ui/Section";
import { cn } from "@/components/ui/cn";
import { env } from "@/lib/env";
import { formatDay } from "@/lib/format";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { restaurantsLink, telHref } from "./links";
import { ShareBar } from "./ShareBar";
import { WeatherTile } from "./WeatherTile";

const TILE = "grid content-start gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4";

function Tile({ title, icon, children, wide }: { title: string; icon?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(TILE, wide && "sm:col-span-2")}>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

/** A whole tile that opens something in one tap (map search, calendar file). */
function LinkTile({ href, title, hint, icon, external }: { href: string; title: string; hint: string; icon: string; external?: boolean }) {
  const newTab = getMessages().detail.more.newTab;
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(TILE, "group min-h-24 transition hover:border-ink-soft")}
    >
      <span className="flex items-center gap-2 text-lg font-bold group-hover:text-accent-ink">
        <Icon name={icon} size={22} />
        {title}
        <Icon name="arrowRight" size={18} className="ml-auto" />
      </span>
      <span className="text-sm text-ink-soft">
        {hint}
        {external && <span className="sr-only"> {newTab}</span>}
      </span>
    </a>
  );
}

/** « Voir plus »: weather, restaurants, calendar, parking, food, contact, rules, poster, share. */
export function PracticalInfo({ t, code }: { t: TournamentDetail; code: string }) {
  const m = getMessages();
  const more = m.detail.more;
  const s = m.detail.share;
  const restaurants = restaurantsLink(t);
  const over = t.status === "finished" || t.status === "archived";
  const url = `${env.siteUrl}/concours/${code}`;
  const shareText = fmt(s.text, { name: t.name, date: formatDay(t.starts_at), city: t.city ?? "" });

  return (
    <Section title={more.title} id="infos">
      <div className="grid gap-3 sm:grid-cols-2">
        {!over && (
          <Tile title={m.detail.weather.title} icon={<Icon name="sun" size={22} />}>
            <Suspense fallback={<Skeleton className="h-16" />}>
              <WeatherTile t={t} />
            </Suspense>
          </Tile>
        )}
        {restaurants && <LinkTile href={restaurants} title={more.restaurants} hint={more.restaurantsHint} icon="search" external />}
        {!over && <LinkTile href={`/c/${code}/calendrier.ics`} title={more.calendar} hint={more.calendarHint} icon="calendar" />}
        {t.parking && (
          <Tile title={more.parking}>
            <p className="whitespace-pre-line">{t.parking}</p>
          </Tile>
        )}
        {t.food && (
          <Tile title={more.food}>
            <p className="whitespace-pre-line">{t.food}</p>
          </Tile>
        )}
        {(t.contact_name || t.contact_phone) && (
          <Tile title={more.contact} icon={<Icon name="user" size={22} />}>
            {t.contact_name && <p className="font-semibold">{t.contact_name}</p>}
            {t.contact_phone && (
              <a href={telHref(t.contact_phone)} className={buttonClass("outline", "md", "justify-self-start tabular")}>
                {more.call} · {t.contact_phone}
              </a>
            )}
          </Tile>
        )}
        {(t.rules_text || t.rulesPdfUrl) && (
          <Tile title={more.rules} wide>
            {t.rules_text && <p className="whitespace-pre-line">{t.rules_text}</p>}
            {t.rulesPdfUrl && (
              <a href={t.rulesPdfUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "md", "justify-self-start")}>
                {more.rulesPdf}
                <span className="sr-only"> {more.newTab}</span>
              </a>
            )}
          </Tile>
        )}
        {t.posterUrl && (
          <Tile title={more.poster} icon={<Icon name="image" size={22} />} wide>
            <a href={t.posterUrl} target="_blank" rel="noopener noreferrer" className="justify-self-start" aria-label={more.posterOpen}>
              {/* eslint-disable-next-line @next/next/no-img-element -- organizer upload served by Storage */}
              <img
                src={t.posterUrl}
                alt={fmt(more.posterAlt, { name: t.name })}
                loading="lazy"
                decoding="async"
                className="max-h-96 w-auto max-w-full rounded-[var(--radius)] border border-line object-contain"
              />
            </a>
          </Tile>
        )}
        <Tile title={s.title} wide>
          <ShareBar
            url={url}
            title={t.name}
            text={shareText}
            labels={{ whatsapp: s.whatsapp, facebook: s.facebook, copy: s.copy, copied: s.copied, copyFailed: more.copyFailed, native: s.native, newTab: more.newTab }}
          />
        </Tile>
      </div>
    </Section>
  );
}
