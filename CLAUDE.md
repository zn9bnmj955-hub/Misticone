# CLAUDE.md — OrgaSport

SaaS de gestion de concours sportifs. Un club achète un « lien concours » (`/c/7KQ2`) qui gère inscriptions, tirage, terrains, scores et résultats. Lancement pétanque, **multi-sport dès le départ**.

> État : **phase 1 (socle) terminée**. Prochaine : phase 2 (moteur de tirage + lien concours).
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
  src/app/c/[code]        lien concours (PROVISOIRE en phase 1 — réécrit en phase 2)
  src/app/auth/*          callback lien magique / OAuth, déconnexion
  src/app/api/geocode     proxy géocodage (Géoplateforme IGN)
  src/components          ui/ (primitives), shell/ (navigation), draw/, onboarding/, profile/, tournament/
  src/lib                 supabase/ (server, client, admin, public, proxy), data/, viewer.ts, prefs.ts, format.ts
  src/i18n                textes FR (fr.ts) — aucun texte en dur dans les composants
  e2e/                    tests Playwright
packages/sports           configs de sports (zod) : petanque.ts, football.ts
packages/engine           moteur de tirage (phase 2) — pour l'instant : codes courts
packages/ui               tokens.css (TOUTES les couleurs), icônes, logo
packages/db               types générés + générateur du seed de démo
supabase/                 config.toml, migrations/, seed.sql (généré), tests/rls.sql
```

## Règles d'architecture (non négociables)
- **Le sport est une configuration** : aucun `if (sport === 'petanque')` dans le moteur ni dans les composants partagés. Tout passe par `packages/sports` (nom des emplacements, formats, score, classement, licence, modèles de notifications, valeurs par défaut).
- **Couleurs** : uniquement dans `packages/ui/src/tokens.css` (variables `--os-*`, mappées en utilitaires Tailwind `bg-accent`, `text-ink`… dans `apps/web/src/app/globals.css`). Accent par sport via l'attribut `data-sport` (sur `<html>` ou sur un élément). Clair/sombre : système par défaut, choix mémorisé (`localStorage os_theme`) appliqué avant le premier affichage.
- **Moteur pur** : `(état, action) → nouvel état`. Tirages reproductibles via une graine enregistrée.
- **Toute action de la table de marque** sera enregistrée dans `tournament_actions` avec son inverse et un `client_op_id` (anti-doublon, file hors ligne).
- **Pages « terrain »** (`/c/...`) : rendu serveur, sans JS, < 100 Ko, hors du `proxy`. En phase 2 elles seront servies par des Route Handlers produisant du HTML léger (pas de runtime React côté client) — car toute page App Router embarque ~100 Ko de JS et le streaming `<Suspense>` ne s'affiche pas sans JS.
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
- Environnement de dev cloud : Docker Hub limite les téléchargements anonymes ; `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` et relances. Le géocodage IGN est bloqué par le réseau de cet environnement (pas en production).
