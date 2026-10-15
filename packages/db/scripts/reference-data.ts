/**
 * Reference data shared by the local demo seed (generate-seed.ts) and the
 * production data file (generate-reference.ts): prices, settings and the
 * placeholders of the legal pages. Everything here is editable afterwards in
 * the administration.
 */

export type PricingPlanSeed = {
  code: string;
  label: string;
  description: string;
  price_cents: number;
  max_teams?: number;
  sort_order: number;
};

export const PRICING_PLANS: PricingPlanSeed[] = [
  {
    code: "lien-concours",
    label: "Lien concours",
    description: "Paiement unique pour un concours : inscriptions en ligne, tirage, table de marque, affiche et résultats en direct.",
    price_cents: 2900,
    sort_order: 10,
  },
  {
    code: "petit-concours",
    label: "Petit concours (16 équipes max.)",
    description: "Paiement unique pour un concours jusqu'à 16 équipes : inscriptions en ligne, tirage, table de marque, affiche et résultats en direct.",
    price_cents: 1900,
    max_teams: 16,
    sort_order: 20,
  },
];

export const APP_SETTINGS: [key: string, value: unknown, description: string][] = [
  ["ai.model", "claude-haiku-5-5", "Modèle de l'assistant"],
  ["ai.daily_quota", { guest: 5, account: 20, paying_club: 100 }, "Questions par jour"],
  ["ai.monthly_budget_eur", 20, "Plafond de dépense mensuel de l'assistant"],
  ["features.sms", false, "Notifications SMS (option payante, désactivée)"],
  ["features.paypal", false, "PayPal via Stripe"],
  ["ai.enabled", true, "Assistant activé"],
  ["ai.usd_to_eur", 0.92, "Taux de conversion dollar → euro pour le suivi des coûts"],
  ["ai.pricing", {}, "Prix par million de jetons (vide = prix par défaut du modèle)"],
];

export const LEGAL_PAGES: { slug: string; title: string }[] = [
  { slug: "mentions-legales", title: "Mentions légales" },
  { slug: "cgv", title: "Conditions générales de vente" },
  { slug: "confidentialite", title: "Politique de confidentialité" },
  { slug: "cookies", title: "Cookies" },
];
