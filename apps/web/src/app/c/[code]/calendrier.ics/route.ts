import type { NextRequest } from "next/server";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { fmt, getMessages } from "@/i18n";
import { buildIcs } from "@/lib/ics";
import { loadTournament } from "@/lib/tournament/load";

type Ctx = { params: Promise<{ code: string }> };

/** "Ajouter à mon agenda": one event for the tournament day. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const code = normalizeShortCode((await params).code);
  const loaded = isShortCode(code) ? await loadTournament(code) : null;
  if (!loaded?.meta.starts_at) return new Response("Not found", { status: 404 });
  const { meta, sport } = loaded;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const start = meta.starts_at!;
  const end = meta.estimated_end_at && meta.estimated_end_at > start ? meta.estimated_end_at : new Date(Date.parse(start) + 4 * 3600_000).toISOString();
  const format = sport.teamFormats.find((f) => f.id === meta.team_format)?.label;
  const m = getMessages().detail;
  const description = [
    [sport.name, format].filter(Boolean).join(" · "),
    meta.club ? fmt(getMessages().tournament.by, { club: meta.club.name }) : null,
    fmt(m.icsDescription, { url: `${site}/c/${code}` }),
  ]
    .filter(Boolean)
    .join("\n");
  const body = buildIcs({
    uid: `${code}@orgasport`,
    start,
    end,
    stamp: new Date().toISOString(),
    summary: meta.name,
    location: [meta.address, meta.postcode, meta.city].filter(Boolean).join(", ") || null,
    geo: meta.lat != null && meta.lng != null ? { lat: meta.lat, lng: meta.lng } : null,
    url: `${site}/c/${code}`,
    description,
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${code}.ics"`,
      "cache-control": "no-store",
    },
  });
}
