import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Section";
import { ActionForm } from "@/components/club/ActionForm";
import { checkInvitation } from "@/lib/data/clubs";
import { getViewer } from "@/lib/viewer";
import { acceptInvitation } from "../../actions";

export const metadata: Metadata = { title: getMessages().clubSpace.join.title, robots: { index: false } };

/** Per-invitation private page: nothing worth prerendering (the token is only known at request time). */
export const instant = false;

type Params = Promise<{ token: string }>;

async function Join({ params }: { params: Params }) {
  const t = getMessages().clubSpace;
  const { token } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/connexion?next=${encodeURIComponent(`/club/rejoindre/${token}`)}`);

  // Read-only check here; acceptInvitation checks everything again before writing.
  const check = await checkInvitation(token, viewer.email, new Date());
  if (!check.ok) {
    const message = check.reason === "wrongEmail" ? fmt(t.join.errors.wrongEmail, { email: check.email ?? "" }) : t.join.errors[check.reason];
    return (
      <Card className="grid gap-4">
        <p role="alert" className="font-semibold">
          {message}
        </p>
        <ButtonLink href="/accueil" variant="outline" className="justify-self-start">
          {t.join.back}
        </ButtonLink>
      </Card>
    );
  }

  const { clubName, role } = check.invitation;
  return (
    <Card className="grid gap-4">
      <p className="text-lg">{fmt(t.join.intro, { club: clubName, role: t.roleNouns[role] })}</p>
      <ActionForm action={acceptInvitation} fields={{ token }} className="grid gap-3">
        <button type="submit" className={buttonClass("primary", "lg", "justify-self-start")}>
          {fmt(t.join.accept, { club: clubName })}
        </button>
      </ActionForm>
    </Card>
  );
}

export default function JoinClubPage({ params }: { params: Params }) {
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">{getMessages().clubSpace.join.title}</h1>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Join params={params} />
      </Suspense>
    </div>
  );
}
