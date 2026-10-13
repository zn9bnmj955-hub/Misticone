"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { formatEuros } from "@/lib/format";
import { isoToParis, venueLabelsOf, type FormIssue, type Step, type TournamentForm } from "@/lib/tournament-form";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/components/ui/cn";
import { checkDraft, payDraft, previewPrice, type PricePreview } from "@/app/(app)/club/concours/actions";
import { categoryLabel, formatLabel, hm, longDate } from "../display";
import { issueMessage, orderedIssues, stepOfIssue } from "../issues";
import { safePlan } from "../plan";
import { fid, type StepProps } from "./types";

type Row = { label: string; value: ReactNode };

function Section({ title, step, rows, onEdit }: { title: string; step: Step; rows: Row[]; onEdit: (s: Step) => void }) {
  const w = getMessages().wizard;
  return (
    <section aria-labelledby={`sum-${step}`} className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`sum-${step}`} className="text-xl font-black">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => onEdit(step)}
          aria-label={`${w.summary.edit} : ${title}`}
          className="min-h-12 shrink-0 rounded-full px-4 text-sm font-bold text-accent-ink hover:bg-surface-2"
        >
          {w.summary.edit}
        </button>
      </div>
      <dl className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-4">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-0.5 sm:contents">
            <dt className="text-sm text-ink-soft">{r.label}</dt>
            <dd className="min-w-0 break-words font-bold">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 8. Everything at a glance, what is left to fix, the price, and « Payer et publier ». */
