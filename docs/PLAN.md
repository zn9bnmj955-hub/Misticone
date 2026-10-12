# OrgaSport — Plan d'architecture

> Version 1 · 12 oct. 2026 · statut : **validé** (direction visuelle C « Direct »)
> Phase 1 terminée. Suivi détaillé et décisions : `CLAUDE.md`.

---

## 1. En une phrase

Une seule application web Next.js, une base Supabase, et un **moteur de tirage isolé** (un module TypeScript pur, sans écran, couvert par des tests) dont le comportement dépend d'une **configuration de sport**, jamais de code écrit pour un sport précis.

---

## 2. Choix techniques

| Besoin | Choix | Pourquoi / point de vigilance |
|---|---|---|
| Application | **Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4** | Une seule base de code pour la vitrine, le catalogue, les clubs, la table de marque et l'admin. Rendu côté serveur pour les pages « terrain ». |
| Organisation du code | **Monorepo pnpm** : `apps/web`, `apps/videos`, `packages/engine`, `packages/sports`, `packages/ui` | Le moteur de tirage vit dans son propre paquet : il ne peut pas dépendre de l'interface, et on le teste seul. |
| Base de données, comptes, temps réel, fichiers | **Supabase** (PostgreSQL + Auth + Realtime + Storage), **RLS sur toutes les tables** | Offre gratuite : 500 Mo, mais le projet se met en pause après 7 jours sans activité (à surveiller avant le lancement). En développement : Supabase local (Docker). |
| Connexion | Supabase Auth : lien magique, mot de passe, Google, Apple | Apple demande un compte développeur Apple (99 $/an) : prévu, activé quand tu auras le compte. |
| Paiement | **Stripe Checkout** + webhook signé `checkout.session.completed` | **PayPal est disponible via Stripe pour une entreprise basée dans l'UE (dont la France)** : il suffit de l'activer dans le tableau de bord Stripe, pas d'intégration séparée. Apple Pay / Google Pay : activés dans Stripe. Reçu : envoyé par Stripe. Facture : option `invoice_creation` de Checkout. |
| Prix | Table `pricing_plans` éditable dans l'admin + **codes promo Stripe** | Rien en dur. Packs et abonnements ajoutables plus tard (Stripe gère les deux). |
| Emails | **Resend** (3 000 emails/mois gratuits) derrière une interface `EmailProvider` | Interchangeable avec Brevo si besoin, sans toucher au reste. |
| Notifications push | **Web Push (clés VAPID)** + service worker + PWA installable | Gratuit, sans service tiers. SMS : interface `SmsProvider` prévue, désactivée. |
| Cartes | **Leaflet + tuiles OpenStreetMap** | Les tuiles OSM publiques limitent l'usage intensif : on prévoit de basculer vers un fournisseur de tuiles (offre gratuite type MapTiler/Stadia) par simple variable d'environnement. |
| Géocodage | **Géoplateforme IGN (ex-API Adresse / BAN)** | Gratuit, sans clé. |
| Météo | **MET Norway (api.met.no)**, cache 1 h, attribution CC BY 4.0 | **Open-Meteo est exclu** : son API gratuite est réservée à l'usage non commercial. MET Norway ne l'interdit pas mais impose un User-Agent identifiable : à reconfirmer au lancement. Repli : simple lien vers Météo-France. |
| Anti-robots | **Cloudflare Turnstile** (gratuit) | Sur tous les formulaires publics (inscription concours, création de compte). |
| Limites de requêtes | Compteurs dans PostgreSQL (fonction SQL) | Pas de service en plus. |
| Assistant IA | **SDK officiel Anthropic**, côté serveur uniquement, modèle `claude-haiku-5-5` par défaut (variable `ANTHROPIC_MODEL`) | Outils branchés sur la base, réponses en streaming, quotas et plafond de dépense en base. Base de connaissances : recherche plein texte PostgreSQL (français), pgvector possible plus tard. |
| Vidéos | **Remotion + React Three Fiber** dans `apps/videos` | Licence Remotion gratuite pour une entreprise de 3 personnes maximum : à revérifier si l'équipe grandit. |
| Traductions | **next-intl**, français seul au départ | Tous les textes dans des fichiers de messages, aucun texte en dur. |
| Tests | **Vitest** (+ tests aléatoires massifs avec fast-check sur le moteur) · **Playwright** pour les parcours | Chromium déjà installé dans l'environnement. |
| Hébergement | **Netlify (offre gratuite)** au démarrage | **Vercel Hobby est exclu : usage commercial interdit** (un site qui encaisse des paiements est commercial). Cloudflare Workers gratuit limite le calcul à 10 ms par requête, trop juste pour du rendu serveur. Netlify gratuit : 300 crédits/mois, site suspendu si dépassement → à revérifier (conditions et consommation) au moment du déploiement. Plan B : Cloudflare Workers payant (5 $/mois). |

