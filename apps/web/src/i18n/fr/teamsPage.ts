/** Public page « Résultats par équipes » (/c/CODE/equipes), the list of registered teams before the draw. */
export const teamsPage = {
  title: "Résultats par équipes",
  registered: "Liste des inscrits",
  count: "{n} équipes",
  countOne: "1 équipe",
  back: "Retour au tirage",
  letters: "Aller à la lettre",
  hint: "Ctrl+F pour chercher une équipe, F5 pour actualiser la page.",
  empty: "Aucune équipe inscrite pour l'instant.",
  number: "N°",
  team: "Équipe",
  path: "Parcours",
  status: {
    registered: "Inscrite",
    checked_in: "Pointée",
    waitlist: "Liste d'attente",
    forfeit: "Forfait",
    withdrawn: "Retirée",
  },
  /** One line per bracket the team played: « Concours A : éliminée en 1/4 de finale ». */
  bracket: "{bracket} : {state}",
  inPlay: "en lice",
  winner: "vainqueur",
  out: "éliminée en {round}",
  outPools: "éliminée en poules",
  done: "terminé",
  /** One line per game, from the team's point of view. */
  won: "gagné",
  lost: "perdu",
  draw: "nul",
  versus: "c. {n}",
  /** Path line of a B or C game: « B · 1re partie ». */
  bracketRound: "{bracket} · {label}",
  letter: { main: "A", consolation: "B", consolation_c: "C" },
  office: "Office",
  exempt: "Exempt",
  toPlay: "à jouer",
} as const;
