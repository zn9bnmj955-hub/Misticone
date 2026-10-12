/**
 * Result of a club-space server action, already worded for the person
 * (texts come from i18n on the server). `link` carries an extra URL to show
 * (e.g. an invitation link when the email could not be sent).
 */
export type ActionState = { ok: true; message: string; link?: string } | { ok: false; error: string } | null;
