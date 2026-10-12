# CLAUDE.md — OrgaSport

SaaS de gestion de concours sportifs. Un club achète un « lien concours » (`/c/7KQ2`) qui gère inscriptions, tirage, terrains, scores et résultats. Lancement pétanque, **multi-sport dès le départ**.

> État : **plan proposé, en attente de validation** (voir `docs/PLAN.md`). Aucune phase démarrée.

## Priorités (en cas de conflit, dans cet ordre)
1. Vitesse et clarté le jour du concours : un joueur trouve son prochain match en < 10 s.
2. Automatisation maximale, mais l'organisateur peut **tout** corriger (historique + annulation).
3. Effet « waouh » sur la vitrine, sans jamais ralentir les pages « terrain ».

## Profils
Invité (sans compte, préférences sur l'appareil) · Joueur · Club (plusieurs membres) · Table de marque (compte ou PIN, limité à un concours) · Admin plateforme. Un compte peut être joueur **et** gérer des clubs (bascule de profil).

## Stack (proposée, cf. `docs/PLAN.md` §2)
Monorepo pnpm · Next.js App Router + TypeScript strict + Tailwind v4 · Supabase (Postgres, Auth, Realtime, Storage, **RLS partout**) · Stripe Checkout + webhook signé · SDK Anthropic côté serveur (`claude-haiku-5-5` par défaut, via `ANTHROPIC_MODEL`) · Web Push VAPID + PWA · Resend (emails) · Leaflet/OSM · Géoplateforme IGN (géocodage) · MET Norway (météo) · Turnstile · next-intl · Vitest + fast-check + Playwright · Remotion + React Three Fiber (vidéos) · Hébergement Netlify gratuit (Vercel Hobby exclu : non commercial).

## Structure
```
apps/web        Next.js (vitrine, app, /c/[code], /c/[code]/table, admin, legal, api)
apps/videos     Remotion
packages/engine moteur de tirage — TS pur, aucune dépendance UI/DB, 100 % testé
packages/sports configurations de sports + schéma de validation
packages/ui     design system
supabase/       migrations SQL, RLS, seed de démo
```

## Règles d'architecture (non négociables)
- **Le sport est une configuration** : aucun `if (sport === 'petanque')` dans le moteur ni dans les composants partagés. Tout passe par `packages/sports`.
- **Moteur pur** : `(état, action) → nouvel état`. Tirages reproductibles via une graine enregistrée.
- **Toute action de la table de marque** est enregistrée dans `tournament_actions` avec son inverse et un `client_op_id` (anti-doublon, file hors ligne).
- **Pages « terrain »** (`/c/...`) : rendu serveur, fonctionnent sans JS, < 100 Ko, pas d'animation lourde, aucune dépendance aux composants de la vitrine. Rafraîchissement 30 s sans JS.
- **Données privées** (licence, téléphone, email) dans des tables `*_private` séparées ; la licence n'est jamais publique.
- **Paiement** : activation uniquement par webhook Stripe signé ; aucune donnée bancaire chez nous ; prix en base (jamais en dur).
- **IA** : appelée seulement côté serveur ; les infos officielles (horaires, tirages, résultats) viennent toujours de la base.
- **Aucun secret dans le code** : variables d'environnement + `.env.example` commenté.
- Pas de récupération automatique de contenus Facebook/autres.

## Conventions
- Code et noms techniques en anglais ; **textes d'interface en français via next-intl** (aucun texte en dur).
- Statuts concours : `draft → published → registration_closed → check_in → live → finished → archived`.
- Codes courts : 4 caractères, alphabet sans 0/O/1/I/L.
- Commits clairs, une phase = une série de commits + mise à jour de ce fichier.
- Fin de phase : lancer l'app, tester, résumer (ce qui marche / ce qui reste / comment tester).

## Hors périmètre (place réservée)
CGV, mentions légales, confidentialité, bandeau cookies (pages vides `app/legal/`), paiement en ligne des inscriptions, SMS (interface prévue, désactivée), app native, import Facebook/affiche par IA.

## Décisions prises par défaut
Voir `docs/PLAN.md` §6. Liste tenue à jour ici au fil des phases :
- Open-Meteo écarté (API gratuite non commerciale) → MET Norway, repli lien Météo-France.
- PayPal : via Stripe (disponible pour les entreprises UE), pas d'intégration séparée.
- Direction visuelle par défaut : « Nocturne » (fond sombre, accent par sport) si pas de choix.
