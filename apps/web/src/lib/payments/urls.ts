/** Where the browser goes around a checkout (relative paths; Stripe gets them prefixed with the site URL). */
export const paymentResultPath = (tournamentId: string, paymentId?: string) =>
  `/club/concours/${tournamentId}/paiement${paymentId ? `?p=${paymentId}` : ""}`;

export const checkoutCancelPath = (tournamentId: string) => `/club/concours/${tournamentId}/modifier?etape=summary&annule=1`;

/** The summary step of the creation form, to try again. */
export const summaryPath = (tournamentId: string) => `/club/concours/${tournamentId}/modifier?etape=summary`;

export const simulationPath = (sessionId: string) => `/paiement/simulation/${sessionId}`;

export const SIMULATED_SESSION_RE = /^sim_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
