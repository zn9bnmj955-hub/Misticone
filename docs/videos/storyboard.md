# Vidéos OrgaSport — storyboard

> Version 2 · 17 oct. 2026 : pétanque seule (plus de ballon ni de football), tirages au format de la page publique,
> cadrage et concours B / C, boule argent foncé gravée ORGASPORT (celle de l'accueil), terrains sans clignotement.
> Version 1 · 12 oct. 2026. Vous m'avez donné carte blanche pour enchaîner les phases : je pars sur ce storyboard et je
> fabrique les vidéos. Tout reste modifiable (textes, durées, couleurs, ordre des plans) : dites-moi ce qui ne vous plaît pas et je
> regénère les fichiers.

Deux vidéos, chacune en **16:9** (site, YouTube) et **9:16** (TikTok, Reels). Réalisées avec **Remotion** (vidéos écrites en
React, rendues en MP4) et de la 3D légère avec **React Three Fiber**.

## Ambiance commune

- **Univers** : un boulodrome stylisé, nocturne et lumineux, flottant dans un espace bleu nuit (« Cobalt » #0b1640 → #070c24).
  Lignes de terrain qui brillent, sol réfléchissant, poussière lumineuse en suspension.
- **Couleurs** : celles du site (direction C « Direct ») — bleu électrique et noir, cyan pour les mises en avant,
  rouge « direct » réservé aux pastilles « en cours ». Aucun autre sport que la pétanque n'apparaît.
- **Typographie** : Saira (la police du site), titres très gras et condensés, chiffres alignés pour les scores et les horaires.
  Les mots arrivent par glissement + flou qui se dissipe.
- **Mouvement** : caméra lente et fluide (travellings, survols), transitions par « morphing » (une boule devient un point de
  données, une carte devient un écran).
- **Musique** : électro ambiante lumineuse, 100 BPM, nappes + arpège + pulsation douce. Composée par programme pour ce projet
  (donc libre de droits) ; remplaçable plus tard par une musique sous licence.
- **Voix off** : texte écrit ci-dessous, piste laissée vide (enregistrement ou synthèse vocale plus tard). Sous-titres français
  fournis (fichiers .vtt), donc les vidéos se comprennent sans le son.

---

## Vidéo 1 — « OrgaSport en 75 secondes » (découverte, sert aussi de publicité pour les clubs)

Durée : 75 s · 30 images/s.

| # | Temps | Image | Texte à l'écran | Voix off |
|---|---|---|---|---|
| 1 | 0–6 s | Nuit. Une boule de pétanque argent très foncé, lisse, gravée « ORGASPORT » (celle de l'accueil), tombe au ralenti dans le noir, touche un sol réfléchissant : l'onde de choc dessine les lignes lumineuses d'un terrain. | « Le jour du concours… » | « Le jour du concours, tout va très vite. » |
| 2 | 6–14 s | Survol du boulodrome lumineux : 32 terrains numérotés s'allument un par un, des silhouettes de joueurs stylisées (bâtons lumineux). | « 64 équipes · 32 terrains · 1 tirage » | « Soixante-quatre équipes, trente-deux terrains, et tout le monde veut savoir où il joue. » |
| 3 | 14–22 s | La caméra plonge vers un téléphone flottant : on scanne un QR code, la page s'ouvre. Gros plan sur la carte « À vous ! Terrain 12 · 2e partie », puis le tableau « Résultats 2e partie » (colonnes Terrain, Équipe, Équipe, Score). | « Votre match en 10 secondes. » | « Avec OrgaSport, un joueur scanne le QR code et trouve son match en dix secondes. » |
| 4 | 22–32 s | Les boules du terrain se transforment en points de données qui volent et s'assemblent en un tableau de tirage 3D (arbre qui se construit étage par étage). | « Tirage automatique · terrains attribués · en direct » | « Le tirage, les terrains, les scores : tout est calculé automatiquement, en direct. » |
| 5 | 32–40 s | Écran de la table de marque en 3D (panneaux inclinés) : saisie « 12 13 7 », le score se pose, le tableau se met à jour, une notification part vers trois téléphones. | « Un score saisi, tout le monde est prévenu. » | « Un score saisi à la table de marque, et chaque équipe reçoit son prochain match. » |
| 6 | 40–47 s | Coupure de réseau stylisée (le signal se brouille), le badge « Hors ligne · 2 saisies en attente » apparaît, puis le signal revient et les saisies partent. | « Même sans réseau. » | « Même quand le réseau tombe au fond du terrain. » |
| 7 | 47–55 s | Au-dessus du boulodrome, trois tableaux se posent : « Concours A · Résultats Cadrage » (avec des équipes « Office »), « Concours B · Résultats 1re partie », « Concours C · Résultats 1re partie ». | « Cadrage, Office, concours B et C : tout est prévu. » | « Cadrage, qualifiés d'office, concours B et C : le règlement est appliqué tout seul. » |
| 8 | 55–65 s | Côté club : un formulaire se construit en cartes 3D, « Payer et publier » est touché, le lien court « /c/7KQ2 », le QR code et l'affiche A4 sortent comme d'une imprimante lumineuse. | « Créez votre concours en 3 minutes. » | « Pour les clubs, créer et publier un concours prend trois minutes. » |
| 9 | 65–75 s | Recul de la caméra : le boulodrome devient une carte de France constellée de concours. Logo OrgaSport, adresse du site. | « OrgaSport · vos concours, de l'inscription aux résultats » | « OrgaSport. Vos concours, de l'inscription aux résultats. » |

**Version 9:16** : mêmes plans recadrés en vertical (le téléphone et les cartes au centre, textes plus gros, 2 lignes max).

---

## Vidéo 2 — « Acheter et utiliser son lien concours » (tutoriel, 2 min 30)

Durée : 150 s · 30 images/s. Ton : pas à pas, calme ; l'interface est montrée telle qu'elle est sur le site (captures animées
dans des écrans 3D), avec un curseur ou un doigt qui guide.

| # | Temps | Étape | Texte à l'écran | Voix off |
|---|---|---|---|---|
| 1 | 0–8 s | Titre sur fond de boulodrome lumineux. | « Votre lien concours, pas à pas » | « Voici comment créer, payer et utiliser votre lien concours. » |
| 2 | 8–22 s | Espace club → « Créer un concours » → choix des équipes (tête-à-tête, doublettes, triplettes ; pas de question de sport). | « 1. Créer le concours » | « Dans votre espace club, touchez “Créer un concours”, puis choisissez vos équipes : doublettes, triplettes… » |
| 3 | 22–40 s | Étapes du formulaire qui défilent, valeurs par défaut déjà remplies (cadrage après la 1re partie, concours B), barre de progression, « Brouillon enregistré ». | « Tout est prérempli. Le brouillon s'enregistre tout seul. » | « Chaque réponse a déjà une valeur par défaut, concours B compris. Votre brouillon s'enregistre tout seul. » |
| 4 | 40–55 s | Étape Terrains : « 64 doublettes : 32 terrains nécessaires. Vous en avez 20 : 12 parties attendront qu'une place se libère. » (jamais d'heure de fin) ; bouton « Aide-moi à choisir ». | « 2. Les terrains nécessaires sont calculés » | « OrgaSport calcule les terrains nécessaires au premier tour. Pas sûr du format ? “Aide-moi à choisir”. » |
| 5 | 55–72 s | Récapitulatif, code promo, « Payer et publier » → page de paiement Stripe (carte, Apple Pay, Google Pay). | « 3. Paiement sécurisé par Stripe » | « Vérifiez le récapitulatif, puis payez en toute sécurité. Aucune donnée bancaire ne passe par OrgaSport. » |
| 6 | 72–85 s | « C'est en ligne ! » : lien court, QR code, affiche A4, codes PIN reçus par email. | « 4. Lien, QR code et affiche, tout de suite » | « Dès le paiement confirmé, votre concours est publié : lien, QR code et affiche sont prêts. » |
| 7 | 85–100 s | Le jour J : table de marque, pointage des équipes, « Lancer le tirage », tableau « Concours A · Résultats 1re partie ». | « 5. Le jour J : pointage et tirage » | « Le jour du concours, pointez les équipes présentes et lancez le tirage : le cadrage suit tout seul. » |
| 8 | 100–118 s | Saisie rapide « 12 13 7 », historique, bouton « Annuler » sur une erreur. | « Une erreur ? Annulez-la. » | « Saisissez les scores en une ligne. Une erreur ? Tout est dans l'historique, et tout s'annule. » |
| 9 | 118–135 s | Côté joueurs : téléphone, « Trouver mon équipe », notification « À vous ! ». | « Les joueurs suivent en direct » | « Les joueurs suivent tout en direct sur leur téléphone, et sont prévenus quand c'est à eux. » |
| 10 | 135–150 s | Retour au boulodrome, logo, appel à l'action. | « Créez votre premier concours » | « À vous de jouer ! Créez votre premier concours sur OrgaSport. » |

---

## Sur le site

Page **« Découvrir et tutoriels »** (`/decouvrir`) et rappel dans l'espace club : lecteur vidéo avec image d'aperçu,
chargement uniquement au clic (aucun poids sur la page avant), sous-titres activables, **jamais de lecture automatique avec le
son**. La vidéo de découverte est aussi proposée en bas de l'accueil.

## Fichiers

- Code des vidéos : `apps/videos` (compositions `Decouverte169`, `Decouverte916`, `Tutoriel169`, `Tutoriel916`).
- Rendu : `pnpm --filter @orgasport/videos render` → `apps/web/public/videos/*.mp4` + images d'aperçu + sous-titres `.vtt`.
- Voix off : `docs/videos/voix-off.md` (texte à enregistrer, minuté).