---

## 3. Architecture

```
orgasport/
├── apps/
│   ├── web/                 Next.js : toutes les pages + routes API
│   │   ├── app/(vitrine)/   accueil, découvrir, onboarding        → régime « waouh »
│   │   ├── app/(app)/       fil, catalogue, profil, club, assistant
│   │   ├── app/c/[code]/    lien concours public                  → régime « terrain »
│   │   ├── app/c/[code]/table/  table de marque (compte ou PIN)
│   │   ├── app/admin/       administration plateforme
│   │   ├── app/legal/       pages vides prévues (CGV, mentions, confidentialité)
│   │   └── app/api/         webhooks Stripe, assistant, push, ics, météo
│   └── videos/              Remotion (16:9 et 9:16)
├── packages/
│   ├── engine/              moteur de tirage, terrains, scores, classement (TS pur)
│   ├── sports/              configurations de sports (pétanque, football…) + schéma de validation
│   └── ui/                  design system (jetons, composants)
└── supabase/
    ├── migrations/          schéma SQL + règles RLS
    └── seed.sql             données de démonstration
```

### Deux régimes de pages, séparés dès la structure

- **Vitrine** (`(vitrine)`, `(app)`) : animations, 3D chargée en différé, désactivée si « réduire les animations » ou appareil faible.
- **Terrain** (`/c/[code]`, `/c/[code]/table`) : mise en page à part, **aucune** dépendance de la vitrine. Rendu serveur, lisible sans JavaScript, budget **< 100 Ko** vérifié automatiquement dans les tests. Un petit script optionnel (~5 Ko, écrit à la main) gère le direct ; sans JavaScript, la page se rafraîchit toute seule toutes les 30 s. Le service worker garde en mémoire le dernier tirage consulté pour le lire sans réseau.

### Le moteur de tirage

- **Fonctions pures** : on lui donne l'état du concours + une action, il rend le nouvel état. Aucune base, aucun écran.
- **Tirage reproductible** : chaque tirage utilise une « graine » aléatoire enregistrée → on peut toujours expliquer et rejouer un tirage.
- **Formats** : élimination directe, poules + phase finale, système suisse, championnat, mêlée tournante. Complémentaire = un deuxième tableau alimenté par les éliminés.
- **Règles** : aléatoire intégral, éviter le même club au 1er tour, têtes de série, exempts, forfaits, retardataires.
- **Terrains** : file d'attente, attribution dès qu'un terrain se libère, terrains réservés aux finales, estimation de l'heure de fin.
- **Le sport n'est qu'un paramètre** : taille d'équipe, règle de fin de partie (13 points, durée…), critères de classement, nom de l'emplacement (« terrain », « table », « cible »).

### « L'organisateur garde la main » : historique et annulation

Chaque geste de la table de marque est une **action enregistrée** (échanger deux équipes, refaire un tour, déplacer un match, forfait, corriger un score…) avec son action inverse. Annuler = appliquer l'inverse. Tout est daté et attribué (compte ou PIN).

### Réseau faible à la table de marque

Les saisies partent d'abord dans une **file locale sur l'appareil** (IndexedDB), chacune avec un identifiant unique. Elles sont renvoyées automatiquement jusqu'à confirmation ; le serveur ignore les doublons. Un témoin « En ligne / 3 saisies en attente » reste toujours visible.

### Accès table de marque par code PIN

Codes PIN générés par concours, stockés chiffrés (hachés), limités en nombre d'essais. Un PIN valide ouvre une session limitée **à ce concours** et révocable par l'organisateur.

### Paiement → publication

`Créer un concours` → brouillon (sauvegarde automatique) → récapitulatif → Stripe Checkout → **webhook signé vérifié** → statut « publié », lien court + QR code + affiche A4 générés, concours visible dans le catalogue. Le retour du navigateur n'active jamais rien : il affiche seulement « paiement en cours de confirmation ».

---

## 4. Modèle de données

