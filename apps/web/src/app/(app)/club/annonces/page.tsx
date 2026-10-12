import type { Metadata } from "next";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { ActionForm } from "@/components/club/ActionForm";
import { ClubPageHeader } from "@/components/club/ClubPageHeader";
import { NoClub } from "@/components/club/NoClub";
import { SelectField, TextAreaField } from "@/components/club/fields";
import { formatLongDate } from "@/components/club/model";
import { getClubContext, getClubRow, listClubAnnouncements } from "@/lib/data/clubs";
import { getViewer } from "@/lib/viewer";
import { createAnnouncement, deleteAnnouncement, setAnnouncementPublished } from "../actions";

export const metadata: Metadata = { title: getMessages().clubSpace.announcements.title, robots: { index: false } };

async function Announcements() {
  const t = getMessages().clubSpace.announcements;
  const ctx = await getClubContext();
  if (!ctx) return <NoClub viewer={await getViewer()} next="/club/annonces" />;
  const { club, isAdmin } = ctx;
  const [row, items] = await Promise.all([getClubRow(club.id), listClubAnnouncements(club.id)]);
  const sports = (row?.sports ?? []).map((slug) => getSport(slug)).filter((s) => s !== undefined);

  return (
    <div className="grid gap-8">
      {isAdmin ? (
        <Section title={t.form.title}>
          <Card>
            <ActionForm action={createAnnouncement} resetOnSuccess className="grid gap-4">
              <TextField id="ann-title" name="title" required minLength={3} maxLength={140} label={t.form.titleLabel} placeholder={t.form.titlePlaceholder} />
              <TextAreaField id="ann-body" name="body" maxLength={2000} label={t.form.body} />
              <TextField id="ann-link" name="link" type="url" inputMode="url" label={t.form.link} hint={t.form.linkHint} />
              {sports.length > 1 && (
                <SelectField id="ann-sport" name="sport" label={t.form.sport} defaultValue="">
                  <option value="">{t.form.allSports}</option>
                  {sports.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              )}
              <label className="flex min-h-12 items-center gap-3 font-semibold">
                <input type="checkbox" name="publish" value="1" defaultChecked className="size-5 accent-[var(--os-accent)]" />
                {t.form.publishNow}
              </label>
              <button type="submit" className={buttonClass("primary", "md", "justify-self-start")}>
                {t.form.submit}
              </button>
            </ActionForm>
          </Card>
        </Section>
      ) : (
        <Note>{t.adminsOnly}</Note>
      )}

      <Section title={t.title}>
        {items.length === 0 ? (
          <p className="text-ink-soft">{t.empty}</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((a) => {
              const sport = a.sport_slug ? getSport(a.sport_slug) : undefined;
              return (
                <li key={a.id} data-sport={sport?.accentToken} className="grid gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.published_at ? "success" : "neutral"}>
                      {a.published_at ? fmt(t.published, { date: formatLongDate(a.published_at) }) : t.unpublished}
                    </Badge>
                    {sport && (
                      <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
                        <Icon name={sport.icon} size={16} />
                        {sport.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold">{a.title}</h3>
                  {a.body && <p className="whitespace-pre-line">{a.body}</p>}
                  {a.link_url && (
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer nofollow" className="justify-self-start break-all text-sm font-bold text-accent-ink underline underline-offset-4">
                      {a.link_url}
                    </a>
                  )}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <ActionForm action={setAnnouncementPublished} fields={{ id: a.id, publish: a.published_at ? "0" : "1" }} className="grid gap-1">
                        <button type="submit" className={buttonClass(a.published_at ? "outline" : "primary")}>
                          {a.published_at ? t.unpublish : t.publish}
                        </button>
                      </ActionForm>
                      <ActionForm action={deleteAnnouncement} fields={{ id: a.id }} confirm={fmt(t.confirmDelete, { title: a.title })} className="grid gap-1">
                        <button type="submit" className={buttonClass("danger")}>
                          {t.delete}
                        </button>
                      </ActionForm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function ClubAnnouncementsPage() {
  const t = getMessages().clubSpace.announcements;
  return (
    <div className="grid gap-6">
      <ClubPageHeader title={t.title} intro={t.intro} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Announcements />
      </Suspense>
    </div>
  );
}
