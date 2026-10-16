"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { SPORT_COOKIE } from "@/lib/prefs";
import { setDeviceCookie } from "@/lib/cookies-client";
import { AuthForm } from "@/components/auth/AuthForm";
import { Button } from "@/components/ui/Button";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/components/ui/cn";
import {
  completePlayerOnboarding,
  createClubFromOnboarding,
  type ClubOnboarding,
} from "@/app/(auth)/inscription/actions";
import { PlaceField, type PlaceValue } from "./PlaceField";

export type OnboardingKind = "player" | "club" | "guest";
type SportOption = { slug: string; name: string; icon: string; accentToken: string };

type Draft = {
  kind: OnboardingKind;
  step: string;
  sports: string[];
  level: "leisure" | "competition" | null;
  licensed: boolean | null;
  licenseNumber: string;
  place: PlaceValue;
  radiusKm: number;
  feed: { nearby: boolean; results: boolean; news: boolean; clubs: boolean };
  notifications: boolean | null;
  club: {
    name: string;
    kind: ClubOnboarding["kind"];
    sports: string[];
    federation: string;
    affiliationNumber: string;
    address: PlaceValue;
    venues: number;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  };
};

const STORAGE_KEY = "os_onboarding";

const STEPS: Record<OnboardingKind, string[]> = {
  player: ["sports", "level", "license", "city", "feed", "notifications", "account", "done"],
  guest: ["sports", "city", "done"],
  club: ["clubName", "clubKind", "clubSports", "federation", "address", "contact", "account", "logo", "done"],
};

/** A single sport offered (pétanque only): it is chosen for the person and the sport questions are skipped. */
const preset = (offered: string[]) => (offered.length === 1 ? offered : []);

function freshDraft(kind: OnboardingKind, offered: string[]): Draft {
  return {
    kind,
    step: STEPS[kind][0]!,
    sports: preset(offered),
    level: null,
    licensed: null,
    licenseNumber: "",
    place: { text: "" },
    radiusKm: 30,
    feed: { nearby: true, results: true, news: true, clubs: true },
    notifications: null,
    club: {
      name: "",
      kind: "association",
      sports: preset(offered),
      federation: "",
      affiliationNumber: "",
      address: { text: "" },
      venues: 12,
      contactName: "",
      contactPhone: "",
      contactEmail: "",
    },
  };
}

function loadDraft(kind: OnboardingKind, offered: string[]): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Draft | null;
    if (!d || d.kind !== kind) return null;
    // A sport that is no longer offered (football switched off) is dropped from an old draft.
    const keep = (list: string[] | undefined) => {
      const kept = (list ?? []).filter((s) => offered.includes(s));
      return kept.length ? kept : preset(offered);
    };
    const base = freshDraft(kind, offered);
    return { ...base, ...d, sports: keep(d.sports), club: { ...base.club, ...d.club, sports: keep(d.club?.sports) } };
  } catch {
    return null;
  }
}

function saveDraft(d: Draft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    // Private mode: the flow still works, it just won't survive a reload.
  }
}

function setSportCookie(sports: string[], options: SportOption[]) {
  // One sport chosen: the interface takes its accent color right away.
  const only = sports.length === 1 ? options.find((s) => s.slug === sports[0]) : undefined;
  const value = only ? only.slug : "all";
  setDeviceCookie(SPORT_COOKIE, value);
  if (only) document.documentElement.setAttribute("data-sport", only.accentToken);
  else document.documentElement.removeAttribute("data-sport");
}

