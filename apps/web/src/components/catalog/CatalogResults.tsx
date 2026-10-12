import Link from "next/link";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { catalogFiltersToQuery, listCatalog, toCatalogQuery, type CatalogFilters } from "@/lib/data/catalog";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Note, Section } from "@/components/ui/Section";
import { CatalogMapView } from "./CatalogMapView";
import { waitlistFlags } from "./data";
import { CATALOG_PATH, activeChips, catalogHref, clearAllHref, countLabel, mapPoints, pageHref, widerRadius, type CatalogCardRow } from "./model";

/** Cards per « Voir plus » step; the SQL function returns at most 200 rows. */
export const PAGE_SIZE = 50;
const MAX_ROWS = 200;
export const MAX_PAGES = MAX_ROWS / PAGE_SIZE;

function CardList({ rows, nowMs }: { rows: CatalogCardRow[]; nowMs: number }) {
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.id}>
          <TournamentCard t={r} nowMs={nowMs} />
        </li>
      ))}
    </ul>
  );
}

function Empty({ f }: { f: CatalogFilters }) {
  const c = getMessages().catalogPage;
  const wider = widerRadius(f.radiusKm);
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-line px-4 py-8 text-center">
      <Icon name="search" size={32} className="text-ink-soft" />
      <h2 className="display text-3xl">{c.empty.title}</h2>
      <p className="max-w-md text-ink-soft">{c.empty.text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {wider && (
          <ButtonLink href={catalogHref(f, { radiusKm: wider })} scroll={false}>
            {fmt(c.empty.widen, { km: wider })}
          </ButtonLink>
        )}
        {f.when !== "all" && (
          <ButtonLink href={catalogHref(f, { when: "all" })} variant="outline" scroll={false}>
            {c.empty.allDates}
          </ButtonLink>
        )}
        {activeChips(f).length > 0 && (
          <ButtonLink href={clearAllHref(f)} variant="outline" scroll={false}>
            {c.empty.clear}
          </ButtonLink>
        )}
        {f.sport && (
          // Switches the sport selector back to « Tous » (see AdoptSport).
          <ButtonLink href={CATALOG_PATH + catalogFiltersToQuery({ ...f, sport: "all" })} variant="ghost" scroll={false}>
            {c.empty.allSports}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/**
 * Results of the catalog: server-rendered cards (cached query), « Voir plus »
 * by pages of 50, or the map view with the list below it.
 */
export async function CatalogResults({
  f,
  origin,
  page,
  nowMs,
}: {
  f: CatalogFilters;
  origin: { lat: number; lng: number } | null;
  page: number;
  nowMs: number;
}) {
  const c = getMessages().catalogPage;
  const shown = f.view === "map" ? MAX_ROWS : Math.min(MAX_ROWS, PAGE_SIZE * page);
  // One extra row tells whether « Voir plus » has something to show.
  const rows = await listCatalog({ ...toCatalogQuery(f, origin, nowMs), limit: Math.min(MAX_ROWS, shown + 1) });
  const more = rows.length > shown;
  const visible = rows.slice(0, shown);

  const fullIds = visible
    .filter((r) => r.status === "published" && r.max_teams !== null && r.active_teams >= r.max_teams)
    .map((r) => r.id)
    .sort();
  const flags = await waitlistFlags(fullIds);
  const cards: CatalogCardRow[] = visible.map((r) => (r.id in flags ? { ...r, waitlist_enabled: flags[r.id] } : r));

  const count = (
    <p role="status" className="text-sm font-bold text-ink-soft tabular">
      {countLabel(cards.length, more)}
    </p>
  );
  if (cards.length === 0) {
    return (
      <div className="grid gap-3">
        {count}
        <Empty f={f} />
      </div>
    );
  }

  if (f.view === "map") {
    const { points, withoutPosition } = mapPoints(cards);
    const placed = cards.filter((r) => !withoutPosition.includes(r));
    return (
      <div className="grid gap-4">
        {count}
        {points.length > 0 ? (
          <CatalogMapView points={points} label={c.map.label} attribution={c.map.attribution} pinTemplate={c.map.pin} />
        ) : (
          <Note>{c.map.noneOnMap}</Note>
        )}
        {placed.length > 0 && <CardList rows={placed} nowMs={nowMs} />}
        {withoutPosition.length > 0 && (
          <Section title={c.map.noPosition} id="sans-position">
            <CardList rows={withoutPosition} nowMs={nowMs} />
          </Section>
        )}
        {rows.length >= MAX_ROWS && <Note>{c.tooMany}</Note>}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {count}
      <CardList rows={cards} nowMs={nowMs} />
      {more && page < MAX_PAGES && (
        <Link href={pageHref(f, page + 1)} scroll={false} className={buttonClass("outline", "md", "justify-self-center")}>
          {c.more}
        </Link>
      )}
      {rows.length >= MAX_ROWS && <Note>{c.tooMany}</Note>}
    </div>
  );
}
