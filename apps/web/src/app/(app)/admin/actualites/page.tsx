import type { Metadata } from "next";
import { Suspense } from "react";
import { SPORTS, getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section, Skeleton } from "@/components/ui/Section";
import { Disclosure } from "@/components/admin/fields";
import { requireAdmin } from "@/lib/data/admin";
import { formatDay, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteNewsSource, toggleNewsSource } from "./actions";
import { EMPTY_SOURCE, RefreshButton, SourceForm, TestButton } from "./forms";

const t = getMessages().feed.admin;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense.
export const instant = false;
export const metadata: Metadata = { title: t.metaTitle };

async function listSources() {
  // Runs as the admin (RLS shows disabled sources to platform admins only).
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_sources")
    .select("id, name, feed_url, site_url, sport_slug, enabled, last_fetched_at, news_items (count)")
    .order("name");
  return data ?? [];
}

async function Sources() {
  await requireAdmin();
  const sources = await listSources();
  const used = new Set(sources.map((s) => s.sport_slug));
  const sports = SPORTS.filter((s) => s.enabled || used.has(s.slug)).map((s) => ({ slug: s.slug, name: s.name }));

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <p>{t.intro}</p>
        <RefreshButton />
      </div>

      <Section title={t.list} id="admin-news-sources">
        {sources.length === 0 ? (
          <p className="text-ink-soft">{t.empty}</p>
        ) : (
          <ul className="grid gap-3">
            {sources.map((s) => {
              const sport = s.sport_slug ? getSport(s.sport_slug) : null;
              const count = s.news_items[0]?.count ?? 0;
              return (
                <li key={s.id}>
                  <Card className="grid gap-3" data-sport={sport?.accentToken}>
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-bold">{s.name}</span>
                      <span className="truncate text-sm text-ink-soft">{s.feed_url}</span>
                      {s.site_url && (
                        <a href={s.site_url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-bold text-accent-ink">
                          {s.site_url}
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? t.active : t.inactive}</Badge>
                      <Badge tone={sport ? "accent" : "neutral"}>
                        {sport && <Icon name={sport.icon} size={14} />}
                        {sport?.name ?? t.allSports}
                      </Badge>
                      <span className="text-ink-soft tabular">
                        {fmt(t.items, { count })} ·{" "}
                        {s.last_fetched_at
                          ? fmt(t.lastFetch, { when: `${formatDay(s.last_fetched_at)} ${formatTime(s.last_fetched_at)}` })
                          : t.neverFetched}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-start gap-3">
                      <TestButton sourceId={s.id} />
                      <form action={toggleNewsSource}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="enabled" value={String(!s.enabled)} />
                        <Button type="submit" variant="ghost">
                          {s.enabled ? t.disable : t.enable}
                        </Button>
                      </form>
                    </div>
                    <Disclosure summary={t.edit}>
                      <SourceForm
                        values={{
                          id: s.id,
                          name: s.name,
                          feedUrl: s.feed_url,
                          siteUrl: s.site_url ?? "",
                          sport: s.sport_slug ?? "",
                          enabled: s.enabled,
                        }}
                        sports={sports}
                      />
                    </Disclosure>
                    <Disclosure summary={t.delete}>
                      <form action={deleteNewsSource}>
                        <input type="hidden" name="id" value={s.id} />
                        <Button type="submit" variant="danger">
                          {t.deleteConfirm}
                        </Button>
                      </form>
                    </Disclosure>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.create} id="admin-news-new">
        <Card>
          <SourceForm values={EMPTY_SOURCE} sports={sports} />
        </Card>
      </Section>
    </div>
  );
}

export default function AdminNewsPage() {
  return (
    <div className="grid gap-4">
      <h2 className="display text-3xl">{t.title}</h2>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Sources />
      </Suspense>
    </div>
  );
}
