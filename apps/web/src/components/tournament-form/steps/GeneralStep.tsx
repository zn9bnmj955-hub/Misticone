"use client";
import { useState } from "react";
import { enabledSports, getSport } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { switchSport } from "@/lib/tournament-form";
import { MapPicker } from "@/components/map/MapPicker";
import { PlaceField, type PlaceValue } from "@/components/onboarding/PlaceField";
import { TextField } from "@/components/ui/TextField";
import { Choice, Group, TextArea } from "../fields";
import { MediaField } from "../MediaField";
import { fid, type StepProps } from "./types";

/** 2. General information: sport, name, date and times, place, on-site services, poster and rules. */
export function GeneralStep({ tournamentId, form, ctx, today, update, replace, error, sportSlugs }: StepProps & { sportSlugs: string[] }) {
  const w = getMessages().wizard;
  const g = w.general;
  const [sportChanged, setSportChanged] = useState(false);
  const sports = sportSlugs.map(getSport).filter((s) => s?.enabled) as ReturnType<typeof enabledSports>;

  const place: PlaceValue = {
    text: form.address,
    city: form.city || undefined,
    postcode: form.postcode || undefined,
    lat: form.lat ?? undefined,
    lng: form.lng ?? undefined,
  };
  const club = ctx.club.lat != null && ctx.club.lng != null ? { lat: ctx.club.lat, lng: ctx.club.lng } : null;

  return (
    <div className="grid gap-8">
      <Group title={g.sport}>
        <Choice
          label={g.sport}
          value={form.sportSlug}
          options={sports.map((s) => ({ value: s.slug, label: s.name, icon: s.icon }))}
          onChange={(slug) => {
            const next = getSport(slug);
            if (!next || slug === form.sportSlug) return;
            replace(switchSport(form, next, ctx));
            setSportChanged(true);
          }}
          hint={sportChanged ? g.sportChanged : undefined}
          error={error("sportSlug")}
        />
        <TextField id={fid("name")} label={g.name} placeholder={g.namePlaceholder} maxLength={140} value={form.name} error={error("name")} onChange={(e) => update({ name: e.target.value })} />
      </Group>

      <Group title={g.when} text={g.timesHint}>
        <TextField id={fid("date")} label={g.date} type="date" min={today} value={form.date} error={error("date")} onChange={(e) => update({ date: e.target.value })} className="sm:max-w-xs" />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id={fid("startTime")} label={g.startTime} type="time" step={300} value={form.startTime} error={error("startTime")} onChange={(e) => update({ startTime: e.target.value })} />
          <TextField
            id={fid("registrationClosesTime")}
            label={g.registrationClosesTime}
            type="time"
            step={300}
            value={form.registrationClosesTime}
            error={error("registrationClosesTime")}
            onChange={(e) => update({ registrationClosesTime: e.target.value })}
          />
          <TextField id={fid("checkInClosesTime")} label={g.checkInClosesTime} type="time" step={300} value={form.checkInClosesTime} error={error("checkInClosesTime")} onChange={(e) => update({ checkInClosesTime: e.target.value })} />
        </div>
      </Group>

      <Group title={g.where}>
        <div className="grid gap-1.5">
          <PlaceField
            id={fid("address")}
            kind="address"
            label={g.address}
            placeholder={g.addressPlaceholder}
            value={place}
            onChange={(v) =>
              v.city
                ? update({ address: v.text.slice(0, 200), city: v.city.slice(0, 80), postcode: (v.postcode ?? "").slice(0, 10), lat: v.lat ?? null, lng: v.lng ?? null })
                : update({ address: v.text.slice(0, 200) })
            }
            noResultText={g.noAddressResult}
            offlineText={g.addressOffline}
          />
          {error("address") && <p className="text-sm font-bold text-danger">{error("address")}</p>}
        </div>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4">
          <TextField id={fid("postcode")} label={g.postcode} inputMode="numeric" autoComplete="postal-code" maxLength={10} value={form.postcode} error={error("postcode")} onChange={(e) => update({ postcode: e.target.value })} />
          <TextField id={fid("city")} label={g.city} autoComplete="address-level2" maxLength={80} value={form.city} error={error("city")} onChange={(e) => update({ city: e.target.value })} />
        </div>
        <MapPicker
          value={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null}
          onChange={(p) => update({ lat: p?.lat ?? null, lng: p?.lng ?? null })}
          fallbackCenter={club}
        />
      </Group>

      <Group title={g.onSite}>
        <TextArea id={fid("parking")} label={`${g.parking} (${w.optional})`} placeholder={g.parkingPlaceholder} rows={2} maxLength={300} value={form.parking} error={error("parking")} onChange={(parking) => update({ parking })} />
        <TextArea id={fid("food")} label={`${g.food} (${w.optional})`} placeholder={g.foodPlaceholder} rows={2} maxLength={300} value={form.food} error={error("food")} onChange={(food) => update({ food })} />
      </Group>

      <Group title={g.media}>
        <MediaField tournamentId={tournamentId} kind="poster" label={`${g.poster} (${w.optional})`} hint={g.posterHint} path={form.posterPath} error={error("posterPath")} onChange={(posterPath) => update({ posterPath })} />
        <TextArea id={fid("rulesText")} label={`${g.rulesText} (${w.optional})`} placeholder={g.rulesPlaceholder} rows={4} maxLength={5000} value={form.rulesText} error={error("rulesText")} onChange={(rulesText) => update({ rulesText })} />
        <MediaField tournamentId={tournamentId} kind="rules" label={`${g.rulesPdf} (${w.optional})`} hint={g.rulesPdfHint} path={form.rulesPdfPath} error={error("rulesPdfPath")} onChange={(rulesPdfPath) => update({ rulesPdfPath })} />
      </Group>
    </div>
  );
}
