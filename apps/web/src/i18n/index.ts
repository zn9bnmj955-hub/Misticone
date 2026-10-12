import { fr, type Messages } from "./fr";

export const LOCALES = ["fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

const DICTIONARIES: Record<Locale, Messages> = { fr };

/**
 * Returns the interface texts. Only French exists today; when a second
 * language is added, resolve the locale here (profile, cookie or
 * Accept-Language) and add its dictionary above.
 */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return DICTIONARIES[locale];
}

/** Fills {placeholders} in a message. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type { Messages };
