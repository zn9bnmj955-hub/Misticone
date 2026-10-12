# CLAUDE.md — OrgaSport

SaaS de gestion de concours sportifs. Un club achète un « lien concours » (`/c/7KQ2`) qui gère inscriptions, tirage, terrains, scores et résultats. Lancement pétanque, **multi-sport dès le départ**.

> État : **phases 1 (socle) et 2 (moteur de tirage + lien concours) terminées**. Prochaine : phase 3 (espace clubs, formulaire, paiement Stripe).
> Plan validé : `docs/PLAN.md`. Direction visuelle validée : **C « Direct »** (maquettes : `docs/design/directions.html`).

## Priorités (en cas de conflit, dans cet ordre)
1. Vitesse et clarté le jour du concours : un joueur trouve son prochain match en < 10 s.
2. Automatisation maximale, mais l'organisateur peut **tout** corriger (historique + annulation).
3. Effet « waouh » sur la vitrine, sans jamais ralentir les pages « terrain ».

## Profils
Invité (préférences sur l'appareil) · Joueur · Club (plusieurs membres) · Table de marque (compte ou PIN, limité à un concours) · Admin plateforme. Un compte peut être joueur **et** gérer des clubs (bascule de profil : `profiles.active_club_id`).

## Stack
- Monorepo **pnpm** (`pnpm-workspace.yaml`), Node 22.
- **Next.js 16** (App Router, Turbopack, `cacheComponents` + `partialPrefetching` activés), React 19, TypeScript strict, **Tailwind v4**.
  - ⚠️ Next 16 diffère de Next 13-15 : `middleware` s'appelle **`proxy.ts`** ; avec Cache Components, toute lecture de cookies / `searchParams` / `params` / heure courante doit être dans un `<Suspense>` ; `"use cache"` + `cacheLife` pour les données publiques. Doc locale : `apps/web/node_modules/next/dist/docs/`.
- **Supabase** (Postgres 17, Auth, Realtime, Storage) — en local via Docker (`pnpm db:start`).
- Prévu : Stripe Checkout (phase 3), Web Push + Resend (phase 5), SDK Anthropic `claude-haiku-5-5` (phase 6), Remotion (phase 7).
- Tests : **Vitest** (paquets + web), **Playwright** (`apps/web/e2e`), tests RLS en SQL (`supabase/tests/rls.sql`).

## Structure
```
apps/web                  Next.js
  src/app/(vitrine)       accueil public "/", pages légales (vides)
  src/app/(app)           app avec navigation : accueil, concours, tirage, assistant, profil, club
  src/app/(auth)          connexion, inscription/[joueur|club|invite] (une question par écran)
  src/app/c/[code]        lien concours PUBLIC : route.ts = HTML serveur léger (pas de React côté client)
    score/ affiche/ qr.svg/   saisie capitaines (formulaire POST), affiche A4, QR code
    table/                table de marque (page Next + client hors ligne)
  src/app/api/t/[code]/*  API table de marque : state, commands, undo, history, pin, staff
  src/app/api/cron/tick   tirages automatiques à l'heure (protégé par CRON_SECRET)
  src/terrain/            rendu des pages terrain : html.ts (échappement), render.ts, view-model.ts,
                          live-script.ts (seul JS de la page, ES5), terrain.css → styles.generated.ts
  src/lib/tournament/     load.ts (état moteur depuis la base), execute.ts (commandes, annulation,
                          diffusion), staff.ts (compte ou PIN signé), auto-draw.ts, command-schema.ts
  src/app/auth/*          callback lien magique / OAuth, déconnexion
  src/app/api/geocode     proxy géocodage (Géoplateforme IGN)
  src/components          ui/, shell/, draw/, onboarding/, profile/, tournament/,
                          table/ (table de marque : store.ts = file hors ligne + moteur local)
  src/lib                 supabase/ (server, client, admin, public, proxy), data/, viewer.ts, prefs.ts, format.ts
  src/i18n                textes FR (fr.ts) — aucun texte en dur dans les composants
  e2e/                    tests Playwright
packages/sports           configs de sports (zod) : petanque.ts, football.ts
packages/engine           moteur de tirage — TS pur, 80 tests (dont tests aléatoires massifs)
  commands.ts             commandes organisateur + « règlement » automatique (forfaits, tours suivants,
                          terrains, fin du concours)
  formats.ts              élimination (fixe / nouveau tirage), poules (4 en 3 parties / chacun contre
                          chacun) + phase finale, suisse, championnat, mêlée tournante, complémentaire
  pairing.ts bracket.ts venues.ts standings.ts scoring.ts tx.ts (changements + inverses) rng.ts
packages/ui               tokens.css (TOUTES les couleurs), icônes, logo
packages/db               types générés, engine-mapping.ts (moteur ↔ tables), générateur du seed
                          (les concours de démo sont joués par le moteur)
supabase/                 config.toml, migrations/, seed.sql (généré), tests/rls.sql
```

## Règles d'architecture (non négociables)
- **Le sport est une configuration** : aucun `if (sport === 'petanque')` dans le moteur ni dans les composants partagés. Tout passe par `packages/sports` (nom des emplacements, formats, score, classement, licence, modèles de notifications, valeurs par défaut).
- **Couleurs** : uniquement dans `packages/ui/src/tokens.css` (variables `--os-*`, mappées en utilitaires Tailwind `bg-accent`, `text-ink`… dans `apps/web/src/app/globals.css`). Accent par sport via l'attribut `data-sport` (sur `<html>` ou sur un élément). Clair/sombre : système par défaut, choix mémorisé (`localStorage os_theme`) appliqué avant le premier affichage.
- **Moteur pur** : `applyCommand(état, commande, {now, newId, seed})` → `{state, changes}`. Aucune horloge, aucun hasard non contrôlé : les ids sont dérivés du `clientOpId`, les tirages d'une graine. Résultat identique sur le serveur et sur un appareil hors ligne.
- **Écriture en base** : uniquement via `executeCommand` (serveur) → RPC `apply_tournament_changes` (atomique, verrou optimiste `tournaments.state_version`, anti-doublon `client_op_id`). Chaque action est dans `tournament_actions` avec ses changements moteur ; annuler = appliquer l'inverse, refusé si une action plus récente touche les mêmes éléments (`conflictsWithLater`).
- **Pages « terrain »** (`/c/...`) : Route Handlers qui produisent du HTML (pas de runtime React côté client), lisibles sans JS, < 100 Ko (13 à 20 Ko mesurés), hors du `proxy`. CSS = tokens + `terrain.css`, généré par `scripts/build-terrain-css.mjs` (lancé avant dev/build/test). Pas de `gap` en flexbox, script ES5 : compatibles navigateurs anciens. Direct : WebSocket Supabase Realtime (diffusion `tournament:CODE`) sinon rafraîchissement 30 s ; service worker `public/sw.js` = dernier tirage lisible hors ligne.
- **Table de marque** : moteur exécuté dans le navigateur ; chaque saisie est appliquée tout de suite, gardée dans `localStorage` (`os_outbox_CODE`) et envoyée dans l'ordre jusqu'à confirmation. Témoin de connexion toujours visible. Accès : organisateur connecté ou PIN (cookie HMAC signé `STAFF_SESSION_SECRET`, 24 h, révocable). Seuls les échecs de PIN sont comptés (8 / appareil, 60 / concours par 15 min).
- **Données privées** : licences (`players_private`, `profiles_private`), contacts (`registrations`), PIN (`tournament_staff.pin_hash`, colonne non lisible par l'API). Le public ne lit jamais `players` directement : le serveur applique « noms complets / initiales » (`lib/names.ts`).
- **Publication** : un concours ne quitte `draft` que via le serveur (rôle service = webhook Stripe), garanti par un trigger SQL.
- **Paiement** : activation uniquement par webhook Stripe signé ; aucune donnée bancaire chez nous ; prix en base (`pricing_plans`).
- **IA** : appelée seulement côté serveur ; les infos officielles viennent toujours de la base.
- **Aucun secret dans le code** : variables d'environnement, voir `.env.example`. `apps/web/.env.local` (ignoré par git) contient les clés locales de démo.

## Conventions
- Code et noms techniques en anglais ; **textes d'interface en français dans `src/i18n/fr.ts`**.
- Statuts concours : `draft → published → registration_closed → check_in → live → finished → archived`.
- Codes courts : 4 caractères, alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sans 0/O/1/I/L), générés par la base.
- Heures affichées à la française : « 15 h 40 » (`lib/format.ts`, fuseau Europe/Paris).
- Préférences de l'appareil (invités compris) en cookies `os_prefs`, `os_sport`, `os_onboarded` → le serveur personnalise dès le premier rendu.
- Le seed est **généré** : modifier `packages/db/scripts/generate-seed.ts` puis `pnpm seed:gen && pnpm db:reset`.
- Après une migration : `pnpm db:types` pour régénérer les types.
- Fin de phase : `pnpm -r test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`, captures, résumé, mise à jour de ce fichier, commit + push.

## Commandes
```
pnpm install
pnpm db:start          # Supabase local (Docker). Voir README si Docker Hub limite les téléchargements.
pnpm db:reset          # migrations + seed de démo
pnpm dev               # http://localhost:3000
pnpm -r test           # tests unitaires
pnpm test:db           # tests de sécurité (RLS) en SQL
pnpm test:e2e          # parcours Playwright (lance le serveur si besoin)
```
Variables locales nécessaires dans `apps/web/.env.local` : voir `.env.example` (dont `STAFF_SESSION_SECRET`, `CRON_SECRET`). Les tests Playwright lisent ce fichier (aucune clé dans les tests).
Comptes de démo (local uniquement, mot de passe `orgasport-demo`) : `joueur@demo.orgasport.fr`, `club@demo.orgasport.fr`, `benevole@demo.orgasport.fr`, `admin@demo.orgasport.fr`. PIN table de marque du concours 7KQ2 : `4821`.
Codes de démo : `7KQ2` (en cours, 32 doublettes, 2e tour), `GP3M` (à venir), `TR8E` (terminé), `FT8S` (foot à 7, 8 équipes).

## Hors périmètre (place réservée)
CGV, mentions légales, confidentialité, cookies (pages vides `/legal/*` + table `legal_pages`), paiement en ligne des inscriptions, SMS (`notification_channel` 'sms', désactivé), app native, import Facebook/affiche par IA.

## Décisions prises par défaut (au fil des phases)
- Hébergement : Netlify gratuit (Vercel Hobby interdit l'usage commercial) — à revérifier au déploiement.
- Météo : MET Norway (Open-Meteo gratuit = non commercial). PayPal : via Stripe.
- i18n maison (`src/i18n`) plutôt que next-intl : un seul fichier par langue, aucune dépendance aux en-têtes de requête (compatible Cache Components et pages terrain légères).
- Police : Saira variable (largeur + graisse), auto-hébergée (`apps/web/src/fonts`, licence OFL) — pas d'appel à Google Fonts. ~100 Ko par style : sous-ensemble à faire en phase 8.
- Géocodage : Géoplateforme IGN via `/api/geocode` ; si le service ne répond pas, la saisie libre est conservée.
- Notifications : à l'inscription on enregistre seulement l'accord de principe (`notifications_opt_in`) ; la demande d'autorisation du navigateur viendra au bon moment (phase 5), jamais à la première visite.
- Onboarding : préférences d'abord, compte à la fin (facultatif pour joueur/invité, obligatoire pour un club, placé avant l'étape logo). Brouillon gardé dans `localStorage os_onboarding` pour survivre au lien magique.
- « Retrouver mon tirage » : formulaire GET vers `/tirage/aller` (vraie redirection HTTP, fonctionne sans JS) ; scan QR via `BarcodeDetector`, sinon décodeur `jsqr` chargé à la demande.
- « Mon tirage » ouvre directement le prochain match si le joueur connecté joue un concours en cours (`?saisir=1` pour forcer la saisie d'un code).
- Licence : vérification du format uniquement (regex par sport), jamais affichée publiquement.
- Logo club : bucket public `club-logos`, envoi par le serveur après contrôle d'appartenance (2 Mo max).
- Phase 2 — formats : élimination avec **nouveau tirage à chaque tour** par défaut en pétanque (tableau fixe en option) ; un exempt par tour impair, jamais deux fois la même équipe si possible ; en tableau fixe les exempts vont aux mieux placés pour atteindre une puissance de 2.
- Phase 2 — complémentaire : perdants d'**un** tour choisi (`consolation.losersOfRound`, 1 par défaut) ; en poules, les non-qualifiés. Tiré automatiquement dès que ce tour est complet.
- Phase 2 — poules : poules de 4 « en 3 parties » (gagnants / perdants / barrage) pour la pétanque, chacun contre chacun pour le foot ; poules de 3 quand le nombre ne tombe pas juste ; 2 qualifiés par poule ; phase finale en tableau fixe, vainqueurs de poule têtes de série, jamais deux équipes d'une même poule au 1er tour.
- Phase 2 — mêlée tournante : nouvelles équipes à chaque partie en évitant les mêmes partenaires ; les joueurs en surnombre sont exempts (comptés comme victoire) à tour de rôle.
- Phase 2 — forfait et exempt : score de forfait par défaut = cible du sport à 0 (13–0 en pétanque, 3–0 en foot), configurable (`forfeitScore`).
- Phase 2 — terrains : file « premier arrivé, premier servi » ; terrains réservés utilisables seulement à partir des demi-finales du tableau principal (`reservedVenuesFrom`) ; foot = créneaux horaires (aucune équipe sur deux matchs à la fois).
- Phase 2 — corrections : changer un vainqueur est accepté tant que les matchs suivants concernés ne sont pas joués (sinon message « annulez d'abord… ») ; en poules, refusé si le tableau final est déjà tiré et que les qualifiés changeraient.
- Phase 2 — scores capitaines : option `scoreEntry: "captains"` ; code équipe à 4 chiffres (`team_secrets`, visible par la table de marque et sur la liste imprimée) ; validé si les deux capitaines saisissent le même score, sinon « à vérifier » par la table.
- Phase 2 — « C'est mon équipe » : cookie `os_t_CODE` (30 jours) sur l'appareil, sans compte ; l'équipe est ensuite mise en avant automatiquement.
- Phase 2 — tirage automatique : `config.autoDrawAt` ; à brancher en production sur un appel minute de `/api/cron/tick` (Supabase pg_cron ou service gratuit), avec en filet de sécurité un déclenchement après l'affichage de la page publique.
- Environnement de dev cloud : Docker Hub limite les téléchargements anonymes ; `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` et relances. Le géocodage IGN est bloqué par le réseau de cet environnement (pas en production).
