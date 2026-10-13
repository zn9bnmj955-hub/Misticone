import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";

/**
 * Assistant usage and costs for the admin dashboard. The counters
 * (`ai_usage`, one row per day and per account or device) are written by
 * `ai_usage_add` with the database date, which is UTC — the same day the
 * quotas use — so "today" and "this month" are UTC days here too.
 * Aggregation is done here (pure helpers below, unit-tested) rather than in
 * SQL: the admin reads at most a few thousand rows.
 */

export type UsageRow = {
  day: string;
  user_id: string | null;
  device_hash: string | null;
  questions: number;
  input_tokens: number;
  output_tokens: number;
  cost_micro_eur: number;
};

export type UsageTotals = {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  costMicroEur: number;
  /** Distinct signed-in accounts. */
  accounts: number;
  /** Distinct guest devices. */
  devices: number;
};

export type DayUsage = Omit<UsageTotals, "accounts" | "devices"> & { day: string };

export type TopUser = {
  /** user id, or "device:<hash>" for a guest device. */
  key: string;
  userId: string | null;
  questions: number;
  costMicroEur: number;
};

export type BudgetGauge = {
  spentMicroEur: number;
  capMicroEur: number;
  /** Bar fill, 0 to 1. */
  ratio: number;
  /** Rounded percentage, may exceed 100. */
  percent: number;
  state: "ok" | "warning" | "over";
};

/** UTC calendar day "YYYY-MM-DD". */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `day` moved by `n` days (UTC, so no daylight-saving surprise). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export function totals(rows: UsageRow[]): UsageTotals {
  const accounts = new Set<string>();
  const devices = new Set<string>();
  let questions = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costMicroEur = 0;
  for (const r of rows) {
    questions += n(r.questions);
    inputTokens += n(r.input_tokens);
    outputTokens += n(r.output_tokens);
    costMicroEur += n(r.cost_micro_eur);
    if (r.user_id) accounts.add(r.user_id);
    else if (r.device_hash) devices.add(r.device_hash);
  }
  return { questions, inputTokens, outputTokens, costMicroEur, accounts: accounts.size, devices: devices.size };
}

/** Rows of one period: `from` to `to`, both included. */
export function between(rows: UsageRow[], from: string, to: string): UsageRow[] {
  return rows.filter((r) => r.day >= from && r.day <= to);
}

/** One line per day for the `days` days ending `today`, newest first; days without questions count zero. */
export function dailySeries(rows: UsageRow[], today: string, days = 30): DayUsage[] {
  const byDay = new Map<string, DayUsage>();
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    byDay.set(day, { day, questions: 0, inputTokens: 0, outputTokens: 0, costMicroEur: 0 });
  }
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.questions += n(r.questions);
    d.inputTokens += n(r.input_tokens);
    d.outputTokens += n(r.output_tokens);
    d.costMicroEur += n(r.cost_micro_eur);
  }
  return [...byDay.values()];
}

/** Who asks the most: accounts and guest devices, by questions then cost. */
export function topUsers(rows: UsageRow[], limit = 10): TopUser[] {
  const byKey = new Map<string, TopUser>();
  for (const r of rows) {
    const key = r.user_id ?? (r.device_hash ? `device:${r.device_hash}` : null);
    if (!key) continue;
    const u = byKey.get(key) ?? { key, userId: r.user_id, questions: 0, costMicroEur: 0 };
    u.questions += n(r.questions);
    u.costMicroEur += n(r.cost_micro_eur);
    byKey.set(key, u);
  }
  return [...byKey.values()]
    .filter((u) => u.questions > 0)
    .sort((a, b) => b.questions - a.questions || b.costMicroEur - a.costMicroEur || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** Spending of the month against the cap; "warning" from 80 %. */
export function budgetGauge(spentMicroEur: number, budgetEur: number): BudgetGauge {
  const capMicroEur = Math.max(0, Math.round(budgetEur * 1_000_000));
  if (capMicroEur === 0) {
    const over = spentMicroEur > 0;
    return { spentMicroEur, capMicroEur, ratio: 1, percent: over ? 100 : 0, state: "over" };
  }
  const raw = spentMicroEur / capMicroEur;
  return {
    spentMicroEur,
    capMicroEur,
    ratio: Math.min(1, Math.max(0, raw)),
    percent: Math.round(raw * 100),
    state: raw >= 1 ? "over" : raw >= 0.8 ? "warning" : "ok",
  };
}

/**
 * Euros from micro-euros. A question costs a fraction of a cent, so small
 * amounts keep four decimals ("0,0012 €") instead of rounding to "0,00 €".
 */
export function formatMicroEur(micro: number): string {
  const euros = micro / 1_000_000;
  const small = micro !== 0 && Math.abs(euros) < 1;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: micro === 0 ? 0 : 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(euros);
}

export type NamedTopUser = TopUser & { name: string | null };

export type AiUsageReport = {
  today: UsageTotals;
  month: UsageTotals;
  /** Last 30 days, newest first. */
  days: DayUsage[];
  /** This month. */
  top: NamedTopUser[];
  todayDay: string;
  monthStartDay: string;
  /** More rows than the dashboard reads: totals are a lower bound. */
  truncated: boolean;
};

const COLUMNS = "day, user_id, device_hash, questions, input_tokens, output_tokens, cost_micro_eur";
const PAGE = 1000; // PostgREST max_rows
/** Safety cap on the rows read (the dashboard says when it is reached). */
export const USAGE_MAX_ROWS = 50_000;

/** Reads the counters of the last 30 days (and of the whole month) as the admin (RLS: admins read every row). */
export async function getAiUsageReport(): Promise<AiUsageReport> {
  await requireAdmin();
  const nowMs = Date.now();
  const supabase = await createClient();
  const todayDay = utcDay(nowMs);
  const monthStartDay = monthStart(todayDay);
  const windowStart = addDays(todayDay, -29);
  const since = monthStartDay < windowStart ? monthStartDay : windowStart;

  const rows: UsageRow[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ai_usage")
      .select(COLUMNS)
      .gte("day", since)
      .order("day", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
    if (rows.length >= USAGE_MAX_ROWS) {
      truncated = true;
      break;
    }
  }

  const monthRows = between(rows, monthStartDay, todayDay);
  const top = topUsers(monthRows, 10);
  const ids = top.flatMap((u) => (u.userId ? [u.userId] : []));
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const p of data ?? []) names.set(p.id, p.display_name);
  }

  return {
    today: totals(between(rows, todayDay, todayDay)),
    month: totals(monthRows),
    days: dailySeries(rows, todayDay, 30),
    top: top.map((u) => ({ ...u, name: u.userId ? (names.get(u.userId) ?? null) : null })),
    todayDay,
    monthStartDay,
    truncated,
  };
}
