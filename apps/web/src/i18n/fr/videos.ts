/**
 * Texts of the videos area: « Découvrir et tutoriels » page (/decouvrir), the
 * video player, and the links from the landing page, the footer and the club
 * space. Transcripts follow apps/videos/src/data/script.json (same timings).
 */
export const videos = {
  footerLink: "Découvrir",
  landingLink: "Toutes les vidéos et le tutoriel",
  clubLink: "Tutoriel vidéo : votre lien concours pas à pas",
  page: {
    title: "Découvrir et tutoriels",
    description:
      "OrgaSport en vidéo : la découverte en 75 secondes, puis le tutoriel pas à pas pour acheter et utiliser votre lien concours.",
    eyebrow: "Vidéos",
    intro:
      "Deux vidéos pour tout comprendre : OrgaSport en 75 secondes, puis le pas à pas pour créer, payer et utiliser votre lien concours. Sous-titres en français, jamais de lecture automatique.",
    home: "Accueil",
    ctaTitle: "Prêt à organiser votre concours ?",
    ctaText: "Créez le compte de votre club : le premier concours se prépare en quelques minutes.",
    ctaButton: "Créer un compte club",
  },
  discovery: {
    title: "OrgaSport en 75 secondes",
    text: "Du QR code au tableau final : ce que vivent les joueurs, la table de marque et le club, le jour du concours.",
    duration: "1 min 15",
    transcript: [
      "Le jour du concours, tout va très vite.",
      "Soixante-quatre équipes, trente-deux terrains, et tout le monde veut savoir où il joue.",
      "Avec OrgaSport, un joueur scanne le QR code et trouve son match en dix secondes.",
      "Le tirage, les terrains, les scores : tout est calculé automatiquement, en direct.",
      "Un score saisi à la table de marque, et chaque équipe reçoit son prochain match.",
      "Même quand le réseau tombe au fond du terrain.",
      "Pétanque, football… OrgaSport s'adapte à votre sport.",
      "Pour les clubs, créer et publier un concours prend trois minutes.",
      "OrgaSport. Vos concours, de l'inscription aux résultats.",
    ],
  },
  tutorial: {
    title: "Acheter et utiliser son lien concours",
    text: "Le tutoriel pas à pas : création du concours, terrains nécessaires, paiement sécurisé, publication, puis le jour J à la table de marque.",
    duration: "2 min 30",
    chapters: [
      { at: 8, label: "Créer le concours" },
      { at: 22, label: "Un formulaire déjà rempli" },
      { at: 40, label: "Terrains nécessaires" },
      { at: 55, label: "Paiement sécurisé" },
      { at: 72, label: "Lien, QR code et affiche" },
      { at: 85, label: "Pointage et tirage" },
      { at: 100, label: "Scores et annulation" },
      { at: 118, label: "Côté joueurs" },
    ],
    transcript: [
      "Voici comment créer, payer et utiliser votre lien concours.",
      "Dans votre espace club, touchez « Créer un concours », puis choisissez le sport.",
      "Chaque réponse a une valeur par défaut adaptée au sport. Votre brouillon s'enregistre tout seul.",
      "OrgaSport calcule les terrains nécessaires au premier tour. Pas sûr du format ? « Aide-moi à choisir ».",
      "Vérifiez le récapitulatif, puis payez en toute sécurité. Aucune donnée bancaire ne passe par OrgaSport.",
      "Dès le paiement confirmé, votre concours est publié : lien, QR code et affiche sont prêts.",
      "Le jour du concours, pointez les équipes présentes et lancez le tirage.",
      "Saisissez les scores en une ligne. Une erreur ? Tout est dans l'historique, et tout s'annule.",
      "Les joueurs suivent tout en direct sur leur téléphone, et sont prévenus quand c'est à eux.",
      "À vous de jouer ! Créez votre premier concours sur OrgaSport.",
    ],
  },
  player: {
    play: "Lire la vidéo « {title} » ({duration})",
    subtitles: "Français",
    chapters: "Chapitres",
    chapterAt: "Lire à partir de {time} : {label}",
    transcript: "Lire le texte de la vidéo",
    noVideo: "Votre navigateur ne peut pas lire cette vidéo.",
    download: "Télécharger (MP4)",
    mobileHint: "Sur téléphone, la vidéo s'ouvre au format vertical.",
  },
};