Toutes les tables ont la RLS activée. **Les données privées (licence, téléphone, email) sont dans des tables séparées** que la vue publique ne peut jamais lire : c'est plus sûr que de masquer des colonnes.

### Sports (configuration)

| Table | Rôle | Champs principaux |
|---|---|---|
| `sports` | Un sport = une configuration | `slug`, `name`, `icon`, `accent_color`, `config` (JSON validé : formats autorisés, tailles d'équipe, type d'emplacement, durée type, règles de score, critères de classement, licence par défaut, valeurs par défaut du formulaire), `notification_templates`, `enabled` |

Ajouter les fléchettes = ajouter une ligne et un fichier de configuration, sans toucher au moteur.

### Personnes et clubs

| Table | Champs principaux |
|---|---|
| `profiles` | `id` (= compte), `display_name`, `sports[]`, `level`, `is_licensed`, `city`, `location` (point), `search_radius_km`, `feed_prefs`, `notifications_opt_in`, `locale`, `active_context` (joueur ou club X) |
| `profiles_private` | `license_number`, `phone` — lisible par la personne seule |
| `clubs` | `slug`, `name`, `kind` (club fédéré, association, comité des fêtes, mairie…), `sports[]`, `federation`, `affiliation_number`, `address`, `location`, `default_venue_count`, `contact_name`, `contact_email`, `contact_phone`, `logo_path` |
| `club_members` | `club_id`, `user_id`, `role` (propriétaire, admin, membre) |
| `follows` | `user_id`, `club_id` ou `tournament_id` |

### Concours

