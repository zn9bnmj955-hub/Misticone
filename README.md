# OrgaSport

Gestion de concours sportifs : inscriptions, tirage, terrains, scores et résultats. Pétanque d'abord, multi-sport dès le départ.

- Plan et architecture : [`docs/PLAN.md`](docs/PLAN.md)
- Règles du projet et choix techniques : [`CLAUDE.md`](CLAUDE.md)
- Variables d'environnement : [`.env.example`](.env.example)

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

Et inventez deux longues phrases secrètes (n'importe quelle suite de caractères, au moins 16) :
- `STAFF_SESSION_SECRET` (sessions des bénévoles connectés par code PIN)
- `CRON_SECRET` (protège le déclenchement des tirages automatiques)

Puis :

```bash
pnpm dev             # ouvre http://localhost:3000
```

Les emails (liens magiques) arrivent dans la boîte de test locale : http://127.0.0.1:54324

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
| `7KQ2` | Pétanque en cours, 32 doublettes, 2e tour |
| `GP3M` | Pétanque à venir, inscriptions ouvertes |
| `TR8E` | Pétanque terminée (triplettes vétérans) |
| `FT8S` | Tournoi de foot à 7, 8 équipes |

Code PIN de la table de marque du concours `7KQ2` : **4821** (page `/c/7KQ2/table`).

## Ce qu'on peut essayer (phase 2)

- **Page publique d'un concours** : http://localhost:3000/c/7KQ2 → tapez `14` dans « Trouver mon équipe ». Elle fonctionne aussi avec JavaScript désactivé.
- **Table de marque** : http://localhost:3000/c/7KQ2/table, PIN `4821`. Onglet Scores : tapez `12 13 7` puis Entrée (terrain 12, score 13 à 7). La page publique se met à jour toute seule.
- **Coupure réseau** : dans la table de marque, coupez le Wi-Fi, saisissez un score : il reste « en attente » puis part au retour du réseau.
- **Annuler une erreur** : onglet Historique → « Annuler ».
- **Préparer un concours** : connectez-vous avec `club@demo.orgasport.fr`, ouvrez http://localhost:3000/c/GP3M/table → Ouvrir le pointage, pointez des équipes, Tirage → Lancer le tirage.
- **Affiche A4** : http://localhost:3000/c/7KQ2/affiche (imprimer ou « Enregistrer en PDF »).

## Tests

```bash
pnpm -r test         # tests unitaires
pnpm test:db         # règles de sécurité de la base
pnpm test:e2e        # parcours complets dans un navigateur
```
