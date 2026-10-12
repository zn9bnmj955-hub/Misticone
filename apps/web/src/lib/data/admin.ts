import "server-only";
import { notFound } from "next/navigation";
import type { Enums, Tables } from "@orgasport/db";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/viewer";
import { isoToParis, parisToIso } from "@/lib/tournament-form/time";
import { promoState } from "@/components/admin/forms";

/**
 * Data of the platform administration. Everything goes through the user's
 * client: RLS already lets platform admins read every tournament, payment,
 * plan and promo code (is_platform_admin / is_club_member), so no service
 * role is needed. The admin check below is repeated in every page and action
 * anyway: these pages must not even render for anyone else.
 */

/** The current viewer if they are a platform admin; otherwise a 404 (the area does not exist for them). */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  return viewer;
}

export type TournamentStatus = Enums<"tournament_status">;
export type PaymentStatus = Enums<"payment_status">;

export const TOURNAMENT_STATUSES = [
  "draft",
  "published",
  "registration_closed",
  "check_in",
  "live",
  "finished",
  "archived",
] as const satisfies readonly TournamentStatus[];
export const PAYMENT_STATUSES = ["paid", "pending", "failed", "refunded", "expired"] as const satisfies readonly PaymentStatus[];

/** Published but not started yet. */
const UPCOMING: TournamentStatus[] = ["published", "registration_closed", "check_in"];

/** Values of the tournaments filter: one status, or "upcoming" (the three statuses above). */
export const TOURNAMENT_FILTERS = ["upcoming", ...TOURNAMENT_STATUSES] as const;
export type TournamentFilter = (typeof TOURNAMENT_FILTERS)[number];

/** How many rows the lists show (newest first). */
export const LIST_LIMIT = 200;

/** A `?statut=` value, kept only if it is one of the allowed values. */
export function pickStatus<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** First instant of the current month, Paris time. */
function parisMonthStart(nowMs: number): string {
  const today = isoToParis(new Date(nowMs).toISOString()).date;
  return parisToIso(`${today.slice(0, 7)}-01`, "00:00");
}

export type AdminOverview = {
  tournaments: { upcoming: number; live: number; finished: number; drafts: number };
  payments: { paidThisMonth: number; totalCentsThisMonth: number; testThisMonth: number; pending: number };
  activePromos: number;
};

export async function getAdminOverview(nowMs: number): Promise<AdminOverview> {
  await requireAdmin();
  const supabase = await createClient();
  const countTournaments = (statuses: TournamentStatus[]) =>
    supabase.from("tournaments").select("id", { count: "exact", head: true }).in("status", statuses);

  const [upcoming, live, finished, drafts, paid, pending, promos] = await Promise.all([
    countTournaments(UPCOMING),
    countTournaments(["live"]),
    countTournaments(["finished"]),
    countTournaments(["draft"]),
    supabase.from("payments").select("amount_cents, provider").eq("status", "paid").gte("paid_at", parisMonthStart(nowMs)),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("promo_codes").select("id, code, percent_off, amount_off_cents, max_redemptions, redemptions, valid_until, active"),
  ]);
  for (const res of [upcoming, live, finished, drafts, paid, pending, promos]) if (res.error) throw res.error;

  const paidRows = paid.data ?? [];
  return {
    tournaments: { upcoming: upcoming.count ?? 0, live: live.count ?? 0, finished: finished.count ?? 0, drafts: drafts.count ?? 0 },
    payments: {
      paidThisMonth: paidRows.length,
      totalCentsThisMonth: paidRows.reduce((sum, p) => sum + p.amount_cents, 0),
      testThisMonth: paidRows.filter((p) => p.provider !== "stripe").length,
      pending: pending.count ?? 0,
    },
    activePromos: (promos.data ?? []).filter((p) => promoState(p, nowMs) === "active").length,
  };
}

export type AdminPlan = Tables<"pricing_plans">;

/** Every plan, active or not, in the order the picker uses for ties. */
export async function listPlans(): Promise<AdminPlan[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("pricing_plans").select("*").order("sort_order").order("price_cents");
  if (error) throw error;
  return data ?? [];
}

export type AdminPromo = Tables<"promo_codes">;

export async function listPromoCodes(): Promise<AdminPromo[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

const PAYMENT_COLUMNS =
  "id, status, provider, amount_cents, discount_cents, currency, promo_code, receipt_url, invoice_url, created_at, paid_at, clubs (name), tournaments (name, short_code, status), pricing_plans (label), promo_codes (code)";

export async function listPayments(status: PaymentStatus | null) {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase.from("payments").select(PAYMENT_COLUMNS).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export type AdminPayment = Awaited<ReturnType<typeof listPayments>>[number];

export async function listAdminTournaments(filter: TournamentFilter | null) {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("tournaments")
    .select("id, name, short_code, status, sport_slug, starts_at, created_at, clubs (name), payments (status, provider, created_at)")
    .order("starts_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (filter === "upcoming") query = query.in("status", UPCOMING);
  else if (filter) query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(({ payments, ...t }) => ({ ...t, payment: mainPayment(payments) }));
}
export type AdminTournament = Awaited<ReturnType<typeof listAdminTournaments>>[number];

/** The payment that tells the story: the paid one if any, otherwise the latest attempt. */
function mainPayment<P extends { status: PaymentStatus; created_at: string }>(payments: P[]): P | null {
  const sorted = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((p) => p.status === "paid") ?? sorted[0] ?? null;
}