| Table | Champs principaux |
|---|---|
| `tournaments` | `club_id`, `sport_slug`, `short_code` (ex. `7KQ2`, sans caractères ambigus), `name`, `status`, `starts_at`, `checkin_closes_at`, `address`, `location`, `parking`, `food`, `poster_path`, `rules_text`/`rules_pdf_path`, `config` (JSON : format d'équipe, catégorie, ouverture, max équipes, formats, tours, complémentaire, règles de tirage, fin de partie, critères, affichage des noms…), `fee`, `prize`, `draw_seed`, `published_at` |
| `tournament_staff` | `tournament_id`, `user_id` (ou vide), `role` (organisateur, co-organisateur, arbitre), `pin_hash`, `label`, `revoked_at` |
| `venues` | `tournament_id`, `label` (« 12 », « Terrain d'honneur »), `position`, `reserved_for_finals`, `available` |
| `teams` | `tournament_id`, `number`, `name`, `club_name`, `status` (inscrite, liste d'attente, pointée, forfait, retirée), `seed`, `bracket` (principal / complémentaire) |
| `players` | `team_id`, `user_id` (facultatif), `first_name`, `last_name`, `category` |
| `players_private` | `license_number` — lisible par l'organisateur et la personne seule |
| `registrations` | `team_id`, `source` (en ligne, sur place), `captain_contact` (privé), `device_token`, `accepted_rules_at` |
| `rounds` | `tournament_id`, `bracket`, `number`, `phase` (poule, tableau…), `status`, `drawn_at` |
| `matches` | `round_id`, `team_a_id`, `team_b_id` (vide = exempt), `venue_id`, `scheduled_at`, `started_at`, `ended_at`, `score_a`, `score_b`, `status` (en attente de terrain, prêt, en cours, score proposé, contesté, terminé, forfait), `version` |
| `score_submissions` | `match_id`, `submitted_by` (table ou capitaine), `score_a`, `score_b`, `confirmed_by`, `status` |
| `tournament_actions` | historique : `actor`, `type`, `payload`, `inverse`, `client_op_id` (anti-doublon), `created_at`, `undone_at` |

**Statuts d'un concours** : `draft → published → registration_closed → check_in → live → finished → archived`.

### Notifications, paiements, contenus, IA, admin

| Table | Rôle |
|---|---|
| `push_subscriptions` | abonnement push d'un appareil, lié à un compte **ou** seulement à une équipe (joueur sans compte) |
| `notifications` | file d'envoi : canal (push, email, sms), modèle, données, statut, date d'envoi |
| `pricing_plans`, `payments` | tarifs configurables ; paiements (identifiant Stripe, montant, statut, lien du reçu). Aucune donnée bancaire. |
| `announcements` | annonces des clubs dans le fil |
| `news_sources`, `news_items` | flux RSS autorisés : titre, source, lien uniquement |
| `kb_documents`, `kb_chunks` | base de connaissances de l'assistant |
| `ai_usage` | questions et coût par compte ou appareil et par jour |
| `app_settings` | modèle IA, quotas, plafond de dépense, interrupteurs (SMS, PayPal…) |
| `legal_pages` | emplacements vides pour CGV, mentions légales, confidentialité |

---

## 5. Phases de construction

Chaque phase se termine par : application lancée, tests passés, démonstration, mise à jour de `CLAUDE.md`, commit et push.

| # | Phase | Contenu | Démonstration |
|---|---|---|---|
| **1** | **Socle** | Monorepo, design system (direction visuelle choisie), modes clair/sombre, Supabase local + schéma + RLS, authentification (lien magique, mot de passe, Google ; Apple prêt), onboarding en 3 modes (une question par écran), navigation (onglets mobile / barre latérale), sélecteur de sport avec accent, « Retrouver mon tirage », données de démonstration, emplacements légaux vides. | Créer un compte joueur, un compte club, continuer en invité, basculer de profil. |
| **2** | **Moteur + lien concours** ⭐ | `packages/engine` complet et testé (impair, forfaits, retardataires, même club, terrains insuffisants, égalités) ; vue publique `/c/7KQ2` (< 100 Ko, sans JS, direct, hors ligne) ; table de marque (pointage, tirage, corrections avec annulation, terrains, scores, file locale réseau faible, PIN) ; impression PDF de secours ; QR code et affiche A4. | Ouvrir le concours de démo « 32 doublettes au 2e tour », trouver son équipe en < 10 s, corriger une erreur de tirage, couper le réseau et saisir un score. |
| **3** | **Espace clubs** | Formulaire en étapes avec valeurs par défaut par sport et brouillon automatique, calcul des terrains et heure de fin, Stripe Checkout en mode test + webhook, publication automatique, tableau de bord club, page publique du club, prix et codes promo dans l'admin. | Créer et payer un concours en < 3 min avec la carte de test Stripe. |
| **4** | **Catalogue** | Liste et carte, filtres, encadrés, inscrits en direct, inscription adaptée au règlement, .ics, « Voir plus » (météo, restaurants, itinéraire, partage). | S'inscrire à un concours depuis le catalogue. |
| **5** | **Fil + notifications** | Fil classé par pertinence (sport, distance, date, clubs suivis), carte « En direct », RSS, PWA, push « À vous de jouer », email de secours, rappels. | Recevoir « À vous ! Terrain 12 · 15 h 40 » sur un téléphone. |
| **6** | **Assistant IA** | Bulle + onglet, streaming, outils branchés sur la base, base de connaissances, refus hors sujet, quotas et suivi des coûts. | Demander « mon prochain match » et « règle du but à 13 ». |
| **7** | **Vidéos** | Storyboard à valider **d'abord**, puis Remotion 16:9 et 9:16, texte de voix off, page « Découvrir et tutoriels ». | Lecture des deux vidéos sur le site. |
| **8** | **Finitions** | Effets « waouh » (3D légère), mesures de performance (< 2 s en 4G), audit d'accessibilité, tests de bout en bout complets, préparation du déploiement. | Rapport Lighthouse + parcours complets. |

---

## 6. Choix faits par défaut (modifiables)

- **Code court** : 4 caractères parmi 31 (sans 0/O, 1/I/L), ~920 000 combinaisons ; passe à 5 si besoin.
- **Noms affichés publiquement** : initiales par défaut, nom complet si l'organisateur le choisit.
- **Saisie des scores** : table de marque par défaut ; option capitaines avec confirmation de l'adversaire.
- **Direct** : sans JavaScript, rafraîchissement toutes les 30 s ; avec JavaScript, mise à jour en quelques secondes.
- **Quotas IA par jour** (modifiables) : invité 5, compte 20, club payant 100 ; plafond global de dépense mensuel en euros dans l'admin.
- **Classement** : victoires → différence de points → points marqués → confrontation directe → tirage au sort.

---

## 7. Ce que j'attends de toi

1. **Valider (ou corriger) ce plan** : stack, découpage, modèle de données.
2. **Choisir une direction visuelle** parmi les 3 maquettes (lien envoyé avec ce plan). Sans réponse, je pars sur la direction A (« Nocturne »), qui est ta direction par défaut.
3. **Rien à créer pour l'instant** : la phase 1 tourne entièrement en local (Supabase local, Stripe en mode test plus tard). Je te donnerai les étapes exactes (Supabase, Stripe, Resend, Anthropic, Turnstile) au moment où chacune devient nécessaire.
