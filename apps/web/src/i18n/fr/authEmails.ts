/**
 * Emails sent by Supabase Auth (connection link, address check…). They are
 * turned into the HTML templates of supabase/templates by
 * scripts/build-auth-emails.ts, then copied into the Supabase dashboard in
 * production (docs/DEPLOIEMENT.md).
 */
export const authEmails = {
  brand: "OrgaSport",
  footer: ["Vous n'avez rien demandé ? Ignorez simplement cet email : rien ne change sur votre compte."],
  magicLink: {
    subject: "Votre lien de connexion OrgaSport",
    title: "Votre lien de connexion",
    preheader: "Un clic pour vous connecter, valable une heure.",
    body: "Touchez le bouton ci-dessous pour vous connecter à OrgaSport. Le lien fonctionne une seule fois et pendant une heure.",
    button: "Me connecter",
    tip: "Ouvrez le lien sur l'appareil où vous avez fait la demande : vous y retrouverez vos préférences.",
  },
  confirmation: {
    subject: "Bienvenue sur OrgaSport : confirmez votre adresse",
    title: "Bienvenue !",
    preheader: "Confirmez votre adresse pour terminer votre inscription.",
    body: "Votre compte OrgaSport est presque prêt. Touchez le bouton pour confirmer votre adresse email.",
    button: "Confirmer mon adresse",
    tip: "Le lien fonctionne une seule fois et pendant une heure.",
  },
  recovery: {
    subject: "Réinitialiser votre mot de passe OrgaSport",
    title: "Nouveau mot de passe",
    preheader: "Choisissez un nouveau mot de passe.",
    body: "Touchez le bouton pour choisir un nouveau mot de passe.",
    button: "Choisir un mot de passe",
    tip: "Le lien fonctionne une seule fois et pendant une heure.",
  },
  emailChange: {
    subject: "Confirmez votre nouvelle adresse email",
    title: "Nouvelle adresse email",
    preheader: "Confirmez le changement d'adresse de votre compte.",
    body: "Vous avez demandé à utiliser cette adresse pour votre compte OrgaSport. Touchez le bouton pour confirmer.",
    button: "Confirmer cette adresse",
    tip: "Si vous n'êtes pas à l'origine de ce changement, ignorez cet email.",
  },
} as const;
