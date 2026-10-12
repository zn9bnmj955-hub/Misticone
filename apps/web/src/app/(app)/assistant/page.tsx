import type { Metadata } from "next";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { Note } from "@/components/ui/Section";

export const metadata: Metadata = { title: getMessages().assistant.title };

export default function AssistantPage() {
  const m = getMessages().assistant;
  return (
    <div className="grid gap-6">
      <h1 className="display flex items-center gap-3 text-5xl">
        <Icon name="sparkle" size={36} />
        {m.title}
      </h1>
      <p className="text-lg text-ink-soft">{m.text}</p>
      <Note>{m.soon}</Note>
    </div>
  );
}
