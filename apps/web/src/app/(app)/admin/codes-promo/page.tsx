import type { Metadata } from "next";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section, Skeleton } from "@/components/ui/Section";
import { Disclosure } from "@/components/admin/fields";
import { centsToEurosInput, parisDayOf, type PromoState } from "@/components/admin/forms";
import { EMPTY_PROMO, PromoForm, type PromoFormValues } from "@/components/admin/PromoForm";
import { formatLongDay } from "@/components/admin/display";
import { formatCount, formatEuros } from "@/lib/format";
import { listPromoCodes, requireAdmin, type AdminPromo } from "@/lib/data/admin";
import { setPromoActive } from "../actions";

const t = getMessages().admin.promos;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense,
// which the dev-time instant validation would report as an error.
export const instant = false;
export const metadata: Metadata = { title: t.title };

const STATE_TONES: Record<PromoState, "success" | "neutral" | "warning"> = {
  active: "success",
  inactive: "neutral",
  expired: "warning",
  exhausted: "warning",
};

function formValues(p: AdminPromo): PromoFormValues {
  return {
    id: p.id,
    code: p.code,
    description: p.description ?? "",
    kind: p.amount_off_cents !== null ? "amount" : "percent",
    percent: p.percent_off === null ? "" : String(p.percent_off),
    amount: p.amount_off_cents === null ? "" : centsToEurosInput(p.amount_off_cents),
    maxRedemptions: p.max_redemptions === null ? "" : String(p.max_redemptions),
    validUntil: parisDayOf(p.valid_until),
    active: p.active,
  };
}

function discountOf(p: AdminPromo): string {
  return p.percent_off !== null
    ? fmt(t.percentOff, { value: p.percent_off })
    : fmt(t.amountOff, { value: formatEuros(p.amount_off_cents ?? 0) });
}

async function Promos() {
  await requireAdmin();
  const promos = await listPromoCodes();

  return (
    <div className="grid gap-8">
      <p>{t.intro}</p>
      <Section title={t.list} id="admin-promos">
        {promos.length === 0 ? (
          <p className="text-ink-soft">{getMessages().admin.empty}</p>
        ) : (
          <ul className="grid gap-3">
            {promos.map((p) => {
              return (
                <li key={p.id}>
                  <Card className="grid gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid min-w-0">
                        <span className="display text-3xl break-all">{p.code}</span>
                        {p.description && <span className="text-sm text-ink-soft">{p.description}</span>}
                      </div>
                      <span className="display text-4xl tabular">{discountOf(p)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={STATE_TONES[p.state]}>{t.states[p.state]}</Badge>
                      <span className="text-ink-soft tabular">
                        {p.max_redemptions === null
                          ? fmt(t.uses, { count: formatCount(p.redemptions) })
                          : fmt(t.usesOf, { count: formatCount(p.redemptions), max: formatCount(p.max_redemptions) })}
                        {" · "}
                        {p.valid_until ? fmt(t.until, { date: formatLongDay(p.valid_until) }) : t.noEnd}
                      </span>
                    </div>
                    <form action={setPromoActive} className="justify-self-start">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                      <button type="submit" className={buttonClass("outline")}>
                        {p.active ? t.deactivate : t.reactivate}
                      </button>
                    </form>
                    <Disclosure summary={getMessages().admin.edit}>
                      <PromoForm values={formValues(p)} />
                    </Disclosure>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.create} id="admin-promo-new">
        <Card>
          <PromoForm values={EMPTY_PROMO} />
        </Card>
      </Section>
    </div>
  );
}

export default function AdminPromosPage() {
  return (
    <div className="grid gap-4">
      <h2 className="display text-3xl">{t.title}</h2>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Promos />
      </Suspense>
    </div>
  );
}
