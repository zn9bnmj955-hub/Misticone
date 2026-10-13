import { fmt, getMessages } from "@/i18n";
import { Card } from "@/components/ui/Card";
import { Note } from "@/components/ui/Section";
import { cn } from "@/components/ui/cn";
import { USAGE_MAX_ROWS, budgetGauge, formatMicroEur, totals, type AiUsageReport, type UsageTotals } from "@/lib/data/ai-usage";
import { formatCount, formatDay } from "@/lib/format";

const t = getMessages().adminAssistant.usage;

/** One period (today / this month): big question count, then the details. */
function PeriodCard({ title, v }: { title: string; v: UsageTotals }) {
  const rows: [string, string][] = [
    [t.cost, formatMicroEur(v.costMicroEur)],
    [t.inputTokens, formatCount(v.inputTokens)],
    [t.outputTokens, formatCount(v.outputTokens)],
    [t.accounts, formatCount(v.accounts)],
    [t.devices, formatCount(v.devices)],
  ];
  return (
    <Card className="grid content-start gap-3">
      <h3 className="font-bold">{title}</h3>
      <p className="grid">
        <span className="display text-5xl tabular">{formatCount(v.questions)}</span>
        <span className="text-sm text-ink-soft">{t.questions}</span>
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="text-right font-bold tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function BudgetMeter({ spentMicroEur, budgetEur }: { spentMicroEur: number; budgetEur: number }) {
  const g = budgetGauge(spentMicroEur, budgetEur);
  const text = fmt(t.budgetText, { spent: formatMicroEur(g.spentMicroEur), cap: formatMicroEur(g.capMicroEur), percent: g.percent });
  return (
    <Card className="grid gap-2">
      <h3 className="font-bold">{t.budget}</h3>
      <span
        className="block h-3 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={t.budget}
        aria-valuemin={0}
        aria-valuemax={g.capMicroEur}
        aria-valuenow={Math.min(g.spentMicroEur, g.capMicroEur)}
        aria-valuetext={text}
      >
        <span
          className={cn("block h-full rounded-full", g.state === "over" ? "bg-danger" : g.state === "warning" ? "bg-warning" : "bg-accent")}
          style={{ width: `${Math.round(g.ratio * 100)}%` }}
        />
      </span>
      <p className="text-sm font-bold tabular">{text}</p>
      {g.state !== "ok" && <p className={cn("text-sm", g.state === "over" ? "text-danger" : "text-warning")}>{g.state === "over" ? t.budgetOver : t.budgetWarning}</p>}
    </Card>
  );
}

/** Today, this month, the budget gauge, the last 30 days and who asks the most. */
export function UsagePanel({ report, budgetEur }: { report: AiUsageReport; budgetEur: number }) {
  const active = report.days.filter((d) => d.questions > 0);
  const sum = totals([]);
  for (const d of active) {
    sum.questions += d.questions;
    sum.inputTokens += d.inputTokens;
    sum.outputTokens += d.outputTokens;
    sum.costMicroEur += d.costMicroEur;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <PeriodCard title={t.today} v={report.today} />
        <PeriodCard title={t.month} v={report.month} />
      </div>
      <BudgetMeter spentMicroEur={report.month.costMicroEur} budgetEur={budgetEur} />

      <Card className="grid gap-3">
        <h3 className="font-bold">{t.daysTitle}</h3>
        {active.length === 0 ? (
          <p className="text-sm text-ink-soft">{t.noDays}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th scope="col" className="py-2 pr-3 font-bold">
                    {t.day}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    {t.questions}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    {t.tokens}
                  </th>
                  <th scope="col" className="py-2 text-right font-bold">
                    {t.cost}
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.day} className="border-b border-line/60">
                    <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                      {formatDay(`${d.day}T12:00:00Z`)}
                    </th>
                    <td className="py-2 pr-3 text-right">{formatCount(d.questions)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {formatCount(d.inputTokens)} / {formatCount(d.outputTokens)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">{formatMicroEur(d.costMicroEur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <th scope="row" className="py-2 pr-3 text-left">
                    {t.total}
                  </th>
                  <td className="py-2 pr-3 text-right">{formatCount(sum.questions)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {formatCount(sum.inputTokens)} / {formatCount(sum.outputTokens)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{formatMicroEur(sum.costMicroEur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="grid gap-3">
        <h3 className="font-bold">{t.topTitle}</h3>
        {report.top.length === 0 ? (
          <p className="text-sm text-ink-soft">{t.noTop}</p>
        ) : (
          <ol className="grid gap-2">
            {report.top.map((u) => {
              const cost = formatMicroEur(u.costMicroEur);
              const name = u.userId ? (u.name ?? t.unnamed) : fmt(t.guestDevice, { id: u.key.slice("device:".length, "device:".length + 6) });
              return (
                <li key={u.key} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line/60 pb-2 text-sm">
                  <span className={cn("font-bold", !u.userId && "text-ink-soft")}>{name}</span>
                  <span className="tabular">{u.questions === 1 ? fmt(t.topLineOne, { cost }) : fmt(t.topLine, { count: formatCount(u.questions), cost })}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <p className="text-xs text-ink-soft">{t.utcNote}</p>
      {report.truncated && <Note>{fmt(t.truncated, { count: formatCount(USAGE_MAX_ROWS) })}</Note>}
    </div>
  );
}
