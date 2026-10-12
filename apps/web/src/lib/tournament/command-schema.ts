import { z } from "zod";
import type { Command } from "@orgasport/engine";

/**
 * Validation of commands coming from the scoring table (never trust the
 * client). Mirrors the engine Command union.
 */
const id = z.string().uuid();
const side = z.enum(["A", "B"]);
const score = z.number().int().min(0).max(999);
const name = z.string().trim().max(80);
const player = z.object({ firstName: name.min(1), lastName: name.min(1) });

export const commandSchema: z.ZodType<Command> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("team.create"),
    name: name.nullish(),
    club: name.nullish(),
    players: z.array(player).min(1).max(20),
    checkIn: z.boolean().optional(),
    source: z.enum(["onsite", "organizer"]).optional(),
  }),
  z.object({
    type: z.literal("team.update"),
    teamId: id,
    name: name.nullish(),
    club: name.nullish(),
    seed: z.number().int().min(1).max(1024).nullish(),
    players: z.array(player).min(1).max(20).optional(),
  }),
  z.object({ type: z.literal("team.setStatus"), teamId: id, status: z.enum(["registered", "waitlist", "checked_in", "forfeit", "withdrawn"]) }),
  z.object({ type: z.literal("team.lateEntry"), teamId: id }),
  z.object({ type: z.literal("round.draw"), bracket: z.enum(["main", "consolation"]), seed: z.string().min(1).max(100) }),
  z.object({ type: z.literal("round.redraw"), roundId: id, seed: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("match.swapTeams"),
    a: z.object({ matchId: id, side }),
    b: z.object({ matchId: id, side }),
  }),
  z.object({ type: z.literal("match.setVenue"), matchId: id, venueId: id }),
  z.object({ type: z.literal("match.start"), matchId: id }),
  z.object({
    type: z.literal("match.score"),
    matchId: id,
    scoreA: score,
    scoreB: score,
    tiebreakA: score.nullish(),
    tiebreakB: score.nullish(),
  }),
  z.object({ type: z.literal("match.forfeit"), matchId: id, side: z.enum(["A", "B", "both"]) }),
  z.object({ type: z.literal("match.reopen"), matchId: id }),
  z.object({ type: z.literal("match.setFlag"), matchId: id, flag: z.enum(["score_submitted", "disputed", "clear"]) }),
  z.object({ type: z.literal("venue.add"), label: z.string().trim().min(1).max(30), reservedForFinals: z.boolean().optional() }),
  z.object({
    type: z.literal("venue.update"),
    venueId: id,
    label: z.string().trim().min(1).max(30).optional(),
    available: z.boolean().optional(),
    reservedForFinals: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("tournament.setStatus"),
    status: z.enum(["published", "registration_closed", "check_in", "live", "finished", "archived"]),
  }),
]) as unknown as z.ZodType<Command>;

export const commandRequestSchema = z.object({
  clientOpId: z.string().uuid(),
  /** When the action happened on the device (offline actions are sent later). */
  at: z.string().datetime({ offset: true }).optional(),
  command: commandSchema,
});