export function OnboardingFlow({
  kind,
  sports,
  signedIn: initiallySignedIn,
  resume,
}: {
  kind: OnboardingKind;
  sports: SportOption[];
  signedIn: boolean;
  resume: boolean;
}) {
  const m = getMessages();
  const o = m.onboarding;
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(initiallySignedIn);
  const offered = useMemo(() => sports.map((s) => s.slug), [sports]);
  const singleSport = offered.length === 1;
  const [draft, setDraft] = useState<Draft>(() => freshDraft(kind, offered));
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);
  const [saving, setSaving] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [redirect, setRedirect] = useState("/accueil");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Resume after a magic link / Google round trip.
  useEffect(() => {
    const saved = resume ? loadDraft(kind, offered) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore device draft after hydration
    if (saved) setDraft(saved);
  }, [kind, resume, offered]);

  // The sport questions are hidden when a single sport is offered.
  const steps = useMemo(
    () => STEPS[kind].filter((s) => !(signedIn && s === "account") && !(singleSport && (s === "sports" || s === "clubSports"))),
    [kind, signedIn, singleSport],
  );
  const index = Math.max(0, steps.indexOf(draft.step));
  const step = steps[index] ?? steps[0]!;
  const total = steps.length - 1; // "done" is not a question

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  function updateClub(patch: Partial<Draft["club"]>) {
    setDraft((d) => ({ ...d, club: { ...d.club, ...patch } }));
  }
  function goTo(i: number) {
    const target = steps[Math.min(Math.max(i, 0), steps.length - 1)]!;
    setDraft((d) => ({ ...d, step: target }));
  }
  const next = () => goTo(index + 1);
  const back = () => (index === 0 ? router.push("/") : goTo(index - 1));

  // Final save when reaching the last screen.
  useEffect(() => {
    if (step !== "done" || saving !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot save on the last screen
    setSaving("saving");
    (async () => {
      try {
        let result;
        if (kind === "club") {
          const c = draft.club;
          let form: FormData | null = null;
          if (logo) {
            form = new FormData();
            form.set("logo", logo);
          }
          result = await createClubFromOnboarding(
            {
              name: c.name,
              kind: c.kind,
              sports: c.sports,
              federation: c.federation,
              affiliationNumber: c.affiliationNumber,
              address: c.address.text,
              place: { city: c.address.city, postcode: c.address.postcode, lat: c.address.lat, lng: c.address.lng },
              venues: c.venues || null,
              contactName: c.contactName,
              contactPhone: c.contactPhone,
              contactEmail: c.contactEmail,
            },
            form,
          );
          setSportCookie(c.sports, sports);
        } else {
          result = await completePlayerOnboarding({
            sports: draft.sports,
            level: draft.level,
            licensed: draft.licensed,
            licenseNumber: draft.licenseNumber,
            place: { city: draft.place.city ?? (draft.place.text.trim() || undefined), postcode: draft.place.postcode, lat: draft.place.lat, lng: draft.place.lng },
            radiusKm: draft.radiusKm,
            feed: draft.feed,
            notifications: draft.notifications,
          });
          setSportCookie(draft.sports, sports);
        }
        if (!result.ok) throw new Error(result.error);
        setRedirect(result.redirect);
        localStorage.removeItem(STORAGE_KEY);
        setSaving("done");
      } catch {
        setSaving("error");
      }
    })();
  }, [step, saving, kind, draft, logo, sports]);

  // ---------------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------------
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const sportCards = (selected: string[], onChange: (v: string[]) => void) => (
    <div className="grid gap-3" role="group">
      {sports.map((s) => (
        <ChoiceCard key={s.slug} multiple icon={s.icon} title={s.name} selected={selected.includes(s.slug)} onSelect={() => onChange(toggle(selected, s.slug))} />
      ))}
    </div>
  );

  let title = "";
  let text: string | undefined;
  let body: ReactNode = null;
  let canSkip = true;
  let canContinue = true;
  let showContinue = true;

  switch (step) {
    case "sports":
      title = m.sports.pickTitle;
      text = m.sports.pickHint;
      body = sportCards(draft.sports, (v) => update({ sports: v }));
      canContinue = draft.sports.length > 0;
      break;
    case "level":
      title = o.player.level.title;
      body = (
        <div className="grid gap-3" role="radiogroup">
          <ChoiceCard icon="sun" title={o.player.level.leisure} text={o.player.level.leisureText} selected={draft.level === "leisure"} onSelect={() => update({ level: "leisure" })} />
          <ChoiceCard icon="trophy" title={o.player.level.competition} text={o.player.level.competitionText} selected={draft.level === "competition"} onSelect={() => update({ level: "competition" })} />
        </div>
      );
      canContinue = draft.level !== null;
      break;
    case "license":
      title = o.player.license.title;
      body = (
        <div className="grid gap-4">
          <div className="grid gap-3" role="radiogroup">
            <ChoiceCard icon="check" title={o.player.license.yes} selected={draft.licensed === true} onSelect={() => update({ licensed: true })} />
            <ChoiceCard icon="close" title={o.player.license.no} selected={draft.licensed === false} onSelect={() => update({ licensed: false, licenseNumber: "" })} />
          </div>
          {draft.licensed && (
            <TextField
              id="license-number"
              label={`${o.player.license.numberLabel} (${m.common.optional})`}
              hint={o.player.license.numberHint}
              inputMode="numeric"
              autoComplete="off"
              value={draft.licenseNumber}
              onChange={(e) => update({ licenseNumber: e.target.value.replace(/\s/g, "") })}
            />
          )}
        </div>
      );
      canContinue = draft.licensed !== null;
      break;
    case "city":
      title = kind === "guest" ? o.guest.cityTitle : o.player.city.title;
      text = kind === "guest" ? o.guest.cityText : undefined;
      body = (
        <div className="grid gap-6">
          <PlaceField
            id="city"
            kind="city"
            label={o.player.city.label}
            placeholder={o.player.city.placeholder}
            value={draft.place}
            onChange={(place) => update({ place })}
            noResultText={o.player.city.noResult}
            offlineText={o.player.city.offline}
          />
          {kind === "player" && (
            <div className="grid gap-2">
              <label htmlFor="radius" className="flex items-baseline justify-between text-sm font-bold">
                {o.player.city.radius}
                <span className="display text-3xl tabular">{fmt(o.player.city.radiusValue, { km: draft.radiusKm })}</span>
              </label>
              <input
                id="radius"
                type="range"
                min={5}
                max={100}
                step={5}
                value={draft.radiusKm}
                onChange={(e) => update({ radiusKm: Number(e.target.value) })}
                className="h-12 w-full accent-[var(--os-accent)]"
              />
            </div>
          )}
        </div>
      );
      canContinue = draft.place.text.trim().length > 0;
      break;
    case "feed": {
      title = o.player.feed.title;
      const items = [
        { key: "nearby", icon: "mapPin", label: o.player.feed.nearby },
        { key: "results", icon: "trophy", label: o.player.feed.results },
        { key: "news", icon: "sparkle", label: o.player.feed.news },
        { key: "clubs", icon: "club", label: o.player.feed.clubs },
      ] as const;
      body = (
        <div className="grid gap-3" role="group">
          {items.map((i) => (
            <ChoiceCard
              key={i.key}
              multiple
              icon={i.icon}
              title={i.label}
              selected={draft.feed[i.key]}
              onSelect={() => update({ feed: { ...draft.feed, [i.key]: !draft.feed[i.key] } })}
            />
          ))}
        </div>
      );
      break;
    }
    case "notifications":
      title = o.player.notifications.title;
      text = o.player.notifications.text;
      body = (
        <div className="grid gap-4">
          <div className="grid gap-3" role="radiogroup">
            <ChoiceCard icon="bell" title={o.player.notifications.yes} selected={draft.notifications === true} onSelect={() => update({ notifications: true })} />
            <ChoiceCard icon="close" title={o.player.notifications.no} selected={draft.notifications === false} onSelect={() => update({ notifications: false })} />
          </div>
          {draft.notifications && <p className="text-sm text-ink-soft">{o.player.notifications.later}</p>}
        </div>
      );
      canContinue = draft.notifications !== null;
      break;
    case "account":
      title = o.account.title;
      text = kind === "club" ? o.club.accountRequired : o.account.text;
      canSkip = kind !== "club";
      showContinue = false;
      body = (
        <AuthForm
          initialMode="signup"
          next={`/inscription/${kind === "club" ? "club" : "joueur"}?reprendre=1`}
          onSignedIn={() => {
            setSignedIn(true);
            // The step list shrinks once signed in: jump to the step after "account".
            const after = STEPS[kind][STEPS[kind].indexOf("account") + 1]!;
            update({ step: after });
          }}
        />
      );
      break;
    case "clubName":
      title = o.club.name.title;
      canSkip = false;
      body = (
        <TextField id="club-name" label={o.club.name.label} placeholder={o.club.name.placeholder} value={draft.club.name} maxLength={120} onChange={(e) => updateClub({ name: e.target.value })} />
      );
      canContinue = draft.club.name.trim().length >= 2;
      break;
    case "clubKind": {
      title = o.club.kind.title;
      const kinds = [
        ["federated_club", "trophy"],
        ["association", "users"],
        ["festival_committee", "sparkle"],
        ["town_hall", "home"],
        ["company", "club"],
        ["other", "all"],
      ] as const;
      body = (
        <div className="grid gap-3" role="radiogroup">
          {kinds.map(([k, icon]) => (
            <ChoiceCard key={k} icon={icon} title={o.club.kind[k]} selected={draft.club.kind === k} onSelect={() => updateClub({ kind: k })} />
          ))}
        </div>
      );
      break;
    }
    case "clubSports":
      title = o.club.sports.title;
      canSkip = false;
      body = sportCards(draft.club.sports, (v) => updateClub({ sports: v }));
      canContinue = draft.club.sports.length > 0;
      break;
    case "federation":
      title = o.club.federation.title;
      body = (
        <div className="grid gap-4">
          <TextField id="federation" label={`${o.club.federation.federationLabel} (${m.common.optional})`} placeholder={o.club.federation.federationPlaceholder} value={draft.club.federation} onChange={(e) => updateClub({ federation: e.target.value })} />
          <TextField id="affiliation" label={`${o.club.federation.numberLabel} (${m.common.optional})`} value={draft.club.affiliationNumber} onChange={(e) => updateClub({ affiliationNumber: e.target.value })} />
        </div>
      );
      break;
    case "address":
      title = o.club.address.title;
      body = (
        <div className="grid gap-6">
          <PlaceField
            id="club-address"
            kind="address"
            label={o.club.address.label}
            placeholder={o.club.address.placeholder}
            value={draft.club.address}
            onChange={(address) => updateClub({ address })}
            noResultText={o.player.city.noResult}
            offlineText={o.player.city.offline}
          />
          <div className="grid gap-2">
            <span id="venues-label" className="text-sm font-bold">
              {o.club.address.venues}
            </span>
            <div className="flex items-center gap-3" role="group" aria-labelledby="venues-label">
              <Button variant="outline" aria-label="−1" onClick={() => updateClub({ venues: Math.max(1, draft.club.venues - 1) })}>
                −
              </Button>
              <input
                aria-labelledby="venues-label"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={draft.club.venues}
                onChange={(e) => updateClub({ venues: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                className="display h-14 w-24 rounded-[var(--radius)] border-2 border-line bg-surface text-center text-4xl tabular"
              />
              <Button variant="outline" aria-label="+1" onClick={() => updateClub({ venues: Math.min(500, draft.club.venues + 1) })}>
                +
              </Button>
            </div>
          </div>
        </div>
      );
      break;
    case "contact":
      title = o.club.contact.title;
      body = (
        <div className="grid gap-4">
          <TextField id="contact-name" label={o.club.contact.name} autoComplete="name" value={draft.club.contactName} onChange={(e) => updateClub({ contactName: e.target.value })} />
          <TextField id="contact-phone" label={o.club.contact.phone} type="tel" autoComplete="tel" value={draft.club.contactPhone} onChange={(e) => updateClub({ contactPhone: e.target.value })} />
          <TextField id="contact-email" label={o.club.contact.email} type="email" autoComplete="email" value={draft.club.contactEmail} onChange={(e) => updateClub({ contactEmail: e.target.value })} />
        </div>
      );
      break;
    case "logo":
      title = o.club.logo.title;
      text = o.club.logo.text;
      body = (
        <div className="grid justify-items-start gap-4">
          <div className="grid size-32 place-items-center overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed border-line bg-surface">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of a picked file
              <img src={logoUrl} alt="" className="size-full object-contain" />
            ) : (
              <Icon name="image" size={40} className="text-ink-soft" />
            )}
          </div>
          <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius)] border-2 border-ink px-5 font-bold hover:bg-surface-2">
            <Icon name="image" size={20} />
            {logo ? o.club.logo.change : o.club.logo.choose}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 2 * 1024 * 1024) {
                  setLogoError(o.club.logo.tooBig);
                  return;
                }
                setLogoError(null);
                setLogo(f);
              }}
            />
          </label>
          {logoError && <p role="alert" className="text-sm font-bold text-danger">{logoError}</p>}
        </div>
      );
      break;
    case "done":
      title = o.done.title;
      canSkip = false;
      showContinue = false;
      body = (
        <div className="grid gap-6">
          <p className="text-lg text-ink-soft">{kind === "club" ? o.done.club : kind === "guest" ? o.done.guest : o.done.player}</p>
          {saving === "error" ? (
            <div className="grid gap-3">
              <p role="alert" className="font-bold text-danger">{m.common.error}</p>
              <Button onClick={() => setSaving("idle")}>{m.common.next}</Button>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={saving !== "done"}
              onClick={() => {
                router.push(redirect);
                router.refresh();
              }}
            >
              {saving === "done" ? o.done.go : kind === "club" ? o.club.creating : m.common.loading}
              <Icon name="arrowRight" />
            </Button>
          )}
        </div>
      );
      break;
  }

  return (
    <div className="grid min-h-[calc(100dvh-80px)] grid-rows-[auto_1fr_auto] gap-6">
      <div className="grid gap-3 pt-2">
        <div className="flex items-center gap-3">
          {step !== "done" && (
            <button type="button" onClick={back} className="grid size-12 shrink-0 place-items-center rounded-full hover:bg-surface-2" aria-label={m.common.back}>
              <Icon name="arrowLeft" />
            </button>
          )}
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(index + 1, total)}
            aria-label={fmt(o.progress, { current: Math.min(index + 1, total), total })}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(Math.min(index + 1, total) / total) * 100}%` }} />
          </div>
          {canSkip && step !== "done" && (
            <button type="button" onClick={next} className="min-h-12 shrink-0 rounded-full px-4 text-sm font-bold text-ink-soft hover:bg-surface-2 hover:text-ink">
              {step === "account" ? o.account.skipText : m.common.skip}
            </button>
          )}
        </div>
      </div>

      <section aria-live="polite" className="grid content-start gap-6">
        <div className="grid gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="display text-[2.75rem] outline-none">
            {title}
          </h1>
          {text && <p className="text-lg text-ink-soft">{text}</p>}
        </div>
        {body}
      </section>

      {showContinue && (
        <div className={cn("sticky bottom-0 bg-gradient-to-t from-bg via-bg to-transparent pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-4")}>
          <Button size="lg" className="w-full" disabled={!canContinue} onClick={next}>
            {m.common.next}
            <Icon name="arrowRight" />
          </Button>
        </div>
      )}
    </div>
  );
}
