# Vidéos OrgaSport — texte de la voix off

> Généré par `apps/videos/scripts/make-subtitles.mjs` à partir de `apps/videos/src/data/script.json` (même source que les
> sous-titres et que le minutage des plans). Pour modifier un texte : changer le JSON, puis `pnpm --filter @orgasport/videos subtitles`.

**Consignes d'enregistrement** : voix française naturelle, chaleureuse, débit posé (≈ 150 mots/min pour la découverte,
≈ 130 pour le tutoriel). Chaque phrase commence à l'heure indiquée et doit finir avant le plan suivant. Enregistrer en WAV
48 kHz mono, sans musique (la musique est mixée ensuite, environ −18 dB sous la voix).
La piste « voix » des vidéos est laissée vide : déposer le fichier dans `apps/videos/public/voice/<video>.wav` et l'ajouter
dans la composition (`<Audio>`), puis relancer le rendu.

## OrgaSport en 75 secondes (1:15)

| Début | Fin | Voix off | Texte à l'écran |
|---|---|---|---|
| 0:00 | 0:06 | Le jour du concours, tout va très vite. | Le jour du concours… |
| 0:06 | 0:14 | Soixante-quatre équipes, trente-deux terrains, et tout le monde veut savoir où il joue. | 64 équipes · 32 terrains · 1 tirage |
| 0:14 | 0:22 | Avec OrgaSport, un joueur scanne le QR code et trouve son match en dix secondes. | Votre match en 10 secondes. |
| 0:22 | 0:32 | Le tirage, les terrains, les scores : tout est calculé automatiquement, en direct. | Tirage automatique · terrains attribués · en direct |
| 0:32 | 0:40 | Un score saisi à la table de marque, et chaque équipe reçoit son prochain match. | Un score saisi, tout le monde est prévenu. |
| 0:40 | 0:47 | Même quand le réseau tombe au fond du terrain. | Même sans réseau. |
| 0:47 | 0:55 | Pétanque, football… OrgaSport s'adapte à votre sport. | Pétanque, football… et demain votre sport. |
| 0:55 | 1:05 | Pour les clubs, créer et publier un concours prend trois minutes. | Créez votre concours en 3 minutes. |
| 1:05 | 1:15 | OrgaSport. Vos concours, de l'inscription aux résultats. | OrgaSport · vos concours, de l'inscription aux résultats |

## Acheter et utiliser son lien concours (2:30)

| Début | Fin | Voix off | Texte à l'écran |
|---|---|---|---|
| 0:00 | 0:08 | Voici comment créer, payer et utiliser votre lien concours. | Votre lien concours, pas à pas |
| 0:08 | 0:22 | Dans votre espace club, touchez « Créer un concours », puis choisissez le sport. | 1. Créer le concours |
| 0:22 | 0:40 | Chaque réponse a une valeur par défaut adaptée au sport. Votre brouillon s'enregistre tout seul. | Tout est prérempli. Le brouillon s'enregistre tout seul. |
| 0:40 | 0:55 | OrgaSport calcule les terrains nécessaires au premier tour. Pas sûr du format ? « Aide-moi à choisir ». | 2. Les terrains nécessaires sont calculés |
| 0:55 | 1:12 | Vérifiez le récapitulatif, puis payez en toute sécurité. Aucune donnée bancaire ne passe par OrgaSport. | 3. Paiement sécurisé par Stripe |
| 1:12 | 1:25 | Dès le paiement confirmé, votre concours est publié : lien, QR code et affiche sont prêts. | 4. Lien, QR code et affiche, tout de suite |
| 1:25 | 1:40 | Le jour du concours, pointez les équipes présentes et lancez le tirage. | 5. Le jour J : pointage et tirage |
| 1:40 | 1:58 | Saisissez les scores en une ligne. Une erreur ? Tout est dans l'historique, et tout s'annule. | Une erreur ? Annulez-la. |
| 1:58 | 2:15 | Les joueurs suivent tout en direct sur leur téléphone, et sont prévenus quand c'est à eux. | Les joueurs suivent en direct |
| 2:15 | 2:30 | À vous de jouer ! Créez votre premier concours sur OrgaSport. | Créez votre premier concours |