export function SummaryStep({
  tournamentId,
  form,
  sport,
  update,
  error,
  vars,
  goTo,
  issues,
  flush,
  cancelled,
}: StepProps & { issues: FormIssue[]; flush: () => Promise<boolean>; cancelled: boolean }) {
  const w = getMessages().wizard;
  const s = w.summary;
  // Server issues hold for the form they were computed for: any edit on this
  // screen (the name, typically) makes them stale, the client check takes over.
  const [server, setServer] = useState<{ form: TournamentForm; issues: FormIssue[] } | null>(null);
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const [checked, setChecked] = useState(false);
  const [price, setPrice] = useState<PricePreview | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, startPay] = useTransition();

  // The server checks and prices the saved draft: save first.
  // Only the latest price request may update the screen: the first quote
  // (after saving and checking the draft) must not overwrite a promo code
  // applied in the meantime.
  const priceSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    const checkedForm = formRef.current;
    const mySeq = ++priceSeq.current;
    flush()
      .then(() => checkDraft(tournamentId))
      .then((res) => {
        if (alive && res.ok) setServer({ form: checkedForm, issues: res.issues });
        if (alive) setChecked(true);
        return previewPrice(tournamentId, null);
      })
      .then((res) => {
        if (!alive || mySeq !== priceSeq.current) return;
        if (res.ok) setPrice(res.price);
        else setPriceError(w.price.errors[res.error] ?? getMessages().common.error);
      })
      .catch(() => alive && setPriceError(getMessages().common.error));
    return () => {
      alive = false;
    };
  }, [tournamentId, flush, w]);

  async function applyPromo(code: string | null) {
    setPromoBusy(true);
    setPromoError(null);
    const mySeq = ++priceSeq.current;
    try {
      const res = await previewPrice(tournamentId, code);
      if (mySeq !== priceSeq.current) return;
      if (!res.ok) {
        setPriceError(w.price.errors[res.error] ?? getMessages().common.error);
        return;
      }
      setPrice(res.price);
      if (res.price.promoError) {
        setPromoError(w.price.promoErrors[res.price.promoError] ?? w.price.errors.promo_invalid!);
        setPromo(null);
      } else {
        setPromo(res.price.promoCode);
        if (!code) setPromoInput("");
      }
    } catch {
      setPromoError(getMessages().common.error);
    } finally {
      setPromoBusy(false);
    }
  }

  // Client and server run the same validation; the server's word wins when they differ.
  const serverIssues = server && server.form === form ? server.issues : [];
  const shown = orderedIssues(issues.length > 0 ? issues : serverIssues);
  const blocked = shown.length > 0;

  function pay() {
    setPayError(null);
    startPay(async () => {
      const sentForm = formRef.current;
      const saved = await flush();
      if (!saved) {
        setPayError(w.price.errors.save!);
        return;
      }
      const res = await payDraft(tournamentId, promo);
      // On success the action redirects (payment page or confirmation).
      if (res && !res.ok) {
        setPayError(w.price.errors[res.error] ?? getMessages().common.error);
        if (res.issues) setServer({ form: sentForm, issues: res.issues });
        if (res.error === "promo_invalid") setPromo(null);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Section contents
  // ---------------------------------------------------------------------
  const none = <span className="font-normal text-ink-soft">{w.none}</span>;
  const yesNo = (v: boolean) => (v ? s.present : s.absent);
  const teamFormat = sport.teamFormats.find((f) => f.id === form.teamFormat);
  const plan = safePlan(form, sport);
  const labels = venueLabelsOf(form);
  const formatExtras: string[] = [];
  if (form.format === "swiss" || form.format === "melee_rotation") formatExtras.push(fmt(s.roundsValue, { count: form.rounds ?? "?" }));
  if (form.format === "single_elimination") formatExtras.push(form.bracketMode === "redraw" ? w.draw.redraw : w.draw.fixed);
  if (form.format === "pools_then_bracket") formatExtras.push(fmt(s.poolsValue, { size: form.poolSize, qualifiers: form.poolQualifiers }));
  if ((form.format === "single_elimination" || form.format === "pools_then_bracket") && form.consolation) formatExtras.push(w.draw.consolation);
  const drawRules = [form.avoidSameClub && w.draw.avoidSameClub, form.seeding && w.draw.seeding].filter(Boolean) as string[];
  const scoring = sport.scoring;
  const gameEnd =
    scoring.mode === "points"
      ? [fmt(w.draw.pointsTarget, { target: scoring.target }), form.timeLimitMinutes != null ? fmt(s.timeLimitValue, { minutes: form.timeLimitMinutes }) : null].filter(Boolean).join(" · ")
      : scoring.mode === "time"
        ? fmt(s.durationValue, { minutes: form.durationMinutes ?? scoring.durationMinutes })
        : fmt(w.draw.setsTarget, { sets: scoring.setsToWin, points: scoring.pointsPerSet });
  const rules = form.rulesText && form.rulesPdfPath ? s.rulesBoth : form.rulesText ? s.rulesTextOnly : form.rulesPdfPath ? s.rulesPdfOnly : null;
  const place = [form.address, [form.postcode, form.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const sections: { step: Step; rows: Row[] }[] = [
    {
      step: "team",
      rows: [
        { label: s.organizer, value: [form.organizer.name, form.organizer.phone, form.organizer.email].filter(Boolean).join(" · ") },
        { label: s.coOrganizers, value: form.coOrganizers.length ? form.coOrganizers.join(", ") : none },
        { label: s.pins, value: form.pinCount },
        { label: s.referee, value: form.referee || none },
      ],
    },
    {
      step: "general",
      rows: [
        { label: s.sport, value: sport.name },
        { label: s.date, value: longDate(form.date) },
        {
          label: s.times,
          value: fmt(s.timesValue, { start: hm(form.startTime), registration: hm(form.registrationClosesTime), checkIn: hm(form.checkInClosesTime) }),
        },
        { label: s.place, value: <>{place || none}{form.lat != null && <span className="font-normal text-ink-soft"> · {s.mapPlaced}</span>}</> },
        ...(form.parking ? [{ label: s.parking, value: form.parking }] : []),
        ...(form.food ? [{ label: s.food, value: form.food }] : []),
        { label: s.poster, value: form.posterPath ? s.present : none },
        { label: s.rules, value: rules ?? none },
      ],
    },
    {
      step: "participants",
      rows: [
        {
          label: s.teamFormat,
          value: [teamFormat?.label ?? form.teamFormat, form.substitutes > 0 ? fmt(s.substitutes, { count: form.substitutes }) : null].filter(Boolean).join(", "),
        },
        { label: s.category, value: categoryLabel(form.category) },
        { label: s.eligibility, value: w.eligibility[form.eligibility] },
        {
          label: s.maxTeams,
          value: [fmt(s.maxTeamsValue, { count: form.maxTeams, teams: sport.teamNoun.plural }), form.waitlist ? s.withWaitlist : null].filter(Boolean).join(" · "),
        },
        { label: s.registrations, value: w.registrationModes[form.registrationMode] },
        { label: s.names, value: w.nameDisplays[form.nameDisplay] },
      ],
    },
    {
      step: "money",
      rows: [
        {
          label: s.fee,
          value: form.feeCents > 0 ? fmt(s.feeValue, { amount: formatEuros(form.feeCents), per: form.feePer === "team" ? w.money.perTeam : w.money.perPlayer }) : s.free,
        },
        ...(form.prizeText ? [{ label: s.prize, value: form.prizeText }] : []),
      ],
    },
    {
      step: "draw",
      rows: [
        { label: s.format, value: [formatLabel(form.format), ...formatExtras].join(" · ") },
        { label: s.drawRules, value: drawRules.length ? drawRules.join(" · ") : s.random },
        { label: s.gameEnd, value: gameEnd },
        { label: s.scoreEntry, value: form.scoreEntry === "captains" ? w.draw.scoreEntryCaptains : w.draw.scoreEntryTable },
        { label: s.autoDraw, value: yesNo(form.autoDraw) },
        { label: s.ranking, value: form.ranking.map((c) => w.criteria[c] ?? c).join(" › ") },
      ],
    },
    {
      step: "venues",
      rows: [
        { label: s.venuesCount, value: form.venueCount },
        { label: s.venueNames, value: form.venueLabels.length ? labels.join(", ") : fmt(s.numbered, { count: form.venueCount }) },
        { label: s.reserved, value: form.reservedLabels.length ? form.reservedLabels.join(", ") : none },
        ...(plan
          ? [{ label: s.estimate, value: fmt(s.estimateValue, { needed: plan.firstRoundVenuesNeeded, venues: vars.venues!, time: hm(isoToParis(plan.end).time) }) }]
          : []),
      ],
    },
    {
      step: "communication",
      rows: [
        { label: s.notifications, value: yesNo(form.notifications) },
        { label: s.reminder, value: yesNo(form.reminderDayBefore) },
        { label: s.welcome, value: form.welcomeMessage || none },
      ],
    },
  ];

  const total = price?.totalCents ?? null;
  return (
    <div className="grid gap-6">
      {cancelled && (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius)] border-2 border-warning bg-warning/15 px-4 py-3 font-bold">
          <Icon name="close" size={20} className="mt-0.5 shrink-0 text-warning" />
          {w.cancelled}
        </p>
      )}
      <p className="text-lg text-ink-soft">{s.intro}</p>

      <TextField
        id={fid("name")}
        label={w.general.name}
        placeholder={w.general.namePlaceholder}
        maxLength={140}
        value={form.name}
        error={error("name")}
        onChange={(e) => update({ name: e.target.value })}
        className="[&_input]:min-h-14 [&_input]:text-lg [&_input]:font-bold"
      />

      {blocked ? (
        <section aria-labelledby="sum-issues" className="grid gap-3 rounded-[var(--radius-lg)] border-2 border-danger bg-surface p-4">
          <h2 id="sum-issues" className="flex items-center gap-2 text-xl font-black text-danger">
            <Icon name="close" size={22} />
            {s.toFix}
          </h2>
          <ul className="grid gap-1">
            {shown.map((i) => {
              const step = stepOfIssue(i);
              return (
                <li key={`${i.path}-${i.code}`}>
                  <button type="button" onClick={() => goTo(step)} className="flex min-h-12 w-full items-center gap-2 rounded-[var(--radius)] px-2 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1">{fmt(s.toFixItem, { step: fmt(w.steps[step] ?? step, vars), message: issueMessage(i, vars) })}</span>
                    <Icon name="arrowRight" size={18} className="shrink-0 text-ink-soft" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        checked && (
          <p role="status" className="flex items-center gap-2 font-bold text-success">
            <Icon name="check" size={20} />
            {s.ready}
          </p>
        )
      )}

      {sections.map((sec) => (
        <Section key={sec.step} step={sec.step} title={fmt(w.steps[sec.step] ?? sec.step, { venues: vars.Venues! })} rows={sec.rows} onEdit={goTo} />
      ))}

      <section aria-labelledby="sum-price" className="grid gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-surface p-4">
        <h2 id="sum-price" className="display text-3xl">
          {w.price.title}
        </h2>
        {priceError ? (
          <p role="alert" className="font-bold text-danger">
            {priceError}
          </p>
        ) : !price ? (
          <p className="text-ink-soft">{w.price.loading}</p>
        ) : (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 tabular">
            <dt className="text-ink-soft">{w.price.plan}</dt>
            <dd className="text-right font-bold">{price.planLabel}</dd>
            {price.planDescription && <dd className="col-span-2 text-sm text-ink-soft">{price.planDescription}</dd>}
            <dt className="text-ink-soft">{w.price.base}</dt>
            <dd className="text-right font-bold">{formatEuros(price.baseCents)}</dd>
            {price.discountCents > 0 && (
              <>
                <dt className="text-ink-soft">{fmt(w.price.discount, { code: price.promoCode ?? "" })}</dt>
                <dd className="text-right font-bold text-success">−{formatEuros(price.discountCents)}</dd>
              </>
            )}
            <dt className="mt-2 border-t border-line pt-2 text-lg font-black">{w.price.total}</dt>
            <dd className="display mt-2 border-t border-line pt-2 text-right text-4xl">{formatEuros(price.totalCents)}</dd>
          </dl>
        )}

        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (promoInput.trim()) void applyPromo(promoInput);
          }}
        >
          <label htmlFor="tf-promo" className="text-sm font-bold">
            {w.price.promo}
          </label>
          <div className="flex gap-2">
            <input
              id="tf-promo"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              placeholder={w.price.promoPlaceholder}
              value={promoInput}
              aria-invalid={promoError ? true : undefined}
              aria-describedby="tf-promo-desc"
              onChange={(e) => {
                setPromoInput(e.target.value);
                setPromoError(null);
              }}
              className="min-h-12 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-line bg-surface px-4 text-base uppercase text-ink placeholder:normal-case placeholder:text-ink-soft/70 focus:border-accent aria-[invalid]:border-danger"
            />
            <Button type="submit" variant="outline" disabled={promoBusy || !promoInput.trim()}>
              {w.price.promoApply}
            </Button>
          </div>
          <p id="tf-promo-desc" role={promoError ? "alert" : undefined} className={cn("text-sm", promoError ? "font-bold text-danger" : "text-success")}>
            {promoError ?? (promo ? fmt(w.price.promoApplied, { code: promo }) : "")}
          </p>
          {promo && (
            <button type="button" onClick={() => void applyPromo(null)} className="min-h-12 justify-self-start text-sm font-bold text-ink-soft underline hover:text-ink">
              {w.price.promoRemove}
            </button>
          )}
        </form>

        {payError && (
          <p role="alert" className="rounded-[var(--radius)] border-2 border-danger px-4 py-3 font-bold text-danger">
            {payError}
          </p>
        )}
        <Button size="lg" className="w-full" disabled={blocked || !price || paying || promoBusy} onClick={pay}>
          {paying ? w.price.paying : total === 0 ? w.price.publishFree : fmt(w.price.pay, { amount: total != null ? formatEuros(total) : "" })}
          {!paying && <Icon name="arrowRight" />}
        </Button>
        {blocked && <p className="text-sm font-bold text-danger">{w.price.fixFirst}</p>}
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <Icon name="check" size={18} className="mt-0.5 shrink-0" />
          {w.price.smallPrint}
        </p>
      </section>
    </div>
  );
}

