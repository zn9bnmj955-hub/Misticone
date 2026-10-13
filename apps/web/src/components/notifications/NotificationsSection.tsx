import { getMessages } from "@/i18n";
import { Card } from "@/components/ui/Card";
import { getViewer } from "@/lib/viewer";
import { PushSettings } from "./PushSettings";

/** Profile section (reads the session: render inside <Suspense>). */
export async function NotificationsSection() {
  const texts = getMessages().notifications;
  const viewer = await getViewer();
  const account = viewer ? { email: viewer.email ?? null, emailOptIn: viewer.profile?.notifications_opt_in ?? false } : null;
  return (
    <section id="notifications" aria-labelledby="notifications-title" className="grid gap-3">
      <h2 id="notifications-title" className="text-xl font-bold">{texts.profile.title}</h2>
      <Card>
        <PushSettings texts={texts} account={account} />
      </Card>
    </section>
  );
}
