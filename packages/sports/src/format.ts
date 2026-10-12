import type { SportConfig } from "./schema";

/** Replace {placeholders}; unknown placeholders are left as-is. */
export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** "Terrain" with a capital, as shown on a venue badge. */
export function venueLabel(sport: SportConfig, plural = false): string {
  const noun = plural ? sport.venue.noun.plural : sport.venue.noun.singular;
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}
