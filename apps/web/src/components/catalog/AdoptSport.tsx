"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SPORT_COOKIE } from "@/lib/prefs";
import { setDeviceCookie } from "@/lib/cookies-client";

/**
 * A shared link such as /concours?sport=football: the sport becomes the
 * current choice of the sport selector (cookie + page accent), then the
 * parameter is dropped from the URL so that the sport chips keep working.
 */
export function AdoptSport({ slug, accentToken, href }: { slug: string; accentToken: string | null; href: string }) {
  const router = useRouter();
  useEffect(() => {
    setDeviceCookie(SPORT_COOKIE, slug);
    const root = document.documentElement;
    if (accentToken) root.setAttribute("data-sport", accentToken);
    else root.removeAttribute("data-sport");
    router.replace(href, { scroll: false });
  }, [slug, accentToken, href, router]);
  return null;
}
