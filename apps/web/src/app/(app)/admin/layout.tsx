import type { Metadata } from "next";
import { Suspense } from "react";
import { getMessages } from "@/i18n";
import { AdminNav } from "@/components/admin/AdminNav";
import { Skeleton } from "@/components/ui/Section";
import { requireAdmin } from "@/lib/data/admin";

const m = getMessages();
const t = m.admin;

export const metadata: Metadata = {
  // The closest template wins: repeat the site name after the section name.
  title: { default: t.title, template: `%s · ${t.title} · ${m.meta.title}` },
  robots: { index: false, follow: false },
};

/**
 * Platform administration. Only platform admins see it (others get a 404).
 * The check is repeated by every page and every server action: a layout alone
 * does not protect the data of its pages.
 */
async function AdminFrame({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">{t.title}</h1>
      <AdminNav />
      {children}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}
