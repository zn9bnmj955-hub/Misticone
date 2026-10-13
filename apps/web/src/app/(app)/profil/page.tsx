import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { NotificationsSection } from "@/components/notifications/NotificationsSection";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Section";
import { ProfileSwitcher } from "@/components/profile/ProfileSwitcher";
import { ThemeSwitcher } from "@/components/profile/ThemeSwitcher";
import { getDevicePrefs, getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().profile.title };

function SportsList({ sports }: { sports: string[] }) {
  if (sports.length === 0) return <span className="text-ink-soft">—</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {sports.map((s) => {
        const sport = getSport(s);
        return (
          <span key={s} data-sport={sport?.accentToken} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent-ink">
            <Icon name={sport?.icon ?? "all"} size={16} />
            {sport?.name ?? s}
          </span>
        );
      })}
    </span>
  );
}

async function ProfileContent() {
  const m = getMessages();
  const p = m.profile;
  const viewer = await getViewer();

  if (!viewer) {
    const prefs = await getDevicePrefs();
    return (
      <div className="grid gap-6">
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-bold">{p.guestTitle}</h2>
            <p className="text-ink-soft">{p.guestText}</p>
          </div>
          <dl className="grid gap-3">
            <div className="grid gap-1">
              <dt className="eyebrow">{p.mySports}</dt>
              <dd><SportsList sports={prefs?.sports ?? []} /></dd>
            </div>
            <div className="grid gap-1">
              <dt className="eyebrow">{p.myCity}</dt>
              <dd className="font-bold">{prefs?.city ?? p.noCity}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/inscription/invite" variant="outline">{p.edit}</ButtonLink>
            <ButtonLink href="/connexion?mode=signup">{p.createAccount}</ButtonLink>
            <ButtonLink href="/connexion" variant="ghost">{p.login}</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const profile = viewer.profile;
  const options = [
    { id: null, label: p.playerProfile, sub: profile?.display_name ?? viewer.email ?? undefined, icon: "user" },
    ...viewer.clubs.map((c) => ({ id: c.id, label: fmt(p.clubProfile, { club: c.name }), sub: c.role === "owner" ? "Propriétaire" : c.role === "admin" ? "Administrateur" : "Membre", icon: "club" })),
  ];
  return (
    <div className="grid gap-6">
      <Card className="grid gap-1">
        <p className="display text-3xl">{profile?.display_name ?? viewer.email}</p>
        {profile?.display_name && <p className="text-ink-soft">{viewer.email}</p>}
      </Card>
      <ProfileSwitcher title={p.switchTitle} options={options} activeId={viewer.activeClub?.id ?? null} />
      <Link href="/inscription/club" className="flex min-h-12 items-center gap-2 font-bold text-accent-ink">
        <Icon name="plus" size={20} />
        {p.addClub}
      </Link>
      <Card className="grid gap-3">
        <dl className="grid gap-3">
          <div className="grid gap-1">
            <dt className="eyebrow">{p.mySports}</dt>
            <dd><SportsList sports={profile?.sports ?? []} /></dd>
          </div>
          <div className="grid gap-1">
            <dt className="eyebrow">{p.myCity}</dt>
            <dd className="font-bold">{profile?.city ?? p.noCity}</dd>
          </div>
        </dl>
        <ButtonLink href="/inscription/joueur" variant="outline" className="justify-self-start">{p.edit}</ButtonLink>
      </Card>
      {viewer.isAdmin && (
        <Link
          href="/admin"
          className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition hover:border-ink-soft"
        >
          <Icon name="club" size={24} className="shrink-0 text-accent-ink" />
          <span className="grid">
            <span className="font-bold">{m.admin.profileLink}</span>
            <span className="text-sm text-ink-soft">{m.admin.profileLinkSub}</span>
          </span>
        </Link>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="flex min-h-12 items-center gap-2 font-bold text-danger">
          <Icon name="logout" size={20} />
          {m.auth.signOut}
        </button>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const m = getMessages();
  const p = m.profile;
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">{p.title}</h1>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ProfileContent />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <NotificationsSection />
      </Suspense>
      <ThemeSwitcher labels={{ title: p.appearance, system: p.themeSystem, light: p.themeLight, dark: p.themeDark }} />
      <nav aria-label={p.legal} className="grid gap-1 text-sm">
        <p className="eyebrow mb-1">{p.legal}</p>
        {Object.entries(m.legal.pages).map(([slug, title]) => (
          <Link key={slug} href={`/legal/${slug}`} className="py-1.5 text-ink-soft hover:text-ink">
            {title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
