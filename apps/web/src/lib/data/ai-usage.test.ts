import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/data/admin", () => ({ requireAdmin: async () => ({}) }));

const { addDays, between, budgetGauge, dailySeries, formatMicroEur, monthStart, topUsers, totals, utcDay } = await import("./ai-usage");
type Row = import("./ai-usage").UsageRow;

const row = (day: string, who: { user?: string; device?: string }, q: number, cost = 0, input = 100 * q, output = 20 * q): Row => ({
  day,
  user_id: who.user ?? null,
  device_hash: who.device ?? null,
  questions: q,
  input_tokens: input,
  output_tokens: output,
  cost_micro_eur: cost,
});

const ROWS: Row[] = [
  row("2026-10-13", { user: "u1" }, 3, 900),
  row("2026-10-13", { device: "d1" }, 2, 400),
  row("2026-10-13", { device: "d2" }, 1, 100),
  row("2026-10-12", { user: "u1" }, 5, 1500),
  row("2026-10-12", { user: "u2" }, 1, 300),
  row("2026-10-01", { device: "d1" }, 4, 800),
  row("2026-09-30", { user: "u3" }, 9, 2700),
];

/** Intl puts (narrow) no-break spaces in French amounts. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("days", () => {
  it("works in UTC calendar days", () => {
    expect(utcDay(Date.parse("2026-10-13T23:30:00Z"))).toBe("2026-10-13");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // across the DST change
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(monthStart("2026-10-13")).toBe("2026-10-01");
  });
});

describe("totals", () => {
  it("sums counters and counts distinct accounts and devices", () => {
    expect(totals(between(ROWS, "2026-10-13", "2026-10-13"))).toEqual({
      questions: 6,
      inputTokens: 600,
      outputTokens: 120,
      costMicroEur: 1400,
      accounts: 1,
      devices: 2,
    });
    const month = totals(between(ROWS, "2026-10-01", "2026-10-13"));
    expect(month).toMatchObject({ questions: 16, costMicroEur: 4000, accounts: 2, devices: 2 });
  });

  it("is zero for no rows and tolerates bigint strings", () => {
    expect(totals([])).toEqual({ questions: 0, inputTokens: 0, outputTokens: 0, costMicroEur: 0, accounts: 0, devices: 0 });
    const asStrings = { ...ROWS[0]!, input_tokens: "250" as unknown as number, cost_micro_eur: "12" as unknown as number };
    expect(totals([asStrings])).toMatchObject({ inputTokens: 250, costMicroEur: 12 });
  });
});

describe("dailySeries", () => {
  it("gives one line per day, newest first, zero-filled, ignoring older rows", () => {
    const days = dailySeries(ROWS, "2026-10-13", 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ day: "2026-10-13", questions: 6, inputTokens: 600, outputTokens: 120, costMicroEur: 1400 });
    expect(days[1]).toMatchObject({ day: "2026-10-12", questions: 6, costMicroEur: 1800 });
    expect(days[2]).toMatchObject({ day: "2026-10-11", questions: 0, costMicroEur: 0 });
    expect(days[29]!.day).toBe("2026-09-14");
    expect(days.find((d) => d.day === "2026-09-30")!.questions).toBe(9);
    expect(dailySeries(ROWS, "2026-10-13", 3).reduce((s, d) => s + d.questions, 0)).toBe(12);
  });
});

describe("topUsers", () => {
  it("groups accounts and guest devices and ranks them by questions, then cost", () => {
    const top = topUsers(between(ROWS, "2026-10-01", "2026-10-13"));
    expect(top.map((u) => [u.key, u.questions])).toEqual([
      ["u1", 8],
      ["device:d1", 6],
      ["u2", 1],
      ["device:d2", 1],
    ]);
    expect(top[0]).toMatchObject({ userId: "u1", costMicroEur: 2400 });
    expect(top[1]!.userId).toBeNull();
    expect(topUsers(ROWS, 2)).toHaveLength(2);
  });

  it("orders ties by cost", () => {
    const top = topUsers([row("2026-10-13", { user: "a" }, 2, 10), row("2026-10-13", { user: "b" }, 2, 50)]);
    expect(top.map((u) => u.key)).toEqual(["b", "a"]);
  });
});

describe("budgetGauge", () => {
  it("fills the bar and warns from 80 %", () => {
    expect(budgetGauge(5_000_000, 20)).toEqual({ spentMicroEur: 5_000_000, capMicroEur: 20_000_000, ratio: 0.25, percent: 25, state: "ok" });
    expect(budgetGauge(16_000_000, 20).state).toBe("warning");
    expect(budgetGauge(25_000_000, 20)).toMatchObject({ ratio: 1, percent: 125, state: "over" });
    expect(budgetGauge(0, 20)).toMatchObject({ ratio: 0, percent: 0, state: "ok" });
  });

  it("treats a zero budget as reached", () => {
    expect(budgetGauge(0, 0)).toMatchObject({ capMicroEur: 0, ratio: 1, state: "over" });
  });
});

describe("formatMicroEur", () => {
  it("keeps small amounts readable", () => {
    expect(plain(formatMicroEur(0))).toBe("0 €");
    expect(plain(formatMicroEur(1234))).toBe("0,0012 €");
    expect(plain(formatMicroEur(250_000))).toBe("0,25 €");
    expect(plain(formatMicroEur(12_345_678))).toBe("12,35 €");
    expect(plain(formatMicroEur(1_500_000_000))).toBe("1 500,00 €");
  });
});
