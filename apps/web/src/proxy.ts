import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { ONBOARDED_COOKIE } from "@/lib/prefs";

export async function proxy(request: NextRequest) {
  // Returning visitors skip the showcase and land on their own feed.
  const signedIn = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (request.nextUrl.pathname === "/" && (signedIn || request.cookies.has(ONBOARDED_COOKIE))) {
    const url = request.nextUrl.clone();
    url.pathname = "/accueil";
    return NextResponse.redirect(url);
  }
  return updateSession(request, NextResponse.next({ request }));
}

export const config = {
  // Tournament pages (/c/...) stay out of the proxy: they must be as fast as
  // possible and never depend on an account.
  matcher: [
    "/((?!_next/static|_next/image|c/|api/public|favicon.ico|icons/|manifest.webmanifest|terrain.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
