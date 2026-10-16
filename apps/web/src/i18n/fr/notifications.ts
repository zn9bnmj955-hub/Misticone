/** Notifications ("À vous de jouer"): emails and on-screen texts. */
export const notifications = {
  emailSubject: "OrgaSport · notification",
  emailFooter: "Vous recevez ce message car vous avez accepté les notifications OrgaSport. Pour ne plus les recevoir, désactivez-les dans votre profil.",
  following: "Notifications activées pour l'équipe {number} du concours {code}.",

  /** Round names inside notification texts (« Tirage publié : 1/4 de finale »). */
  rounds: {
    cadrage: "cadrage",
    partie: "{n}e partie",
    partie1: "1re partie",
    final: "finale",
    semifinal: "1/2 finale",
    quarterfinal: "1/4 de finale",
    round_of_16: "1/8 de finale",
    round_of_32: "1/16 de finale",
    round_of_64: "1/32 de finale",
    round_of_128: "1/64 de finale",
    round: "tour {n}",
    pool: "poules, partie {n}",
    swiss: "partie {n}",
    league: "journée {n}",
    melee: "partie {n}",
  },
  /** Brackets: the A has no prefix. */
  brackets: { consolation: "concours B", consolation_c: "concours C" },
  bracketRound: "{bracket}, {round}",

  /** Opt-in button (app pages and terrain pages). */
  button: "Me prévenir quand c'est à moi",
  asking: "Répondez à la question du navigateur : « Autoriser ».",
  enabled: "Vous serez prévenu·e",
  enabledTeam: "Vous serez prévenu·e dès que le match de l'équipe {number} est prêt.",
  denied: "Les notifications sont bloquées pour ce site. Pour les réactiver : touchez le cadenas (ou « ⓘ ») à côté de l'adresse, puis « Notifications » → « Autoriser », et rechargez la page.",
  unsupported: "Ce navigateur ne reçoit pas les notifications. Rien ne change pour le reste : votre match reste affiché sur la page du concours.",
  error: "L'activation n'a pas abouti. Vérifiez votre connexion et réessayez.",
  stop: "Ne plus me prévenir",

  /** iPhone / iPad Safari, site not added to the home screen. */
  iosTitle: "Sur iPhone : une étape avant",
  iosText: "Les notifications ne fonctionnent sur iPhone et iPad qu'une fois le site ajouté à l'écran d'accueil.",
  iosStep: "Touchez Partager, puis « Sur l'écran d'accueil ». Ouvrez ensuite OrgaSport depuis l'icône et touchez « Me prévenir ».",
  iosShare: "Bouton Partager de Safari",
  iosMenu: "Sur l'écran d'accueil",
  iosIllustration: "Illustration : le bouton Partager en bas de Safari, puis « Sur l'écran d'accueil » dans le menu.",

  /** Profile section. */
  profile: {
    title: "Notifications",
    intro: "« À vous ! Terrain 12 · 15 h 40 » sur votre téléphone dès que votre match est prêt, plus le tirage, le score validé et le rappel de la veille. Jamais de publicité.",
    deviceOn: "Activées sur cet appareil.",
    deviceOff: "Désactivées sur cet appareil.",
    enable: "Activer sur cet appareil",
    disable: "Désactiver sur cet appareil",
    emailTitle: "Par email, en secours",
    emailOn: "Si aucun de vos appareils ne peut recevoir la notification, on vous écrit à {email} pour les messages importants (votre match, début du concours, rappel de la veille, pointage).",
    emailOff: "Les emails de secours sont désactivés.",
    emailEnable: "Activer les emails de secours",
    emailDisable: "Désactiver les emails de secours",
    guest: "Sans compte, les notifications concernent seulement les équipes suivies sur cet appareil. Avec un compte, elles suivent aussi toutes vos inscriptions.",
    teamsTitle: "Équipes suivies sur cet appareil",
    teamsEmpty: "Aucune équipe suivie. Sur la page d'un concours, ouvrez votre équipe puis touchez « Me prévenir quand c'est à moi ».",
    team: "Concours {code} · équipe {number}",
    stopTeam: "Arrêter",
    saved: "Enregistré.",
  },
};
