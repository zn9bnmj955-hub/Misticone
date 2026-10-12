import { getMessages } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Viewer } from "@/lib/viewer";

/** Shown instead of a club page when no club is being managed: guest, player profile, or no club yet. */
export function NoClub({ viewer, next = "/club" }: { viewer: Viewer | null; next?: string }) {
  const t = getMessages().clubSpace.noClub;
  if (!viewer) {
    return (
      <Card className="grid gap-3">
        <p>{t.guest}</p>
        <ButtonLink href={`/connexion?next=${encodeURIComponent(next)}`} className="justify-self-start">
          {t.signIn}
        </ButtonLink>
      </Card>
    );
  }
  if (viewer.clubs.length > 0) {
    return (
      <Card className="grid gap-3">
        <p>{t.playerMode}</p>
        <ButtonLink href="/profil" className="justify-self-start">
          {t.switch}
        </ButtonLink>
      </Card>
    );
  }
  return (
    <Card className="grid gap-3">
      <p>{t.none}</p>
      <ButtonLink href="/inscription/club" className="justify-self-start">
        {t.create}
      </ButtonLink>
    </Card>
  );
}
