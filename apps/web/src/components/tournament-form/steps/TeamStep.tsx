"use client";
import { useState } from "react";
import { z } from "zod";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Group, Help, Stepper } from "../fields";
import { fid, type StepProps } from "./types";

const emailSchema = z.email().max(160);

/** 1. Who uses the link: organizer, co-organizers of the scoring table, PIN codes, referee. */
export function TeamStep({ form, update, error }: StepProps) {
  const w = getMessages().wizard;
  const t = w.team;
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  function addCoOrganizer() {
    const value = email.trim();
    if (!value) return;
    if (!emailSchema.safeParse(value).success) return setEmailError(t.coOrganizerInvalid);
    if (form.coOrganizers.some((e) => e.toLowerCase() === value.toLowerCase())) return setEmailError(t.coOrganizerDuplicate);
    if (form.coOrganizers.length >= 10) return setEmailError(t.coOrganizerMax);
    update({ coOrganizers: [...form.coOrganizers, value] });
    setEmail("");
    setEmailError(null);
  }

  const organizer = (patch: Partial<typeof form.organizer>) => update({ organizer: { ...form.organizer, ...patch } });

  return (
    <div className="grid gap-8">
      <Group title={t.organizer} text={t.organizerText}>
        <TextField id={fid("organizer.name")} label={t.name} autoComplete="name" maxLength={80} value={form.organizer.name} error={error("organizer.name")} onChange={(e) => organizer({ name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={fid("organizer.phone")} label={`${t.phone} (${w.optional})`} type="tel" autoComplete="tel" maxLength={20} value={form.organizer.phone} error={error("organizer.phone")} onChange={(e) => organizer({ phone: e.target.value })} />
          <TextField id={fid("organizer.email")} label={t.email} type="email" autoComplete="email" maxLength={160} hint={t.emailHint} value={form.organizer.email} error={error("organizer.email")} onChange={(e) => organizer({ email: e.target.value.trim() })} />
        </div>
      </Group>

      <Group title={t.coOrganizers} text={t.coOrganizersText}>
        {form.coOrganizers.length > 0 && (
          <ul className="grid gap-2">
            {form.coOrganizers.map((e) => (
              <li key={e} className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] border border-line bg-surface pl-4">
                <Icon name="mail" size={18} className="shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1 truncate font-bold">{e}</span>
                <button
                  type="button"
                  onClick={() => update({ coOrganizers: form.coOrganizers.filter((x) => x !== e) })}
                  aria-label={`${w.remove} ${e}`}
                  className="grid size-12 place-items-center rounded-[var(--radius)] text-ink-soft hover:bg-surface-2 hover:text-ink"
                >
                  <Icon name="close" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-1.5">
          <label htmlFor={fid("coOrganizers")} className="text-sm font-bold">
            {t.coOrganizerEmail}
          </label>
          <div className="flex gap-2">
            <input
              id={fid("coOrganizers")}
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder={t.coOrganizerPlaceholder}
              value={email}
              aria-invalid={emailError || error("coOrganizers") ? true : undefined}
              aria-describedby={`${fid("coOrganizers")}-desc`}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              onBlur={() => {
                if (email.trim() && emailSchema.safeParse(email.trim()).success) addCoOrganizer();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCoOrganizer();
                }
              }}
              className="min-h-12 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-soft/70 focus:border-accent focus:outline-none aria-[invalid]:border-danger"
            />
            <Button variant="outline" onClick={addCoOrganizer} disabled={!email.trim()}>
              <Icon name="plus" size={20} />
              {w.add}
            </Button>
          </div>
          <Help id={`${fid("coOrganizers")}-desc`} error={emailError ?? error("coOrganizers")} />
        </div>
      </Group>

      <Group title={t.pins} text={form.organizer.email ? fmt(t.pinsText, { email: form.organizer.email }) : t.pinsTextNoEmail}>
        <Stepper id={fid("pinCount")} label={t.pinCount} value={form.pinCount} min={0} max={10} error={error("pinCount")} onChange={(pinCount) => update({ pinCount })} />
      </Group>

      <Group title={`${t.referee} (${w.optional})`}>
        <TextField id={fid("referee")} label={t.referee} placeholder={t.refereePlaceholder} maxLength={80} value={form.referee} error={error("referee")} onChange={(e) => update({ referee: e.target.value })} />
      </Group>
    </div>
  );
}
