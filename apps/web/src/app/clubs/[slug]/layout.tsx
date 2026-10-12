import { AppShell } from "@/components/shell/AppShell";

/** The public club page lives outside the (app) group (short public URL) but keeps the app navigation. */
export default function ClubPublicLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
