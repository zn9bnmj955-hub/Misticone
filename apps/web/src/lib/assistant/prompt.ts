import { enabledSports } from "@orgasport/sports";

/**
 * System prompt of the assistant. Stable text only (no date, no person):
 * per-request facts go in a short context note after it, so the prefix can
 * be cached.
 */
export function systemPrompt(): string {
  const sports = enabledSports()
    .map((s) => s.name)
    .join(", ");
  return `Tu es l'assistant d'OrgaSport, un site français de gestion de concours sportifs (pour l'instant : ${sports}).

Ton rôle (ces deux domaines sont autorisés, réponds-y volontiers) :
- le sport : règles du jeu et règlements, histoire, techniques, conseils de jeu et d'entraînement, organisation d'un concours (formats, tirage, terrains, arbitrage, table de marque) ;
- le site OrgaSport : ses fonctions, les prix et l'achat d'un lien concours, l'inscription, retrouver son tirage, le tirage au sort et le cadrage, les concours B et C, les concours sur 2 jours, le PIN des bénévoles et la table de marque, les notifications, la clôture et la conservation des résultats ;
- aider un organisateur à choisir un format de concours.

Règles impératives :
1. Toute information officielle (dates, horaires, lieux, tirages, terrains, adversaires, résultats, inscrits, prix, règlement d'un concours) vient UNIQUEMENT des outils. N'invente jamais ces informations. Ne donne jamais d'heure de fin ni de durée pour un concours ou une partie : c'est impossible à prévoir. Si un outil ne renvoie rien ou renvoie une erreur, dis-le simplement et propose une solution (donner le code du concours, ouvrir « Mon tirage », contacter l'organisateur).
2. Pour une question de règle ou d'utilisation du site, appelle d'abord knowledge_search. Ce qu'elle renvoie passe avant tes connaissances générales. Si tu complètes avec tes connaissances générales, dis-le (« en règle générale… ») et rappelle que le règlement du concours prime.
3. Une question de sport ou sur le site n'est jamais hors sujet, même générale (« comment marche le PIN ? », « que dit le règlement sur le but ? »). Hors sujet (politique, santé, devoirs, code informatique, autre sujet sans lien avec le sport ou le site) : refuse poliment en une phrase et propose une question sur le sport ou le site.
4. Ne demande jamais et ne répète jamais de données personnelles (numéro de licence, téléphone, email).
5. Réponds en français, simplement, sans jargon, en 1 à 5 phrases courtes ou une petite liste. Heures écrites « 15 h 40 ». Donne le lien utile renvoyé par les outils quand il y en a un.
6. Termine TOUJOURS ta réponse par 2 ou 3 questions de suite courtes que la personne pourrait poser, au format exact :
<suggestions>["Question 1 ?", "Question 2 ?"]</suggestions>`;
}

/** Facts about this request (who asks, where, when): sent as the first user turn note. */
export function contextNote(ctx: { signedIn: boolean; clubName: string | null; city: string | null; sport: string | null; todayLabel: string; page: string | null }): string {
  const lines = [
    `Date du jour : ${ctx.todayLabel}.`,
    ctx.signedIn ? "La personne est connectée à son compte." : "La personne n'est pas connectée (invitée).",
    ctx.clubName ? `Elle gère le club « ${ctx.clubName} » (mode club).` : null,
    ctx.city ? `Sa ville : ${ctx.city}.` : null,
    ctx.sport ? `Sport sélectionné sur le site : ${ctx.sport}.` : null,
    ctx.page ? `Page ouverte : ${ctx.page}.` : null,
  ];
  return `[Contexte, ne pas citer] ${lines.filter(Boolean).join(" ")}`;
}

/** Lowercase, no accents, punctuation as spaces: "Règlement !" → " reglement ". */
function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/]+/g, " ")} `;
}

// Words that put a question inside the assistant's scope (sport or the site).
const IN_SCOPE = [
  "sport", "sportif", "petanque", "boule", "boules", "but", "cochonnet", "mene", "menes", "pointer", "pointeur", "tirer", "tireur",
  "carreau", "triplette", "doublette", "tete a tete", "fanny", "football", "foot", "regle", "regles", "reglement", "arbitre",
  "arbitrage", "licence", "federation", "ffpjp", "joueur", "joueurs", "equipe", "equipes", "partie", "parties", "match", "matchs",
  "score", "terrain", "terrains", "jeu", "jouer", "entrainement", "concours", "tournoi", "poule", "poules", "cadrage", "office",
  "exempt", "complementaire", "b/c", "tirage", "club", "clubs", "orgasport", "site", "pin", "benevole", "benevoles",
  "table de marque", "inscription", "inscrire", "inscrit", "inscrits", "compte", "prix", "tarif", "tarifs", "payer", "paiement",
  "lien concours", "qr", "affiche", "notification", "notifications", "organiser", "organisateur", "resultat", "resultats",
  "classement", "2 jours", "deux jours", "assistant",
];
// Clearly unrelated subjects (only refused when no in-scope word appears).
const OFF_TOPIC = [
  "politique", "election", "elections", "president", "gouvernement", "depute", "vote", "voter", "sante", "medecin", "maladie",
  "medicament", "symptome", "symptomes", "devoir", "devoirs", "dissertation", "equation", "mathematiques", "python", "javascript",
  "programmation", "coder", "recette", "cuisine", "bitcoin", "crypto", "bourse", "horoscope", "religion", "poeme",
];

function mentions(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(` ${w} `));
}

/**
 * Cheap first look at a question: "off_topic" only when it clearly talks
 * about something else (politics, health, homework, code…) and never about
 * sport or the site. The answer is then a polite refusal without calling
 * the model; anything else goes to the model, whose prompt draws the line.
 */
export function questionScope(question: string): "in_scope" | "off_topic" | "unclear" {
  const text = normalize(question);
  if (mentions(text, IN_SCOPE)) return "in_scope";
  if (mentions(text, OFF_TOPIC)) return "off_topic";
  return "unclear";
}
