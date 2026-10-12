import Link from "next/link";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { RADII, catalogFiltersToQuery, type CatalogFilters, type Eligibility, type When } from "@/lib/data/catalog";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { AroundMe } from "./AroundMe";
import { FilterForm } from "./FilterForm";
import {
  CATALOG_PATH,
  activeChips,
  catalogHref,
  categoryOptions,
  clearAllHref,
  eligibilityLabel,
  formatOptions,
  panelFilterCount,
} from "./model";

const WHENS: When[] = ["all", "today", "weekend", "week", "month"];
const ELIGIBILITIES: Eligibility[] = ["open", "licensed", "mixed"];

/** URL value of an eligibility choice (« ouvert », « licencies »…), from the shared serializer. */
const eligibilityParam = (f: CatalogFilters, e: Eligibility) =>
  new URLSearchParams(catalogFiltersToQuery({ ...f, eligibility: e }).slice(1)).get("ouverture") ?? "";

type Option = { value: string; label: string; disabled?: boolean };

function SelectField({
  name,
  label,
  value,
  options,
  disabled,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  hint?: string;
}) {
  const id = `filtre-${name}`;
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        disabled={disabled}
        aria-describedby={hint ? `${id}-desc` : undefined}
        className="min-h-12 w-full rounded-[var(--radius)] border-2 border-line bg-surface px-3 text-base text-ink focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-desc`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

const pill = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold transition",
    active ? "border-ink bg-inverse text-on-inverse" : "border-line bg-surface text-ink hover:border-ink-soft",
  );

/**
 * Catalog filters: date pills (one tap), view switch, « Autour de moi », a
 * GET form for the other filters and the active filters as removable chips.
 * Every control is a link or a plain form field: all of it works without
 * JavaScript. The sport comes from the SportBar above.
 */
export function CatalogFilterBar({ f, originLabel }: { f: CatalogFilters; originLabel: string | null }) {
  const m = getMessages();
  const c = m.catalogPage;
  const hasOrigin = originLabel !== null;
  const chips = activeChips(f);
  const count = panelFilterCount(f);
  // « Autour de moi » adds lat/lng (and the distance sort) to the current filters.
  const aroundQuery = catalogFiltersToQuery({ ...f, sport: null, point: null, sort: "date" }).slice(1);
  // URL values of the current filters (French parameter names and values).
  const current = new URLSearchParams(catalogFiltersToQuery({ ...f, sport: null }).slice(1));

  return (
    <div className="grid gap-4">
      <nav aria-label={c.when.label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          {WHENS.map((w) => (
            <li key={w}>
              <Link href={catalogHref(f, { when: w })} scroll={false} aria-current={f.when === w ? "page" : undefined} className={pill(f.when === w)}>
                {c.when[w]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AroundMe action={CATALOG_PATH} query={aroundQuery} texts={c.around} active={f.point !== null} />
        <div role="group" aria-label={c.view.label} className="ml-auto inline-flex rounded-[var(--radius)] border-2 border-line bg-surface p-1">
          {(["list", "map"] as const).map((v) => (
            <Link
              key={v}
              href={catalogHref(f, { view: v })}
              scroll={false}
              aria-current={f.view === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-4 text-sm font-bold",
                f.view === v ? "bg-inverse text-on-inverse" : "text-ink hover:bg-surface-2",
              )}
            >
              {v === "map" && <Icon name="mapPin" size={18} />}
              {v === "list" ? c.view.list : c.view.map}
            </Link>
          ))}
        </div>
      </div>

      <details className="group rounded-[var(--radius-lg)] border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-lg)] px-4 font-bold [&::-webkit-details-marker]:hidden">
          <Icon name="search" size={20} />
          {c.filters.title}
          {count > 0 && <Badge tone="accent">{fmt(c.filters.active, { count })}</Badge>}
          <Icon name="arrowRight" size={18} className="ml-auto rotate-90 transition group-open:-rotate-90" />
        </summary>
        <FilterForm
          action={CATALOG_PATH}
          label={c.filters.title}
          updating={c.filters.updating}
          signature={catalogFiltersToQuery({ ...f, sport: null })}
          className="grid gap-4 border-t border-line p-4 sm:grid-cols-2"
        >
          {current.has("quand") && <input type="hidden" name="quand" value={current.get("quand")!} />}
          {f.view === "map" && <input type="hidden" name="vue" value="carte" />}
          {f.point && (
            <>
              <input type="hidden" name="lat" value={f.point.lat} />
              <input type="hidden" name="lng" value={f.point.lng} />
            </>
          )}
          <SelectField
            name="rayon"
            label={c.filters.radius}
            value={f.radiusKm ? String(f.radiusKm) : ""}
            disabled={!hasOrigin}
            hint={hasOrigin ? fmt(c.filters.from, { place: originLabel }) : c.filters.noPoint}
            options={[{ value: "", label: c.filters.radiusAny }, ...RADII.map((r) => ({ value: String(r), label: fmt(c.filters.radiusKm, { km: r }) }))]}
          />
          <SelectField
            name="tri"
            label={c.filters.sort}
            value={f.sort === "distance" ? "distance" : ""}
            options={[
              { value: "", label: c.filters.sortDate },
              { value: "distance", label: c.filters.sortDistance, disabled: !hasOrigin },
            ]}
          />
          <SelectField
            name="format"
            label={c.filters.format}
            value={f.format ?? ""}
            options={[{ value: "", label: c.filters.formatAny }, ...formatOptions(f.sport, f.format).map((x) => ({ value: x, label: m.formatLabels[x] }))]}
          />
          <SelectField
            name="ouverture"
            label={c.filters.eligibility}
            value={current.get("ouverture") ?? ""}
            options={[
              { value: "", label: c.filters.eligibilityAny },
              ...ELIGIBILITIES.map((e) => ({ value: eligibilityParam(f, e), label: eligibilityLabel(e) })),
            ]}
          />
          <SelectField
            name="categorie"
            label={c.filters.category}
            value={f.category ?? ""}
            options={[{ value: "", label: c.filters.categoryAny }, ...categoryOptions(f.sport, f.category).map((x) => ({ value: x, label: m.categoryLabels[x] }))]}
          />
          <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end font-bold">
            <input type="checkbox" name="places" value="1" defaultChecked={f.places} className="size-5 accent-accent" />
            {c.filters.places}
          </label>
          <button type="submit" className={buttonClass("primary", "md", "justify-self-start group-data-[auto]/filters:hidden sm:col-span-2")}>
            {c.filters.apply}
          </button>
        </FilterForm>
      </details>

      {chips.length > 0 && (
        <div role="group" aria-label={c.chips.label} className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              scroll={false}
              aria-label={fmt(c.chips.remove, { label: chip.label })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-surface pl-4 pr-3 text-sm font-bold hover:bg-surface-2"
            >
              {chip.label}
              <Icon name="close" size={16} />
            </Link>
          ))}
          <Link href={clearAllHref(f)} scroll={false} className="inline-flex min-h-11 items-center px-2 text-sm font-bold underline underline-offset-4">
            {c.chips.clearAll}
          </Link>
        </div>
      )}
    </div>
  );
}
