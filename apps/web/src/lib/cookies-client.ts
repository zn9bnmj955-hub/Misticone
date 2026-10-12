import { ONE_YEAR } from "@/lib/prefs";

/** Writes a first-party preference cookie from the browser. */
export function setDeviceCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
