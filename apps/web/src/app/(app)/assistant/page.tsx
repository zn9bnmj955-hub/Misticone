import type { Metadata } from "next";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const metadata: Metadata = { title: getMessages().assistantUi.title };

/**
 * Full-page chat (mobile first): the conversation is the same as in the
 * bubble (kept for the browser tab), the composer stays above the tab bar.
 */
export default function AssistantPage() {
  const m = getMessages().assistantUi;
  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-4 lg:min-h-[calc(100dvh-6rem)]">
      <h1 className="display flex items-center gap-3 text-4xl lg:text-5xl">
        <Icon name="sparkle" size={32} className="text-accent-ink" />
        {m.title}
      </h1>
      <AssistantChat variant="page" />
    </div>
  );
}
