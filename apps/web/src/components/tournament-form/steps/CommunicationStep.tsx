"use client";
import { getMessages } from "@/i18n";
import { Group, TextArea, Toggle } from "../fields";
import { fid, type StepProps } from "./types";

/** 7. Communication: player notifications, welcome message, reminder the day before. */
export function CommunicationStep({ form, update, error }: StepProps) {
  const w = getMessages().wizard;
  const t = w.communication;
  return (
    <div className="grid gap-8">
      <Group title={t.notifications}>
        <Toggle label={t.notifications} text={t.notificationsText} checked={form.notifications} onChange={(notifications) => update({ notifications })} />
        <Toggle label={t.reminder} text={t.reminderText} checked={form.reminderDayBefore} onChange={(reminderDayBefore) => update({ reminderDayBefore })} />
      </Group>
      <Group title={`${t.welcome} (${w.optional})`}>
        <TextArea
          id={fid("welcomeMessage")}
          label={t.welcome}
          placeholder={t.welcomePlaceholder}
          rows={4}
          maxLength={500}
          value={form.welcomeMessage}
          error={error("welcomeMessage")}
          onChange={(welcomeMessage) => update({ welcomeMessage })}
        />
      </Group>
    </div>
  );
}
