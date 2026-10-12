import { NextResponse, type NextRequest } from "next/server";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { findTournamentByCode } from "@/lib/data/tournaments";

/**
 * Target of the "Retrouver mon tirage" form: a real HTTP redirect, so it is
 * instant and works without JavaScript.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("code") ?? "";
  const code = normalizeShortCode(raw);
  const back = (error: string) => {
    const url = new URL("/tirage", request.nextUrl.origin);
    url.searchParams.set("code", raw.slice(0, 60));
    url.searchParams.set("erreur", error);
    return NextResponse.redirect(url, 303);
  };
  if (!isShortCode(code)) return back("format");
  const t = await findTournamentByCode(code);
  if (!t) return back("introuvable");
  return NextResponse.redirect(new URL(`/c/${t.short_code}`, request.nextUrl.origin), 303);
}
