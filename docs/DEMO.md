# Faire la démo d'OrgaSport

Durée conseillée : **10 minutes**. L'idée : montrer d'abord ce que vit un **joueur** le jour du concours (rapide, simple),
puis ce que gagne un **club** (tout est automatique), et finir par l'effet « waouh ».

## Avant de commencer

- **Sans Internet ou sans installation** : passez les enregistrements `docs/demo/demo-ordinateur.webm` et
  `docs/demo/demo-telephone.webm` (le site parcouru de bout en bout), puis les vidéos `apps/web/public/videos/`.
- **En direct** : le site doit tourner (voir le README : `pnpm db:start`, `pnpm db:reset`, `pnpm dev`), puis ouvrez
  http://localhost:3000. Pour le téléphone : sur ordinateur, outils de développement du navigateur → mode téléphone.
- Remettez les données de démo à zéro juste avant (`pnpm db:reset`) : le concours `7KQ2` est alors « en cours ».
- Mot de passe de tous les comptes de démo : `orgasport-demo`.

## Le parcours (10 minutes)

| # | Écran | Ce qu'on fait | Ce qu'on dit |
|---|---|---|---|
| 1 | Accueil http://localhost:3000 | Laisser la scène 3D s'animer, toucher « Football » puis « Pétanque », faire tourner la boule | « Un lien concours, tous les sports. » |
| 2 | Accueil, champ « Retrouver mon tirage » | Taper `7KQ2` → Voir, puis `14` dans « Trouver mon équipe » | « Le joueur scanne le QR code : terrain et heure en 10 secondes, même sur un vieux téléphone. » |
| 3 | Page du concours | Montrer « À vous ! contre l'équipe 6 », le tableau, le classement | « Pas d'application à installer, ça marche même sans réseau. » |
| 4 | Table de marque http://localhost:3000/c/7KQ2/table, PIN `4821` | Onglet Scores : taper `12 13 7` + Entrée ; revenir sur la page du joueur : elle s'est mise à jour | « Un score saisi, et chaque équipe reçoit son prochain match. » |
| 5 | Table de marque, onglet Historique | « Annuler » la saisie | « L'organisateur peut tout corriger. » |
| 6 | Connexion `club@demo.orgasport.fr` → Club → « Créer un concours » | « Tout le reste par défaut », puis « Payer et publier » (paiement simulé), code promo `BIENVENUE` possible | « Créer et payer un concours : moins de 3 minutes. Lien, QR code, affiche : tout est prêt. » |
| 7 | Catalogue http://localhost:3000/concours | Filtres, carte, ouvrir `GP3M` → « S'inscrire » | « Les joueurs trouvent les concours autour d'eux et s'inscrivent en ligne. » |
| 8 | Connexion `joueur@demo.orgasport.fr` → Accueil | Carte « En direct » épinglée, puis le fil « Pour vous » | « Chaque joueur a son fil : ses concours, ses clubs, ses résultats. » |
| 9 | Bulle de l'assistant (en bas à droite) | « La règle du but à 13 » | « Un assistant qui connaît le sport et les concours. » |
| 10 | http://localhost:3000/decouvrir | Lancer le tutoriel 3D, montrer les chapitres | « Tout est expliqué en vidéo pour les clubs. » |

## Bon à savoir pendant la démo

- **Paiement** : en démo, une page « paiement simulé » remplace Stripe (aucune vraie carte).
- **Assistant** : sans clé Anthropic, il répond avec la base de connaissances du site (il le dit honnêtement).
- **Notifications sur téléphone** : elles demandent l'autorisation seulement au clic sur « Me prévenir » ; la vraie
  réception se montre une fois le site en ligne (voir `docs/DEPLOIEMENT.md`).
- **Mode sombre** : suit le réglage du téléphone ou de l'ordinateur.
- **Boule 3D** : sur un appareil peu puissant ou avec « réduire les animations », une image fixe la remplace (voulu).
