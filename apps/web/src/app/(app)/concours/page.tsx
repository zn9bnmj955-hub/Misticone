import type { Metadata } from "next";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { SportBar } from "@/components/shell/SportBar";
import { AdoptSport } from "@/components/catalog/AdoptSport";
import { CatalogFilterBar } from "@/components/catalog/CatalogFilterBar";
import { CatalogResults, MAX_PAGES } from "@/components/catalog/CatalogResults";
import { effectiveFilters, pageHref, parsePage } from "@/components/catalog/model";
import { Skeleton } from "@/components/ui/Section";
import { parseCatalogFilters } from "@/lib/data/catalog";
import { ALL_SPORTS } from "@/lib/prefs";
import { getDevicePrefs, getSportFilter, getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().catalogPage.title, description: getMessages().catalogPage.description };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Time of the request (registration windows, date filters). Server components render once per request. */
const requestTime = () => Date.now();

/** Reads the URL, cookies and session: rendered inside <Suspense>. */
async function Catalog({ searchParams }: { searchParams: SearchParams }) {
  const c = getMessages().catalogPage;
  const [sp, sportCookie, prefs, viewer] = await Promise.all([searchParams, getSportFilter(), getDevicePrefs(), getViewer()]);
  const parsed = parseCatalogFilters(sp, sportCookie);

  // Distances start from « Autour de moi », else the profile city, else the city chosen on this device.
  const profile = viewer?.profile;
  const home =
    profile?.lat != null && profile.lng != null
      ? { lat: profile.lat, lng: profile.lng, city: profile.city }
      : prefs?.lat != null && prefs.lng != null
        ? { lat: prefs.lat, lng: prefs.lng, city: prefs.city ?? null }
        : null;
  const origin = parsed.point ?? (home ? { lat: home.lat, lng: home.lng } : null);
  const originLabel = parsed.point ? c.filters.fromHere : home ? (home.city ?? c.filters.fromHere) : null;
  const f = effectiveFilters(parsed, origin !== null);
  const page = parsePage(sp.page, MAX_PAGES);

  // A shared link with ?sport=… sets the sport selector, then the parameter is dropped.
  const sportParam = typeof sp.sport === "string" ? sp.sport : null;
  const adopt = sportParam && (sportParam === ALL_SPORTS || getSport(sportParam)?.enabled) ? sportParam : null;

  return (
    <>
      {adopt && <AdoptSport slug={adopt} accentToken={getSport(adopt)?.accentToken ?? null} href={pageHref(f, page)} />}
      <CatalogFilterBar f={f} originLabel={originLabel} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CatalogResults f={f} origin={origin} page={page} nowMs={requestTime()} />
      </Suspense>
    </>
  );
}

export default function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const c = getMessages().catalogPage;
  return (
    <div className="grid gap-6">
      <SportBar />
      <h1 className="display text-5xl">{c.title}</h1>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-11" />
            <Skeleton className="h-12" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <Catalog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
