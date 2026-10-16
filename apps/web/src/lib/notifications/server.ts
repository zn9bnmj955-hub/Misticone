import "server-only";
import webpush from "web-push";
import type { Change, EngineState } from "@orgasport/engine";
import { getSport, type SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { sendEmail } from "@/lib/email";
import { formatDay, formatTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunk, fetchAllRows, must } from "@/lib/supabase/paginate";
import { isoToParis, parisDatePlus } from "@/lib/tournament-form/time";
import { loadTournament } from "@/lib/tournament/load";
import { buildTeamViews, sideText } from "@/terrain/view-model";
import { eventsFromChanges, type NotifyEvent } from "./events";
import { renderBody, type NotificationKind, type TemplateVars } from "./templates";

/**
 * Notifications: "À vous de jouer" and friends. Events come from the draw
 * engine's changes (fast path, right after an action) and from the scheduler
 * (reminders); every message is queued in `notifications` with a
 * deduplication key, then sent by push (Web Push, VAPID) or, as a fallback,
 * by email to people who accepted notifications. Nothing here may break an
 * organizer action: all errors are logged and swallowed.
 */

const EMAIL_FALLBACK: ReadonlySet<NotificationKind> = new Set(["your_turn", "tournament_starting", "reminder_day_before", "not_checked_in"]);
const MAX_ATTEMPTS = 5;

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
type TeamRecipients = { subs: Map<string, Sub>; emails: Set<string> };

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function setupVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || `mailto:contact@${new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://orgasport.fr").hostname}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  return true;
}

function notificationsEnabled(config: unknown): boolean {
  return (config as { communication?: { notifications?: boolean } } | null)?.communication?.notifications !== false;
}

/** Devices following each team + emails of accounts that accepted notifications without a device. */
async function recipients(tournamentId: string, teamIds: string[], withCaptainEmails: boolean): Promise<Map<string, TeamRecipients>> {
  const admin = createAdminClient();
  const out = new Map<string, TeamRecipients>(teamIds.map((id) => [id, { subs: new Map(), emails: new Set() }]));
  if (teamIds.length === 0) return out;
  // Read by tournament (paginated) rather than `.in(all team ids)`: beyond ~200 teams the URL is too long (414).
  const wanted = new Set(teamIds);
  const [allTargets, allPlayers, allRegs] = await Promise.all([
    fetchAllRows((from, to) =>
      admin.from("push_targets").select("id, team_id, push_subscriptions (id, endpoint, p256dh, auth)").eq("tournament_id", tournamentId).order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin
        .from("players")
        .select("id, team_id, user_id, teams!inner(tournament_id)")
        .eq("teams.tournament_id", tournamentId)
        .not("user_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) => admin.from("registrations").select("id, team_id, user_id, captain_email").eq("tournament_id", tournamentId).order("id").range(from, to)),
  ]);
  const targets = { data: allTargets.filter((t) => t.team_id && wanted.has(t.team_id)) };
  const players = { data: allPlayers.filter((p) => wanted.has(p.team_id)) };
  const regs = { data: allRegs.filter((r) => wanted.has(r.team_id)) };
  for (const t of targets.data ?? []) {
    const s = t.push_subscriptions as unknown as Sub | null;
    if (s && t.team_id) out.get(t.team_id)?.subs.set(s.id, s);
  }
  const usersByTeam = new Map<string, Set<string>>();
  const addUser = (team: string, user: string | null) => {
    if (!user) return;
    if (!usersByTeam.has(team)) usersByTeam.set(team, new Set());
    usersByTeam.get(team)!.add(user);
  };
  for (const p of players.data ?? []) addUser(p.team_id, p.user_id);
  for (const r of regs.data ?? []) addUser(r.team_id, r.user_id);
  const userIds = [...new Set([...usersByTeam.values()].flatMap((s) => [...s]))];
  if (userIds.length) {
    const parts = chunk(userIds);
    const [subLists, profileLists] = await Promise.all([
      Promise.all(parts.map(async (ids) => must(await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id").in("user_id", ids)) ?? [])),
      Promise.all(parts.map(async (ids) => must(await admin.from("profiles").select("id, notifications_opt_in").in("id", ids)) ?? [])),
    ]);
    const subs = { data: subLists.flat() };
    const profiles = { data: profileLists.flat() };
    const optIn = new Set((profiles.data ?? []).filter((p) => p.notifications_opt_in).map((p) => p.id));
    const subsByUser = new Map<string, Sub[]>();
    for (const s of subs.data ?? []) {
      if (!s.user_id) continue;
      subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
    }
    for (const [team, users] of usersByTeam) {
      const rec = out.get(team)!;
      for (const u of users) {
        const devices = subsByUser.get(u) ?? [];
        for (const d of devices) rec.subs.set(d.id, d);
        if (devices.length === 0 && optIn.has(u)) {
          const { data } = await admin.auth.admin.getUserById(u);
          if (data.user?.email) rec.emails.add(data.user.email.toLowerCase());
        }
      }
    }
  }
  if (withCaptainEmails) {
    for (const r of regs.data ?? []) if (r.captain_email) out.get(r.team_id)?.emails.add(r.captain_email.toLowerCase());
  }
  return out;
}

type Message = { kind: NotificationKind; eventKey: string; teamId: string; title: string; body: string; url: string };

async function enqueue(tournamentId: string, messages: Message[], recipientsByTeam: Map<string, TeamRecipients>): Promise<number> {
  const rows: Record<string, unknown>[] = [];
  for (const msg of messages) {
    const rec = recipientsByTeam.get(msg.teamId);
    if (!rec) continue;
    const base = { template: msg.kind, tournament_id: tournamentId, team_id: msg.teamId, title: msg.title, body: msg.body, url: msg.url, payload: { url: msg.url } };
    for (const s of rec.subs.values()) rows.push({ ...base, channel: "push", push_subscription_id: s.id, dedupe_key: `${msg.eventKey}:${msg.teamId}:push:${s.id}` });
    if (rec.subs.size === 0 && EMAIL_FALLBACK.has(msg.kind)) {
      for (const email of rec.emails) rows.push({ ...base, channel: "email", email, dedupe_key: `${msg.eventKey}:${msg.teamId}:email:${email}` });
    }
  }
  if (rows.length === 0) return 0;
  const { error, count } = await createAdminClient()
    .from("notifications")
    .upsert(rows as never, { onConflict: "dedupe_key", ignoreDuplicates: true, count: "exact" });
  if (error) console.error("notifications enqueue failed", error.message);
  return count ?? 0;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function messagesForEvent(e: NotifyEvent, state: EngineState, sport: SportConfig, t: { name: string; code: string; nameDisplay: "full" | "initials" }, nowMs: number): Message[] {
  const views = buildTeamViews(state, t.nameDisplay);
  const m = getMessages();
  const out: Message[] = [];
  for (const teamId of e.teamIds) {
    const team = views.get(teamId);
    if (!team) continue;
    const url = `${siteUrl()}/c/${t.code}?equipe=${team.number}`;
    let vars: TemplateVars = { tournament: t.name };
    if (e.kind === "your_turn" || e.kind === "score_validated") {
      const match = state.matches[e.matchId];
      if (!match) continue;
      const mine = match.sideA.includes(teamId) ? "A" : "B";
      const opponent = mine === "A" ? match.sideB : match.sideA;
      const venue = match.venueId ? state.venues[match.venueId]?.label : undefined;
      const at = match.scheduledAt ?? new Date(nowMs).toISOString();
      vars = {
        ...vars,
        venue,
        time: formatTime(at),
        minutes: Math.max(0, Math.round((Date.parse(at) - nowMs) / 60000)),
        opponent: sideText(views, opponent, m),
        score: match.scoreA !== null && match.scoreB !== null ? (mine === "A" ? `${match.scoreA}–${match.scoreB}` : `${match.scoreB}–${match.scoreA}`) : undefined,
      };
    }
    if (e.kind === "draw_published") vars = { ...vars, round: state.rounds[e.roundId]?.number };
    out.push({ kind: e.kind, eventKey: e.key, teamId, title: t.name, body: renderBody(sport, e.kind, vars), url });
  }
  return out;
}

/** Fast path, right after an engine action was saved. Never throws. */
export async function notifyFromChanges(code: string, changes: Change[], after: EngineState): Promise<void> {
  try {
    const events = eventsFromChanges(changes, after);
    if (events.length === 0) return;
    const loaded = await loadTournament(code);
    if (!loaded || !notificationsEnabled(loaded.meta.config)) return;
    const t = { name: loaded.meta.name, code, nameDisplay: loaded.meta.name_display };
    const now = Date.now();
    const messages = events.flatMap((e) => messagesForEvent(e, loaded.state, loaded.sport, t, now));
    const teamIds = [...new Set(messages.map((x) => x.teamId))];
    const rec = await recipients(loaded.meta.id, teamIds, false);
    if ((await enqueue(loaded.meta.id, messages, rec)) > 0) await dispatchQueued({ tournamentId: loaded.meta.id });
  } catch (e) {
    console.error("notifyFromChanges failed", e);
  }
}

/**
 * Scheduled messages (called by the scheduler every few minutes):
 * reminder the day before (from 18 h), "starting soon" (30 min before),
 * "not checked in yet" (30 min before the check-in closes).
 */
export async function queueScheduledNotifications(nowMs = Date.now()): Promise<number> {
  const admin = createAdminClient();
  const now = new Date(nowMs);
  const tomorrow = parisDatePlus(nowMs, 1);
  const parisHour = Number(isoToParis(now.toISOString()).time.slice(0, 2));
  const soon = new Date(nowMs + 30 * 60_000).toISOString();
  const tournaments = must(
    await admin
      .from("tournaments")
      .select("id, short_code, name, sport_slug, starts_at, checkin_closes_at, address, city, config, status")
      .in("status", ["published", "registration_closed", "check_in", "live"])
      .gte("starts_at", new Date(nowMs - 3600_000).toISOString())
      .lte("starts_at", new Date(nowMs + 2 * 86_400_000).toISOString()),
  );
  let queued = 0;
  for (const t of tournaments ?? []) {
    if (!t.short_code || !t.starts_at || !notificationsEnabled(t.config)) continue;
    const sport = getSport(t.sport_slug);
    if (!sport) continue;
    const kinds: { kind: NotificationKind; onlyNotCheckedIn: boolean }[] = [];
    const reminder = (t.config as { communication?: { reminderDayBefore?: boolean } } | null)?.communication?.reminderDayBefore !== false;
    if (reminder && isoToParis(t.starts_at).date === tomorrow && parisHour >= 18) kinds.push({ kind: "reminder_day_before", onlyNotCheckedIn: false });
    if (t.starts_at > now.toISOString() && t.starts_at <= soon && t.status !== "live") kinds.push({ kind: "tournament_starting", onlyNotCheckedIn: false });
    if (t.checkin_closes_at && t.checkin_closes_at > now.toISOString() && t.checkin_closes_at <= soon) kinds.push({ kind: "not_checked_in", onlyNotCheckedIn: true });
    if (kinds.length === 0) continue;
    // Paginated: a 1 024-team tournament is beyond max_rows (1000); an error is thrown, never a truncated list.
    const teams = await fetchAllRows((from, to) =>
      admin.from("teams").select("id, number, status").eq("tournament_id", t.id).in("status", ["registered", "checked_in"]).order("id").range(from, to),
    );
    for (const { kind, onlyNotCheckedIn } of kinds) {
      const list = teams.filter((x) => !onlyNotCheckedIn || x.status === "registered");
      const place = [t.address, t.city].filter(Boolean).join(", ");
      const vars: TemplateVars = {
        tournament: t.name,
        time: formatTime(kind === "not_checked_in" ? t.checkin_closes_at : t.starts_at),
        place: place || undefined,
      };
      const messages: Message[] = list.map((x) => ({
        kind,
        eventKey: `${kind}:${t.id}`,
        teamId: x.id,
        title: kind === "reminder_day_before" ? `${t.name} · ${formatDay(t.starts_at)}` : t.name,
        body: renderBody(sport, kind, vars),
        url: `${siteUrl()}/c/${t.short_code}?equipe=${x.number}`,
      }));
      const rec = await recipients(t.id, list.map((x) => x.id), kind !== "tournament_starting");
      queued += await enqueue(t.id, messages, rec);
    }
  }
  return queued;
}

/** Sends what is due. Expired push subscriptions are removed. */
export async function dispatchQueued(opts: { tournamentId?: string; limit?: number } = {}): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .select("id, channel, title, body, url, template, email, attempts, push_subscription_id, push_subscriptions (id, endpoint, p256dh, auth)")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at")
    .limit(opts.limit ?? 200);
  if (opts.tournamentId) query = query.eq("tournament_id", opts.tournamentId);
  const { data } = await query;
  let sent = 0;
  let failed = 0;
  const pushReady = setupVapid();
  const email = getMessages().notifications;
  await Promise.all(
    (data ?? []).map(async (n) => {
      let ok = false;
      let error: string | null = null;
      let gone = false;
      try {
        if (n.channel === "push") {
          const s = n.push_subscriptions as unknown as Sub | null;
          if (!s || !pushReady) {
            error = s ? "push not configured" : "subscription removed";
          } else {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: `${n.template}:${n.url}` }),
              { TTL: 900, urgency: n.template === "your_turn" ? "high" : "normal", timeout: 5000 },
            );
            ok = true;
          }
        } else if (n.channel === "email" && n.email) {
          const res = await sendEmail({
            to: n.email,
            subject: n.title ?? email.emailSubject,
            text: [n.body, "", n.url, "", email.emailFooter].join("\n"),
          });
          ok = res.ok;
          error = res.ok ? null : res.error ?? "email failed";
        } else {
          error = "channel disabled";
        }
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        gone = status === 404 || status === 410;
        error = e instanceof Error ? e.message.slice(0, 300) : "send failed";
      }
      if (ok) {
        sent++;
        await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), attempts: n.attempts + 1, error: null }).eq("id", n.id);
        if (n.push_subscription_id) await admin.from("push_subscriptions").update({ failed_count: 0, last_success_at: new Date().toISOString() }).eq("id", n.push_subscription_id);
      } else {
        failed++;
        const final = gone || n.attempts + 1 >= MAX_ATTEMPTS || error === "channel disabled" || error === "subscription removed";
        await admin
          .from("notifications")
          .update({ status: final ? "failed" : "queued", attempts: n.attempts + 1, error, scheduled_for: new Date(Date.now() + 60_000 * (n.attempts + 1)).toISOString() })
          .eq("id", n.id);
        if (gone && n.push_subscription_id) await admin.from("push_subscriptions").delete().eq("id", n.push_subscription_id);
      }
    }),
  );
  return { sent, failed };
}

/** For confirmation texts ("Vous serez prévenu·e…"). */
export function describeTeamTarget(code: string, number: number): string {
  return fmt(getMessages().notifications.following, { code, number });
}
