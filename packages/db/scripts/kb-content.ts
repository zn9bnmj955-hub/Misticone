/**
 * Knowledge base of the assistant (demo content, editable in the admin).
 * Plain-language summaries written for OrgaSport — not copies of official
 * texts. Paragraphs are separated by blank lines: each paragraph becomes a
 * searchable chunk. The official rules of the federation and the rules of
 * each tournament always prevail.
 */
export type KbDoc = { title: string; sport: string | null; source: string | null; body: string };

export const KB_DOCS: KbDoc[] = [
  {
    title: "Pétanque : déroulement d'une partie",
    sport: "petanque",
    source: "https://www.ffpjp.org",
    body: `Une partie de pétanque oppose deux équipes : tête-à-tête (1 joueur contre 1, 3 boules chacun), doublette (2 contre 2, 3 boules par joueur) ou triplette (3 contre 3, 2 boules par joueur).

Une partie se joue en 13 points : la première équipe qui atteint 13 points gagne. C'est ce qu'on appelle souvent « la partie en 13 ». Certains concours fixent un autre score ou une limite de temps : le règlement du concours prime.

Une partie se compose de « mènes ». À chaque mène, une équipe lance le but (le cochonnet), puis les équipes jouent toutes leurs boules. À la fin de la mène, l'équipe dont la boule est la plus proche du but marque un point par boule mieux placée que la meilleure boule adverse.

Au début de la partie, un tirage au sort désigne l'équipe qui trace (ou pose) le cercle de lancer et lance le but. Ensuite, c'est l'équipe qui a gagné la mène précédente qui lance le but.

Le joueur lance depuis le cercle, les deux pieds à l'intérieur et sans le toucher, et ne doit pas quitter le sol avant que sa boule soit retombée. Le cercle mesure de 35 à 50 centimètres de diamètre.

Le but doit se trouver entre 6 et 10 mètres du bord intérieur du cercle pour les adultes, et assez loin de tout obstacle ou d'une zone interdite. Les cas où le lancer du but n'est pas valable sont précisés par le règlement officiel de la fédération.

L'équipe qui a lancé le but joue la première boule. Ensuite, c'est toujours l'équipe qui n'a pas « le point » (dont aucune boule n'est la plus proche) qui rejoue, jusqu'à reprendre le point ou épuiser ses boules.

Chaque joueur dispose d'une minute pour jouer sa boule, à partir du moment où la boule ou le but précédent s'est arrêté.

Pointer, c'est lancer sa boule pour qu'elle s'arrête le plus près possible du but. Tirer, c'est lancer sa boule pour chasser une boule adverse (ou le but). Un « carreau » est un tir où la boule tireuse prend exactement la place de la boule frappée.

Perdre 13 à 0, c'est « être fanny » : une tradition populaire, sans conséquence au classement.`,
  },
  {
    title: "Pétanque : matériel",
    sport: "petanque",
    source: "https://www.ffpjp.org",
    body: `En compétition officielle, les boules sont en métal, d'un diamètre de 70,5 à 80 millimètres et d'un poids de 650 à 800 grammes. Elles portent les marques du fabricant et un numéro.

Le but (cochonnet) est en bois ou en matière synthétique, d'environ 30 millimètres de diamètre.

Pour un concours amical, chacun peut jouer avec ses boules de loisir ; pour un concours officiel réservé aux licenciés, les boules doivent être homologuées.`,
  },
  {
    title: "Pétanque : formats de concours",
    sport: "petanque",
    source: null,
    body: `Élimination directe : les équipes sont tirées au sort par paires, le vainqueur continue, le perdant est éliminé (ou va au concours complémentaire). Avec un nouveau tirage à chaque tour, les rencontres du tour suivant sont tirées au sort parmi les gagnants ; avec un tableau fixe, le parcours jusqu'à la finale est connu dès le départ.

Concours complémentaire : un second tableau pour les équipes éliminées tôt (par exemple les perdants du premier tour), pour que tout le monde joue plusieurs parties.

Poules puis phase finale : par poules de 4, chaque équipe joue 2 ou 3 parties (gagnants contre gagnants, perdants contre perdants, puis une partie de barrage) ; les 2 premiers de chaque poule vont dans le tableau final.

Système suisse (parties fixes avec classement) : chaque équipe joue le même nombre de parties, contre des adversaires au bilan proche. Le classement final se fait aux victoires, puis à la différence de points.

Mêlée tournante : chacun s'inscrit seul, les équipes sont refaites à chaque partie, et le classement est individuel.

Exempt : quand le nombre d'équipes est impair, une équipe ne joue pas un tour et le gagne automatiquement (score de forfait, par défaut 13 à 0).`,
  },
  {
    title: "Football à 7 : règles courantes en tournoi",
    sport: "football",
    source: "https://www.fff.fr",
    body: `Au football à 7, chaque équipe aligne 7 joueurs dont un gardien, sur un terrain plus petit qu'au football à 11. Les remplacements sont en général libres et illimités (« remplacements volants »).

Les matchs de tournoi sont courts : souvent 2 mi-temps de 10 minutes, ou un seul temps de 15 à 20 minutes. La durée exacte est fixée par le règlement du tournoi.

En phase de poules, une victoire rapporte en général 3 points, un match nul 1 point et une défaite 0 point. En cas d'égalité au classement, on regarde la différence de buts, puis les buts marqués, puis la confrontation directe.

En phase à élimination directe, un match nul est souvent départagé par une séance de tirs au but.

Les règles de hors-jeu, de remise en jeu et de contacts varient d'un tournoi à l'autre (catégories jeunes, loisir, entreprise) : le règlement du tournoi prime toujours.`,
  },
  {
    title: "Aide OrgaSport : retrouver son match",
    sport: null,
    source: null,
    body: `Chaque concours a un code de 4 caractères (par exemple 7KQ2), écrit sur l'affiche avec un QR code. Sur l'accueil d'OrgaSport, tapez le code dans « Retrouver mon tirage » ou scannez le QR code.

Sur la page du concours, tapez votre numéro d'équipe ou votre nom dans « Trouver mon équipe » : vous voyez votre prochain match, votre terrain, l'heure et votre adversaire, puis l'historique de vos parties. La page fonctionne même sans connexion internet rapide et sur un vieux téléphone.

Touchez « C'est mon équipe » : votre équipe sera mise en avant automatiquement la prochaine fois, sur cet appareil, sans créer de compte.

Avec un compte joueur, le bouton « Mon tirage » ouvre directement votre prochain match quand vous jouez un concours en cours.

Pour être prévenu quand votre match est prêt (« À vous ! Terrain 12 · 15 h 40 »), touchez « Me prévenir quand c'est à moi ». Sur iPhone, il faut d'abord ajouter le site à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »).`,
  },
  {
    title: "Aide OrgaSport : s'inscrire à un concours",
    sport: null,
    source: null,
    body: `Ouvrez l'onglet « Concours », choisissez un concours, puis touchez « S'inscrire ». Le formulaire s'adapte au concours : nombre de joueurs, numéro de licence si le concours est réservé aux licenciés, contact du capitaine, acceptation du règlement.

Le numéro de licence sert uniquement à l'organisateur : il n'est jamais affiché publiquement. Le contact du capitaine (téléphone ou email) n'est visible que par l'organisateur.

Après l'inscription, vous recevez votre numéro d'équipe, un fichier pour l'ajouter à votre agenda, et vous pouvez activer les notifications. Si le concours est complet, votre équipe est placée sur liste d'attente.

L'inscription (la mise) se règle sur place, à la table de marque, le jour du concours. Pensez à pointer votre équipe à la table de marque avant l'heure limite indiquée.`,
  },
  {
    title: "Aide OrgaSport : organiser un concours (lien concours)",
    sport: null,
    source: null,
    body: `Un club achète un « lien concours » pour chaque concours. Depuis l'espace club, touchez « Créer un concours » : un formulaire en étapes propose des réglages par défaut adaptés au sport, et le brouillon est enregistré automatiquement.

Les étapes : qui gère le concours, informations générales (date, heure, adresse), participants, argent (mise, dotation), déroulement et tirage, terrains, communication, puis récapitulatif et paiement. Un club pressé peut passer directement au récapitulatif avec les réglages par défaut.

Le bouton « Aide-moi à choisir » propose un format adapté au nombre d'équipes, aux terrains disponibles et à l'heure de début, avec l'heure de fin estimée.

Le paiement se fait sur la page sécurisée de Stripe (carte bancaire, Apple Pay, Google Pay). Aucune donnée bancaire ne passe par OrgaSport. Le concours est publié automatiquement dès que Stripe confirme le paiement, avec son lien court, son QR code et son affiche A4.

Les codes PIN des bénévoles de la table de marque sont envoyés par email à l'organisateur au moment de la publication.`,
  },
  {
    title: "Aide OrgaSport : la table de marque",
    sport: null,
    source: null,
    body: `La table de marque s'ouvre depuis la page du concours (/c/CODE/table), avec le compte de l'organisateur ou un code PIN donné aux bénévoles.

Elle permet de pointer les équipes, d'inscrire sur place, de lancer le tirage (ou de le laisser se faire automatiquement à l'heure prévue), d'attribuer les terrains, de saisir les scores et de voir le classement.

Saisie rapide d'un score : tapez le numéro du terrain puis les deux scores, par exemple « 12 13 7 », puis Entrée.

Toute action peut être corrigée : échanger deux équipes, refaire le tirage d'un tour, déplacer un match, déclarer un forfait, corriger un score. L'onglet Historique liste toutes les actions avec un bouton « Annuler ».

Si le réseau coupe, les saisies restent sur l'appareil et partent automatiquement au retour du réseau. Un témoin « En ligne » ou « Hors ligne » reste toujours visible. En secours, l'onglet Impression imprime le tirage, les feuilles de match et le classement.`,
  },
];
