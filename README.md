# OrgaSport

Gestion de concours sportifs : inscriptions, tirage, terrains, scores et résultats. Pétanque d'abord, multi-sport dès le départ.

- Plan et architecture : [`docs/PLAN.md`](docs/PLAN.md)
- Règles du projet et choix techniques : [`CLAUDE.md`](CLAUDE.md)
- Variables d'environnement : [`.env.example`](.env.example)
- Mettre le site en ligne, pas à pas : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)
- Faire une démo en 10 minutes : [`docs/DEMO.md`](docs/DEMO.md) (enregistrements dans `docs/demo/`)

## Lancer le projet sur votre ordinateur

Prérequis : [Node.js 22](https://nodejs.org), [pnpm](https://pnpm.io/installation) et [Docker Desktop](https://www.docker.com/products/docker-desktop/) (pour la base de données locale).

```bash
pnpm install
pnpm db:start        # démarre Supabase en local (la 1re fois : quelques minutes de téléchargement)
pnpm db:reset        # crée les tables et les données de démonstration
cp .env.example apps/web/.env.local
```

Dans `apps/web/.env.local`, collez les deux clés affichées par `pnpm db:start` :
- `Publishable key` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `Secret key` → `SUPABASE_SECRET_KEY`

Et inventez trois longues phrases secrètes (n'importe quelle suite de caractères, au moins 16) :
- `STAFF_SESSION_SECRET` (sessions des bénévoles connectés par code PIN)
- `CRON_SECRET` (protège le déclenchement des tirages automatiques)
- `STRIPE_WEBHOOK_SECRET` (sans clé Stripe, signe les « paiements simulés » locaux)

Facultatif : notifications sur téléphone → `npx web-push generate-vapid-keys`, puis collez les deux clés dans
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`. Assistant intelligent → `ANTHROPIC_API_KEY` (sans clé, il répond avec
la base de connaissances du site).

Puis :

```bash
pnpm dev             # ouvre http://localhost:3000
```

Les emails (liens magiques) arrivent dans la boîte de test locale : http://127.0.0.1:54324

Si une page se recharge en boucle pendant le développement (cela arrive après un `pnpm build` ou un redémarrage de l'ordinateur pendant que `pnpm dev` tournait) : arrêtez `pnpm dev`, supprimez le dossier `apps/web/.next`, puis relancez `pnpm dev`.

## Comptes et codes de démonstration

Mot de passe pour tous les comptes : `orgasport-demo` (données locales uniquement).

| Compte | Ce qu'on peut tester |
|---|---|
| `joueur@demo.orgasport.fr` | Joueur inscrit au concours en cours : « Mon tirage » ouvre son prochain match |
| `club@demo.orgasport.fr` | Gère le club « AS Les Platanes » : mode club, bascule de profil |
| `benevole@demo.orgasport.fr` | Simple membre du club |
| `admin@demo.orgasport.fr` | Administrateur de la plateforme |

| Code | Concours |
|---|---|
| `7KQ2` | En cours, 32 doublettes dont 3 absentes : tour « Cadrage » avec une équipe « Office », concours B, équipes « N.H. » |
| `GP3M` | À venir, inscriptions ouvertes |
| `TR8E` | Terminé il y a 3 jours (triplettes vétérans) |
| `C4DR` | Terminé, cadrage dans les concours A, B et C |
| `2J7P` | Sur 2 jours, en pause avant les 1/4 de finale |
| `PQ8P` | À venir, en poules (tirage automatique des tests e2e) |

Tous les concours de démo sont en pétanque (détail dans `docs/DEMO.md`).

Code PIN de la table de marque du concours `7KQ2` : **4821** (page `/c/7KQ2/table`).

Codes promo de démonstration : `BIENVENUE` (concours offert), `CLUB50` (-50 %).

## Ce qu'on peut essayer

### Le jour du concours

- **Page publique d'un concours** : http://localhost:3000/c/7KQ2 → tapez `14` dans « Trouver mon équipe ». Elle fonctionne aussi avec JavaScript désactivé.
- **Table de marque** : http://localhost:3000/c/7KQ2/table, PIN `4821`. Onglet Scores : tapez `12 13 7` puis Entrée (terrain 12, score 13 à 7). La page publique se met à jour toute seule.
- **Coupure réseau** : dans la table de marque, coupez le Wi-Fi, saisissez un score : il reste « en attente » puis part au retour du réseau.
- **Annuler une erreur** : onglet Historique → « Annuler ».
- **Préparer un concours** : connectez-vous avec `club@demo.orgasport.fr`, ouvrez http://localhost:3000/c/GP3M/table → Ouvrir le pointage, pointez des équipes, Tirage → Lancer le tirage.
- **Affiche A4** : http://localhost:3000/c/7KQ2/affiche (imprimer ou « Enregistrer en PDF »).

### Créer et payer un concours (club)
- Connectez-vous avec `club@demo.orgasport.fr` → **Club** → « Créer un concours ». Tout est prérempli : « Continuer » à chaque
  étape (ou « Tout le reste par défaut »), puis « Payer et publier ». Sans clé Stripe, une page de **paiement simulé** remplace
  Stripe ; le concours passe « en ligne » tout seul, avec lien, QR code, affiche et codes PIN envoyés par email
  (boîte locale http://127.0.0.1:54324). Avec le code `BIENVENUE`, il est publié sans paiement.
- Espace club : tableau de bord, membres (invitation par lien), annonces, factures, statistiques, page publique du club.

### Trouver un concours et s'inscrire (joueur)
- http://localhost:3000/concours : filtres (sport, date, distance, places libres), carte. Ouvrez `GP3M` → « S'inscrire » :
  le formulaire marche même sans JavaScript ; à la fin, fichier agenda et bouton « Me prévenir quand c'est à moi ».

### Accueil personnalisé et notifications
- Connectez-vous avec `joueur@demo.orgasport.fr` : l'accueil épingle « En direct » (votre terrain et votre heure), puis le fil
  « Pour vous » (concours proches, résultats, annonces des clubs suivis, actualités).
- Les notifications sur téléphone demandent l'autorisation **seulement** quand on touche « Me prévenir ». Gestion dans **Profil**.
  L'application s'installe sur l'écran d'accueil (menu du navigateur → « Installer » / « Sur l'écran d'accueil »).

### Assistant
- Bulle en bas à droite, ou http://localhost:3000/assistant : « Mon prochain match », « La règle du but à 13 »…
  Administration (compte `admin@demo.orgasport.fr`) : http://localhost:3000/admin/assistant (réglages, coûts, base de connaissances).

### Vitrine et vidéos
- http://localhost:3000 : boule 3D qui se transforme selon le sport (désactivée si « réduire les animations » est activé).
- http://localhost:3000/decouvrir : vidéo de découverte (75 s) et tutoriel (2 min 30), sous-titrés.
- Administration : http://localhost:3000/admin (tarifs, codes promo, paiements, concours, assistant, actualités).

## Tests

```bash
pnpm -r test         # tests unitaires
pnpm test:db         # règles de sécurité de la base
pnpm test:e2e        # parcours complets dans un navigateur (remet la base de démo à zéro)
```

Vidéos : `pnpm videos:studio` (aperçu et retouches) et `pnpm videos:render` (rendu des 4 fichiers, une quinzaine de minutes chacun).
