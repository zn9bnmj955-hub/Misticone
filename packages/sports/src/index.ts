import { sportConfigSchema, type SportConfig } from "./schema";
import { petanque } from "./sports/petanque";
import { football } from "./sports/football";

export * from "./schema";
export { formatTemplate, venueLabel } from "./format";

/**
 * Registry of built-in sports. Adding a sport = adding a file in ./sports and
 * one line here. Nothing else (engine, UI) needs to change.
 */
const RAW = [petanque, football];

export const SPORTS: readonly SportConfig[] = RAW.map((s) => sportConfigSchema.parse(s)).sort(
  (a, b) => a.sortOrder - b.sortOrder,
);

const BY_SLUG = new Map(SPORTS.map((s) => [s.slug, s]));

export function getSport(slug: string): SportConfig | undefined {
  return BY_SLUG.get(slug);
}

export function requireSport(slug: string): SportConfig {
  const sport = BY_SLUG.get(slug);
  if (!sport) throw new Error(`Unknown sport: ${slug}`);
  return sport;
}

export function enabledSports(): SportConfig[] {
  return SPORTS.filter((s) => s.enabled);
}

export function isValidLicenseNumber(sport: SportConfig, value: string): boolean {
  const pattern = sport.license.numberPattern;
  if (!pattern) return value.trim().length > 0;
  return new RegExp(pattern).test(value.trim());
}
