import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { enabledSports } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Skeleton } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { ActionForm } from "@/components/club/ActionForm";
import { ClubLogo } from "@/components/club/ClubLogo";
import { ClubPageHeader } from "@/components/club/ClubPageHeader";
import { ClubPlaceFields } from "@/components/club/ClubPlaceFields";
import { NoClub } from "@/components/club/NoClub";
import { SelectField, TextAreaField } from "@/components/club/fields";
import { CLUB_KINDS } from "@/components/club/model";
import { clubLogoUrl, getClubContext, getClubRow } from "@/lib/data/clubs";
import { getViewer } from "@/lib/viewer";
import { removeClubLogo, updateClubInfo, uploadClubLogo } from "../actions";

export const metadata: Metadata = { title: getMessages().clubSpace.info.title, robots: { index: false } };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-3 text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

async function ClubInfo() {
  const m = getMessages();
  const t = m.clubSpace.info;
  const ctx = await getClubContext();
  if (!ctx) return <NoClub viewer={await getViewer()} next="/club/infos" />;
  const { club, isAdmin } = ctx;
  const row = await getClubRow(club.id);
  if (!row) return <NoClub viewer={ctx.viewer} next="/club/infos" />;

  // Only enabled sports can be saved (checked again by the server action).
  const sports = enabledSports();
  const ro = !isAdmin;

  return (
    <div className="grid gap-6">
      {ro && <Note>{t.adminsOnly}</Note>}

      <Card className="grid gap-4">
        <h2 className="text-lg font-bold">{t.logo.title}</h2>
        <div className="flex flex-wrap items-center gap-4">
          <ClubLogo url={clubLogoUrl(row.logo_path, row.updated_at)} name={row.name} alt={fmt(m.clubSpace.logoAlt, { club: row.name })} size="lg" />
          {isAdmin && (
            <div className="grid flex-1 gap-3">
              <ActionForm action={uploadClubLogo} resetOnSuccess className="grid gap-2">
                <label htmlFor="club-logo" className="text-sm font-bold">
                  {t.logo.file}
                </label>
                <input
                  id="club-logo"
                  name="logo"
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby="club-logo-desc"
                  className="min-h-12 text-sm file:mr-3 file:min-h-11 file:rounded-[var(--radius)] file:border-2 file:border-ink file:bg-surface file:px-4 file:font-bold file:text-ink"
                />
                <p id="club-logo-desc" className="text-sm text-ink-soft">
                  {t.logo.hint}
                </p>
                <button type="submit" className={buttonClass("outline", "md", "justify-self-start")}>
                  <Icon name="image" size={20} />
                  {t.logo.upload}
                </button>
              </ActionForm>
              {row.logo_path && (
                <ActionForm action={removeClubLogo} className="grid gap-1">
                  <button type="submit" className={buttonClass("ghost", "md", "justify-self-start")}>
                    {t.logo.remove}
                  </button>
                </ActionForm>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <ActionForm action={updateClubInfo} className="grid gap-8">
          <fieldset disabled={ro} className="contents">
            <Group title={t.groups.identity}>
              <TextField id="club-name" name="name" required minLength={2} maxLength={120} label={t.name} defaultValue={row.name} />
              <SelectField id="club-kind" name="kind" label={t.kind} defaultValue={row.kind}>
                {CLUB_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.clubSpace.kinds[k]}
                  </option>
                ))}
              </SelectField>
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-bold">{t.sports}</legend>
                <div className="flex flex-wrap gap-2">
                  {sports.map((s) => (
                      <label
                        key={s.slug}
                        data-sport={s.accentToken}
                        className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius)] border-2 border-line px-4 font-semibold has-[:checked]:border-accent has-[:focus-visible]:outline-2"
                      >
                        <input type="checkbox" name="sports" value={s.slug} defaultChecked={row.sports.includes(s.slug)} className="size-5 accent-[var(--os-accent)]" />
                        <Icon name={s.icon} size={18} />
                        {s.name}
                      </label>
                  ))}
                </div>
              </fieldset>
              <TextAreaField id="club-description" name="description" maxLength={2000} label={t.description} hint={t.descriptionHint} defaultValue={row.description ?? ""} />
            </Group>

            <Group title={t.groups.place}>
              <ClubPlaceFields
                disabled={ro}
                initial={{ address: row.address, city: row.city, postcode: row.postcode, lat: row.lat, lng: row.lng }}
                labels={{ address: t.address, addressPlaceholder: t.addressPlaceholder, city: t.city, postcode: t.postcode, noResult: t.noResult, offline: t.offline }}
              />
              <TextField
                id="club-venues"
                name="default_venue_count"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                label={t.venues}
                hint={t.venuesHint}
                defaultValue={row.default_venue_count ?? ""}
                className="max-w-xs"
              />
            </Group>

            <Group title={t.groups.contact}>
              <TextField id="club-contact-name" name="contact_name" maxLength={80} autoComplete="name" label={t.contactName} defaultValue={row.contact_name ?? ""} />
              <TextField id="club-contact-email" name="contact_email" type="email" maxLength={254} autoComplete="email" label={t.contactEmail} defaultValue={row.contact_email ?? ""} />
              <TextField id="club-contact-phone" name="contact_phone" type="tel" maxLength={30} autoComplete="tel" label={t.contactPhone} defaultValue={row.contact_phone ?? ""} />
            </Group>

            <Group title={t.groups.federation}>
              <TextField id="club-federation" name="federation" maxLength={80} label={t.federation} defaultValue={row.federation ?? ""} />
              <TextField id="club-affiliation" name="affiliation_number" maxLength={40} label={t.affiliation} defaultValue={row.affiliation_number ?? ""} />
            </Group>

            {isAdmin && (
              <button type="submit" className={buttonClass("primary", "lg", "justify-self-start")}>
                {t.submit}
              </button>
            )}
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}

export default function ClubInfoPage() {
  const t = getMessages().clubSpace.info;
  return (
    <div className="grid gap-6">
      <ClubPageHeader title={t.title} intro={t.intro} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ClubInfo />
      </Suspense>
    </div>
  );
}
