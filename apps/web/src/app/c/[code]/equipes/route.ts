import { NextResponse, type NextRequest } from "next/server";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTournament } from "@/lib/tournament/load";
import { createVersionedCache } from "@/lib/tournament/versioned-cache";
import { renderPurgedPage } from "@/terrain/render";
import { renderTeamsPage } from "@/terrain/teams-page";

type Ctx = { params: Promise<{ code: string }> };

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

/** One light query (state_version) per request; the full state is rebuilt once per version. */
const loadPublic = createVersionedCache({
  readVersion: async (code) => {
    const { data, error } = await createAdminClient().from("tournaments").select("state_version").eq("short_code", code).neq("status", "draft").maybeSingle();
    if (error) throw error;
    return data?.state_version ?? null;
  },
  load: (code) => loadTournament(code),
});

/**
 * « Résultats par équipes » / list of registered teams: plain server-rendered
 * HTML, readable without JavaScript, public data only.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { code: raw } = await params;
  const code = normalizeShortCode(raw);
  if (!isShortCode(code)) return new Response("Not found", { status: 404 });
  if (code !== raw) return NextResponse.redirect(new URL(`/c/${code}/equipes`, request.nextUrl.origin), 301);
  const loaded = await loadPublic(code);
  if (!loaded) return NextResponse.redirect(new URL(`/c/${code}`, request.nextUrl.origin), 303);
  if (loaded.meta.purged_at) return new Response(renderPurgedPage(loaded.meta, { fragment: false }), { headers: HTML_HEADERS });
  return new Response(renderTeamsPage({ meta: loaded.meta, sport: loaded.sport, state: loaded.state }), { headers: HTML_HEADERS });
}
