import type { Metadata } from "next";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { ActionForm } from "@/components/club/ActionForm";
import { ClubPageHeader } from "@/components/club/ClubPageHeader";
import { NoClub } from "@/components/club/NoClub";
import { SelectField } from "@/components/club/fields";
import { canEditMember, formatLongDate, maskEmail } from "@/components/club/model";
import { getClubContext, listClubMembers, listPendingInvitations } from "@/lib/data/clubs";
import { getViewer } from "@/lib/viewer";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "../actions";

export const metadata: Metadata = { title: getMessages().clubSpace.members.title, robots: { index: false } };

const small = buttonClass("outline");

/** Pending invitations (club admins only, RLS), flagged when their link has run out. */
async function loadPending(clubId: string) {
  const rows = await listPendingInvitations(clubId);
  const now = Date.now();
  return rows.map((inv) => ({ ...inv, expired: Date.parse(inv.expires_at) <= now }));
}

async function Members() {
  const m = getMessages().clubSpace;
  const t = m.members;
  const ctx = await getClubContext();
  if (!ctx) return <NoClub viewer={await getViewer()} next="/club/membres" />;
  const { viewer, club, isAdmin } = ctx;
  // Membership checked just above; other people's profiles need the service role.
  const [members, pending] = await Promise.all([listClubMembers(club.id), isAdmin ? loadPending(club.id) : Promise.resolve([])]);
  const actor = { id: viewer.id, role: club.role };

  return (
    <div className="grid gap-8">
      <Section title={t.title}>
        <ul className="grid gap-3">
          {members.map((member) => {
            const name = member.name || (member.email && isAdmin ? member.email : t.unnamed);
            const email = member.email ? (isAdmin || member.userId === viewer.id ? member.email : maskEmail(member.email)) : null;
            const editable = canEditMember(actor, member);
            return (
              <li key={member.userId} className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="font-bold">
                      {name}
                      {member.userId === viewer.id && <span className="font-normal text-ink-soft"> ({t.you})</span>}
                    </p>
                    {email && email !== name && <p className="break-all text-sm text-ink-soft">{email}</p>}
                    <p className="text-sm text-ink-soft">{fmt(t.since, { date: formatLongDate(member.since) })}</p>
                  </div>
                  <Badge tone={member.role === "member" ? "neutral" : "accent"}>{m.roles[member.role]}</Badge>
                </div>
                {editable && (
                  <div className="flex flex-wrap gap-2">
                    <ActionForm action={changeMemberRole} fields={{ userId: member.userId, role: member.role === "admin" ? "member" : "admin" }} className="grid gap-1">
                      <button type="submit" className={small}>
                        {member.role === "admin" ? t.makeMember : t.makeAdmin}
                      </button>
                    </ActionForm>
                    <ActionForm action={removeMember} fields={{ userId: member.userId }} confirm={fmt(t.confirmRemove, { name })} className="grid gap-1">
                      <button type="submit" className={buttonClass("danger")}>
                        {t.remove}
                      </button>
                    </ActionForm>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {!isAdmin ? (
        <Note>{t.adminsOnly}</Note>
      ) : (
        <>
          <Section title={t.invite.title}>
            <Card>
              <ActionForm action={inviteMember} resetOnSuccess className="grid gap-4">
                <TextField id="invite-email" name="email" type="email" required autoComplete="off" label={t.invite.email} placeholder={t.invite.emailPlaceholder} />
                <SelectField id="invite-role" name="role" label={t.invite.role} defaultValue="member" hint={`${t.roleHelp.member} ${t.roleHelp.admin}`}>
                  <option value="member">{m.roles.member}</option>
                  <option value="admin">{m.roles.admin}</option>
                </SelectField>
                <p className="text-sm text-ink-soft">{t.invite.hint}</p>
                <button type="submit" className={buttonClass("primary", "md", "justify-self-start")}>
                  {t.invite.submit}
                </button>
              </ActionForm>
            </Card>
          </Section>

          <Section title={t.pending.title}>
            {pending.length === 0 ? (
              <p className="text-ink-soft">{t.pending.empty}</p>
            ) : (
              <ul className="grid gap-3">
                {pending.map((inv) => {
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                      <div className="grid min-w-0 gap-0.5">
                        <p className="break-all font-bold">{inv.email}</p>
                        <p className="text-sm text-ink-soft">
                          {m.roles[inv.role]} · {inv.expired ? t.pending.expired : fmt(t.pending.expires, { date: formatLongDate(inv.expires_at) })}
                        </p>
                      </div>
                      <ActionForm action={revokeInvitation} fields={{ id: inv.id }} confirm={fmt(t.pending.confirmRevoke, { email: inv.email })} className="grid gap-1">
                        <button type="submit" className={small}>
                          {t.pending.revoke}
                        </button>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

export default function ClubMembersPage() {
  const t = getMessages().clubSpace.members;
  return (
    <div className="grid gap-6">
      <ClubPageHeader title={t.title} intro={t.intro} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Members />
      </Suspense>
    </div>
  );
}
