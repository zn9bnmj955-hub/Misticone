/** Explanation of the volunteer PIN, shown where PINs are created and on the PIN entry screen. */
export const pinHelp = {
  title: "Le PIN, comment ça marche ?",
  organizer:
    "Le PIN est un code à donner à un bénévole qui n'a pas de compte : il ouvre la table de marque de ce concours seulement, pendant 24 h, sur son téléphone. Vous pouvez le révoquer à tout moment.",
  volunteer:
    "Le PIN est le code que l'organisateur vous a donné : il ouvre la table de marque de ce concours seulement, pendant 24 h, sur ce téléphone. Pas besoin de compte.",
  stepsLabel: "En 3 étapes",
  steps: [
    { title: "Créer", text: "L'organisateur crée un PIN au nom du bénévole." },
    { title: "Donner", text: "Il lui donne le code de vive voix ou par message." },
    { title: "Le bénévole saisit", text: "Sur son téléphone, il ouvre la table de marque du concours et tape le PIN." },
  ],
  tableLink: "Adresse de la table de marque : {url}",
} as const;
