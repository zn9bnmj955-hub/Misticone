import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import type { PaymentStatus, TournamentStatus } from "@/lib/data/admin";

type Tone = "neutral" | "accent" | "live" | "success" | "warning";

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/** "24 oct. 2026 · 15 h 40" (Paris time): admin lists span several years, so the year is shown. */
export function formatDateTime(iso: string): string {
  return fmt(getMessages().admin.dateTime, { date: LONG_DAY.format(new Date(iso)), time: formatTime(iso) });
}

/** "24 oct. 2026" */
export function formatLongDay(iso: string): string {
  return LONG_DAY.format(new Date(iso));
}

export const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  paid: "success",
  pending: "accent",
  failed: "warning",
  refunded: "neutral",
  expired: "neutral",
};

export const TOURNAMENT_TONES: Record<TournamentStatus, Tone> = {
  draft: "neutral",
  published: "accent",
  registration_closed: "accent",
  check_in: "accent",
  live: "live",
  finished: "neutral",
  archived: "neutral",
};
