import type { Metadata } from "next";
import { Suspense } from "react";
import { SPORTS, enabledSports, getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section, Skeleton } from "@/components/ui/Section";
import { Disclosure } from "@/components/admin/fields";
import { centsToEurosInput } from "@/components/admin/forms";
import { EMPTY_PLAN, PlanForm, type PlanFormValues } from "@/components/admin/PlanForm";
import { PlanSimulator } from "@/components/admin/PlanSimulator";
import { formatEuros } from "@/lib/format";
import { listPlans, requireAdmin, type AdminPlan } from "@/lib/data/admin";

const t = getMessages().admin.plans;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense,
// which the dev-time instant validation would report as an error.
export const instant = false;
export const metadata: Metadata = { title: t.title };

function formValues(p: AdminPlan): PlanFormValues {
  return {
    id: p.id,
    code: p.code,
    label: p.label,
    description: p.description ?? "",
    price: centsToEurosInput(p.price_cents),
    sport: p.sport_slug ?? "",
    maxTeams: p.max_teams === null ? "" : String(p.max_teams),
    active: p.active,
    sortOrder: String(p.sort_order),
  };
}

/** Sports offered in the plan form: the open ones, plus any sport a plan already targets. */
function sportOptions(plans: AdminPlan[]) {
  const used = new Set(plans.map((p) => p.sport_slug));
  return SPORTS.filter((s) => s.enabled || used.has(s.slug)).map((s) => ({ slug: s.slug, name: s.name }));
}

async function Plans() {
  await requireAdmin();
  const plans = await listPlans();
  const sports = sportOptions(plans);
  const simulatorSports = enabledSports().map((s) => ({ slug: s.slug, name: s.name, defaultTeams: s.defaults.maxTeams }));

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <p>{t.intro}</p>
        <p className="text-ink-soft">{t.rule}</p>
        <PlanSimulator plans={plans} sports={simulatorSports} />
      </div>

      <Section title={t.list} id="admin-plans">
        {plans.length === 0 ? (
          <p className="text-ink-soft">{getMessages().admin.empty}</p>
        ) : (
          <ul className="grid gap-3">
            {plans.map((p) => {
              const sport = p.sport_slug ? getSport(p.sport_slug) : null;
              return (
                <li key={p.id}>
                  <Card className="grid gap-2" data-sport={sport?.accentToken}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid min-w-0">
                        <span className="font-bold">{p.label}</span>
                        <span className="text-sm text-ink-soft">{p.code}</span>
                      </div>
                      <span className="display text-4xl tabular">{formatEuros(p.price_cents)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={p.active ? "success" : "neutral"}>{p.active ? t.active : t.inactive}</Badge>
                      <Badge tone={sport ? "accent" : "neutral"}>
                        {sport && <Icon name={sport.icon} size={14} />}
                        {sport?.name ?? p.sport_slug ?? t.allSports}
                      </Badge>
                      <span className="text-ink-soft">
                        {p.max_teams === null ? t.noLimit : fmt(t.upTo, { count: p.max_teams })} · {fmt(t.order, { order: p.sort_order })}
                      </span>
                    </div>
                    {p.description && <p className="text-sm text-ink-soft">{p.description}</p>}
                    <Disclosure summary={getMessages().admin.edit}>
                      <PlanForm values={formValues(p)} sports={sports} />
                    </Disclosure>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.create} id="admin-plan-new">
        <Card>
          <PlanForm values={EMPTY_PLAN} sports={sports} />
        </Card>
      </Section>
    </div>
  );
}

export default function AdminPlansPage() {
  return (
    <div className="grid gap-4">
      <h2 className="display text-3xl">{t.title}</h2>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Plans />
      </Suspense>
    </div>
  );
}
