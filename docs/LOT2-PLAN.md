# Lot 2 — plan (demandes du propriétaire)

Les 18 demandes de docs/DEMANDES.md sont découpées en 33 tâches, à réaliser dans cet ordre : moteur (M1-M8), base et serveur (B1-B4), pages terrain (T1-T5), table de marque (TM1-TM3), formulaire (F1-F3), pétanque seule (P1-P3), vitrine (V1-V2), assistant (A1-A2), PIN des bénévoles (K1-K2), puis clôture (Z1). Je n'ai rien modifié dans le dépôt.

Dépendance externe : « LOT1-moteur » désigne les 3 corrections moteur du lot 1 (mêlée, forfait des deux équipes, poule à un seul qualifié). Elles doivent être fusionnées avant M2, M3 et M4, qui touchent les mêmes fonctions de formats.ts (`swapInLaterMatches`, `canDrawNext`, `qualifiers`, `assertNothingDrawnAfter`). Les corrections de l'audit sur le PIN (n° 8, 9, 30, 52), sur la compression (n° 51) et sur la file hors ligne (n° 40) ne sont pas replanifiées ici. Les tâches K1, T4 et TM2 s'appuient dessus.

Peuvent démarrer tout de suite, en parallèle du lot 1 : F1 (retirer l'heure de fin), P1 (désactiver le football), V1 et V2 (vitrine), A1 et A2 (assistant), K1 (explication du PIN), TM1 (évaluation de la table de marque).

Pas de changement d'architecture :
- le moteur reste pur ;
- « pétanque seule » se règle par `enabled: false` dans packages/sports/src/sports/football.ts : `enabledSports()` existe déjà, et le code du football est conservé ;
- l'assistant garde son architecture actuelle : la base de connaissances est enrichie et datée, et la recherche web n'est pas ajoutée sans décision du propriétaire ;
- l'hébergement reste gratuit : la purge passe par pg_cron ou /api/cron/tick, déjà en place.

Choix faits par défaut, qui ne bloquent pas le travail :
- cadrage après la 1re partie pour un concours sans poules ;
- B activé et C désactivé, inscription automatique ;
- l'exempt de la 1re partie ne va pas au B ;
- score d'un exempt 13-7, séparé du score de forfait ;
- clôture définitive par un bouton, ou automatiquement 24 h après la finale ;
- au bout de 14 jours, suppression des noms, contacts, codes et historique ; les paiements, factures et statistiques anonymes sont gardés ;
- pas de recherche web dans l'assistant.

La demande 7 (modèle des pages ludax) attend des captures : T3 avance sur une spécification par défaut, à ajuster quand elles arriveront.

## Règles retenues

TIRAGE D'UN TABLEAU À ÉLIMINATION (A, B ou C), pétanque, bracketMode « redraw »

Notations :
- T : nombre d'équipes encore en lice et pointées ;
- P : la plus grande puissance de 2 inférieure ou égale à T ;
- k : `config.cadrage.afterRound`, qui vaut 1 ou 2 (1 par défaut en pétanque).

1. Avant le cadrage (moins de k parties jouées dans ce tableau, et tableau sans poules) :
   - tirage intégral, 100 % au hasard avec la graine ;
   - si T est impair, une équipe est exempte. Elle est choisie par `chooseBye` (jamais deux fois la même) et reçoit `byeScore` (13-7 par défaut, séparé de `forfeitScore`, qui reste 13-0).
2. Au cadrage et après (après k parties, ou tout de suite après les poules pour la phase finale du A) :
   - si T est une puissance de 2, tirage intégral sans exempt ;
   - sinon, un tour de type `cadrage` : T−P parties, donc 2(T−P) équipes jouent ;
   - les 2P−T autres équipes sont qualifiées « d'office ». Chaque équipe d'office est enregistrée comme une partie « bye » à un seul côté, affichée face à « Office » ;
   - les équipes qui jouent sont choisies au hasard : mélange avec la graine, les 2(T−P) premières jouent (`cadragePairing`) ;
   - « même club évité » s'applique seulement au premier tirage de chaque tableau. En phase finale, on évite de retrouver tout de suite une équipe de sa poule.
3. Filet de sécurité : la même formule s'applique à tous les tours suivants. Un double forfait ou un retrait qui laisse un nombre qui n'est pas une puissance de 2 crée des places d'office (par exemple 7 gagnants : 3 parties et 1 d'office), sans tour supplémentaire. Après le cadrage, le nombre d'équipes est TOUJOURS une puissance de 2.
4. La phase finale après les poules suit `bracketMode` (redraw en pétanque). Le tableau fixe (`buildFixedTree`) reste disponible pour les autres sports.
5. Nom des tours (`roundLabel`, renvoie une clé i18n) :
   - un tour `kind = "cadrage"` s'appelle « Cadrage » ;
   - avant le cadrage : « 1re partie », « 2e partie » ;
   - ensuite, selon le nombre de places en sortie S (S = T/2 si T est une puissance de 2, sinon S = P) : 1 = FINALE, 2 = 1/2 FINALE, 4 = 1/4, puis 8e, 16e, 32e, 64e.
6. Exemples de référence pour les tests, avec k = 1 :
   - 13 équipes : 6 parties + 1 exempt, il en reste 7 ; cadrage 3 parties et 1 d'office, il en reste 4 ;
   - 33 équipes : il en reste 17 ; cadrage 1 partie et 15 d'office, il en reste 16 ;
   - 100 équipes : il en reste 50 ; cadrage 18 parties et 14 d'office, il en reste 32 ;
   - 200 équipes : il en reste 100 ; cadrage 36 parties et 28 d'office, il en reste 64.
   Avec poules (2 qualifiés par poule) : 100 équipes donnent 50 qualifiés, puis 18 parties et 14 d'office, il en reste 32.

CONCOURS B ET C (options)

- `consolation` = `{enabled, source: "losers_round_1" | "pool_non_qualified", entry: "auto" | "opt_in"}`.
- `consolationC` = `{enabled, entry}` : le C reçoit les perdants de la 1re partie du B.
- Le B sans poules prend les perdants de la 1re partie du A. L'exempt de la 1re partie n'y va pas. Le B avec poules prend les non-qualifiés des poules.
- Le B et le C ont leur propre cadrage (même k). Leur 1re partie est toujours un tirage intégral.
- Avec `opt_in` :
  - seules les équipes inscrites par `team.enterBracket {teamId, bracket, enter}` jouent ;
  - le 1er tirage du B ou du C est manuel : la table le lance quand elle a fini d'encaisser ;
  - le montant du droit d'inscription est dans la configuration et le formulaire, à titre d'information. Aucun paiement en ligne.
- Le C n'est possible que si le B compte au moins 4 équipes au départ. Sinon, le conseiller prévient et le moteur ne tire pas le C.
- En base, `bracket_kind` reçoit la valeur `consolation_c`.

FORFAITS ET DÉSISTEMENTS

- Absente au pointage : exclue du tirage, le cadrage absorbe l'écart.
- Partie tirée et une équipe absente : l'adversaire gagne par forfait.
- Partie tirée et les deux équipes absentes : pas de gagnant, la règle 3 crée une place d'office au tour suivant.
- Entre deux tours : l'équipe est exclue, la règle 3 s'applique.
- Qualifiée de poule qui se retire avant le tirage final : `qualifiers()` écarte les forfaits AVANT de couper la liste, et l'équipe suivante de la poule prend la place.
- Avec un seul qualifié, le concours se termine (correction du lot 1).
- B ou C : `enterBracket enter:false` avant le tirage, forfait après.

CONCOURS SUR 2 JOURS

- `pause` = `null | {before: {remaining: 32 | 16 | 8 | 4}} | "afterPools" | {afterRound: n}`.
- `autoAdvance` ne tire pas le tour qui correspond à la pause. La commande `tournament.resume` (ou un tirage manuel) relance l'enchaînement.
- Le B et le C se mettent en pause en même temps que le A.
- Le statut reste `live`. Le moteur ne calcule aucune heure de fin.

LIEN À USAGE UNIQUE ET RÉTENTION

- Dans le moteur :
  - en `finished`, seules les corrections sont acceptées (`match.score`, `match.forfeit`, `match.reopen`, annulation) ;
  - `tournament.close` fait passer de `finished` à `archived` ;
  - en `archived`, tout est refusé, y compris l'annulation (`execute.ts`).
- Dans le serveur :
  - `tournaments.finished_at` ;
  - clôture automatique 24 h après `finished_at`, sauf clôture manuelle avant ;
  - purge à `finished_at` + 14 jours : noms, contacts, codes des équipes, PIN, historique des actions. On garde les paiements, les factures et les compteurs anonymes ;
  - ensuite, la page publique affiche « Résultats supprimés » ;
  - le code court n'est jamais réattribué : la ligne `tournaments` est conservée.
- Les inscriptions, les scores des capitaines et la table de marque sont refusés après la clôture, avec un message clair.

N.H. (NON HOMOGÈNE)

- `Player.club` = `{number, name}`, par exemple `0340901` / `BOULE DU CAP AGDE`. C'est une donnée publique ; la licence reste privée.
- `teamAffiliation(state, teamId)` :
  - tous les joueurs ont le même club : on affiche `(n°/NOM DU CLUB)` et on remplit `team.club` ;
  - au moins deux clubs différents : on affiche `(N.H.)` et `team.club = null`, donc pas de contrainte de club ;
  - aucune information : rien, ou `team.club` saisi à la main.
- Les noms s'affichent en « NOM PRÉNOM », en majuscules.

## Conception détaillée (expert règles)

# Règles du moteur pour la pétanque : cadrage, tirage intégral, concours B et C, forfaits, 2 jours, lien à usage unique, « N.H. »

Je n'ai rien modifié dans le dépôt. Les chiffres viennent d'un petit calcul et les constats sur l'existant renvoient aux lignes du code.

## 0. Ce que fait le moteur aujourd'hui

| Sujet | Code actuel | Écart avec la demande |
|---|---|---|
| Nouveau tirage à chaque tour (`redraw`) | `drawRedrawRound` (formats.ts:143) appelle `randomPairing` (pairing.ts:85) | Avec un nombre impair, un exempt est tiré à chaque tour, jusqu'en demi-finale. Il n'y a **aucun cadrage** (audit n° 12). |
| Tableau fixe (`fixed`) | `buildFixedTree` (formats.ts:128) complète jusqu'à `nextPowerOfTwo` | C'est en fait un « cadrage dès le 1er tour », mais le tableau reste figé ensuite et les cases vides suivent l'ordre des têtes de série. Avec 33 équipes, le complémentaire ne reçoit qu'une équipe (audit n° 14). |
| Phase finale après les poules | `drawElimination` force le tableau fixe pour la phase finale (formats.ts:157, `phase === "final"`), avec les premiers de poule en têtes de série (formats.ts:297) | Ce n'est pas un tirage 100 % aléatoire refait à chaque tour, et il n'y a pas de cadrage. |
| Complémentaire | Un seul tableau `"consolation"`, alimenté par `consolationEntrants` (formats.ts:311) | Pas de C, pas d'inscription volontaire au B, pas de cadrage propre au B. En base : `bracket_kind` = `('main','consolation')`. |
| Forfait entre deux tours | Les gagnants sont filtrés par `stillIn` (formats.ts:167) | Le nombre d'équipes devient impair, ce qui crée un exempt ou un tour de plus. |
| Qualifié de poule qui se retire | `qualifiers()` coupe la liste **avant** d'écarter les forfaits (formats.ts:288-303) | La place est perdue au lieu de revenir à l'équipe suivante de la poule. |
| Fin du concours | `run()` refuse seulement `draft` et `archived` (commands.ts:192). `settle()` repasse `finished` en `live` (commands.ts:161) | Après la fin, toutes les commandes restent possibles. Rien ne clôt le concours. |
| 2 jours | Rien | `autoAdvance` enchaîne les tours sans pause possible. |
| N.H. | `Team.club` est un texte libre ; `Player` n'a pas de club | Impossible de savoir si les joueurs viennent de clubs différents. |

## 1. Règle unique de tirage d'un tableau à élimination (A, B ou C)

On note T le nombre d'équipes encore en lice et pointées pour le tirage, P la plus grande puissance de 2 inférieure ou égale à T, et k la place du cadrage (option `cadrage.afterRound`, 1 ou 2).

1. **Avant le point de cadrage** (moins de k parties jouées dans ce tableau, et tableau sans poules) : tirage intégral. Si T est impair, une équipe est exempte. Elle est tirée au sort, jamais deux fois la même (`chooseBye` existe déjà).
2. **Au point de cadrage et après** (après k parties, ou tout de suite après les poules pour la phase finale du A) :
   - si T est une puissance de 2, tirage intégral, sans exempt ;
   - sinon, on joue **T − P parties de cadrage**, donc **2(T − P) équipes jouent** et **2P − T équipes sont qualifiées « d'office »** ;
   - les équipes qui jouent et celles qui passent d'office sont choisies **100 % au hasard** : mélange avec la graine, les 2(T − P) premières jouent.
   - La contrainte « même club évité » reste appliquée seulement au **premier tirage** de chaque tableau. Pour la phase finale, la même règle évite de retrouver tout de suite une équipe de sa poule.
3. **La même formule sert de filet de sécurité** dans les tours suivants. Si un double forfait laisse 7 gagnants au lieu de 8, on obtient P = 4 : 3 parties et 1 « Office ». C'est bien un 1/4 de finale, sans tour supplémentaire. Après le cadrage, une partie d'office n'apparaît donc **que** dans ce cas.
4. **Nom des tours** :
   - un tour marqué `cadrage` s'appelle « Cadrage » ;
   - avant le cadrage, on écrit « 1re partie » ou « 2e partie » ;
   - ensuite, le nom dépend du nombre de places en sortie S (S = T/2 si T est une puissance de 2, sinon S = P) : 1 = FINALE, 2 = 1/2 FINALE, 4 = 1/4 de finale, puis 8e, 16e, 32e, 64e.
   - L'équipe d'office est enregistrée comme une partie « bye » à un seul côté, affichée face à « Office », grisée, avec le score « ** ».

### Cadrage appliqué directement (par exemple sur les qualifiés des poules)

| T | Parties | Équipes qui jouent | Qualifiées d'office | Équipes restantes |
|---|---|---|---|---|
| 5 | 1 | 2 | 3 | 4 |
| 7 | 3 | 6 | 1 | 4 |
| 13 | 5 | 10 | 3 | 8 |
| 33 | 1 | 2 | 31 | 32 |
| 100 | 36 | 72 | 28 | 64 |
| 200 | 72 | 144 | 56 | 128 |

### Concours sans poules (« p » = parties, « ex » = exempt, « off » = qualifiées d'office)

| N | Cadrage après la 1re partie | Cadrage après la 2e partie |
|---|---|---|
| 5 | 1re partie : 2 p + 1 ex, il reste 3 ; cadrage : 1 p, 1 off, il reste 2 ; finale | 1re : 2 p + 1 ex, il reste 3 ; 2e : 1 p + 1 ex, il reste 2 ; finale, pas de cadrage |
| 7 | 1re : 3 p + 1 ex, il reste 4 ; pas de cadrage ; 1/2 puis finale | Identique |
| 13 | 1re : 6 p + 1 ex, il reste 7 ; cadrage : 3 p, 1 off, il reste 4 ; 1/2 puis finale | 1re : il reste 7 ; 2e : 3 p + 1 ex, il reste 4 ; 1/2 puis finale |
| 33 | 1re : 16 p + 1 ex, il reste 17 ; cadrage : 1 p, 15 off, il reste 16 ; 8e à finale (6 tours en tout) | 1re : il reste 17 ; 2e : 8 p + 1 ex, il reste 9 ; cadrage : 1 p, 7 off, il reste 8 ; 1/4 à finale (6 tours) |
| 100 | 1re : 50 p, il reste 50 ; cadrage : 18 p, 14 off, il reste 32 ; 16e à finale (7 tours) | 1re : il reste 50 ; 2e : 25 p, il reste 25 ; cadrage : 9 p, 7 off, il reste 16 ; 8e à finale (7 tours) |
| 200 | 1re : il reste 100 ; cadrage : 36 p, 28 off, il reste 64 ; 32e à finale (8 tours) | 1re : 100 ; 2e : 50 ; cadrage : 18 p, 14 off, il reste 32 ; 16e à finale (8 tours) |

Avec des poules de 4 et 2 qualifiés, on obtient par exemple : 100 équipes donnent 50 qualifiés, puis un cadrage de 18 parties avec 14 équipes d'office, et il en reste 32. 200 équipes donnent 100 qualifiés, puis 36 parties et 28 d'office, et il en reste 64.

## 2. Concours B et C (tout en option)

- **Origine du B** :
  - sans poules, ce sont les **perdants de la 1re partie du A**, au sens strict. L'exempt de la 1re partie n'y va pas : c'est au plus une équipe ;
  - avec poules, ce sont les **non-qualifiés des poules**.
- **Origine du C** : les perdants de la 1re partie du B.
- Le B et le C ont **leur propre cadrage** avec la même règle et le même k. Leur 1re partie est toujours un tirage intégral, pour que le C reçoive assez d'équipes, même si le B vient des poules.
- **Inscription** : `entry: "auto" | "opt_in"` par tableau.
  - Avec `opt_in` (B payant), seules les équipes inscrites jouent, grâce à une nouvelle commande `team.enterBracket {teamId, bracket, enter}`. Le premier tirage du B ou du C n'est alors **pas automatique** : la table le lance quand elle a fini d'encaisser.
  - Le montant du droit d'inscription n'est **pas** dans le moteur : il va dans le formulaire et la configuration.
- **Avec 5 équipes** : le B a 2 équipes (une finale directe), le C n'aurait qu'une équipe et ne peut pas avoir lieu. Le conseiller doit le refuser ou prévenir (C possible seulement si le B compte au moins 4 équipes au départ).
- Exemples sans poules, cadrage après la 1re partie :
  - 13 équipes : B = 6 équipes, sa 1re partie en laisse 3, cadrage (1 partie, 1 d'office), puis finale ; C = 3 équipes, 1 partie et 1 exempt, puis finale ;
  - 33 équipes : B = 16 équipes, pas de cadrage, de la 1re partie à la finale ; C = 8 équipes ;
  - 100 équipes : B = 50 équipes, 1re partie, il en reste 25, cadrage de 9 parties avec 7 d'office, il en reste 16 ; C = 25 équipes, 12 parties + 1 exempt, il en reste 13, cadrage de 5 parties avec 3 d'office, il en reste 8 ;
  - 200 équipes : B = 100 équipes, C = 50 équipes.

## 3. Forfaits et désistements

| Moment | Règle |
|---|---|
| Absente au pointage | Équipe exclue du tirage (déjà le cas). Le cadrage absorbe l'écart. |
| Partie déjà tirée (avant le cadrage, cadrage, ou après) | L'adversaire gagne par forfait (déjà le cas avec `autoForfeitAbsent`). Si les deux sont absentes, la partie n'a pas de gagnant et la règle 1.3 crée une place « Office » au tour suivant. |
| Entre deux tours, après le cadrage | L'équipe est exclue. La règle 1.3 donne d'office la place libérée à une équipe tirée au sort, sans tour supplémentaire. |
| Qualifiée d'une poule qui se retire avant le tirage final | L'équipe suivante de la poule prend la place : `qualifiers()` doit écarter les forfaits **avant** de couper la liste (`slice`). |
| Pendant les poules | Inchangé : forfait automatique des parties restantes, l'équipe finit dernière de la poule. |
| Inscrite au B ou au C puis absente | `team.enterBracket enter:false` avant le tirage, ou forfait après le tirage. |

**Dépendance au lot 1** : les corrections « forfait des deux équipes » (applyResult / `swapInLaterMatches`) et « un seul qualifié » (`canDrawNext` des poules) doivent être fusionnées **avant** ce chantier. Le lot 1 modifie déjà formats.ts (il y a un nouveau `assertNothingDrawnAfter` à la ligne 571). Avec un seul qualifié, la règle 1 donne T = 1 : le concours se termine.

## 4. Concours sur 2 jours

- Option `pause: { before: {remaining: 32|16|8|4} | "afterPools" | {afterRound: n} } | null`, choisie à la création.
- `autoAdvance` ne tire plus le tour qui correspond à la pause. Une nouvelle commande `tournament.resume` (ou un tirage manuel) relance l'enchaînement. Le B et le C se mettent en pause en même temps que le A.
- Le concours reste en statut `live` pendant la nuit. Le moteur ne calcule aucune heure de fin : `scheduledAt` est l'heure d'attribution du terrain. Les estimations de fin à retirer sont côté web (conseiller, pages).

## 5. Lien à usage unique et conservation des résultats

- **Moteur** :
  - nouvelle commande `tournament.close` (`finished` → `archived`) ;
  - en `finished`, seules les corrections sont acceptées (`match.score`, `match.forfeit`, `match.reopen`, annulation). Tout le reste est refusé (`team.create`, `round.draw`, `team.enterBracket`…) ;
  - en `archived`, tout est refusé (déjà le cas dans `run`). L'annulation (`execute.ts`) doit faire la même vérification.
- **Serveur** :
  - colonne `finished_at` ;
  - clôture automatique au bout d'un délai de grâce ;
  - tâche planifiée de suppression à `finished_at` + 14 jours (noms, contacts, codes, historique). La page publique affiche alors « Résultats supprimés ». Le code court n'est jamais réattribué.

## 6. Affichage « N.H. »

- `PlayerInput` et `Player` reçoivent `club?: {number, name}`, par exemple `0340901` / `BOULE DU CAP AGDE`. C'est une donnée publique ; la licence reste privée.
- Nouvel assistant de calcul pur `teamAffiliation(state, teamId)` :
  - tous les joueurs ont le même club : on affiche `(n°/NOM DU CLUB)` et on remplit `team.club`, pour que la règle « même club évité » fonctionne ;
  - au moins deux clubs différents : `(N.H.)` et `team.club = null`, donc pas de contrainte de club ;
  - aucune information : rien, ou `team.club` saisi à la main.
- Les noms s'affichent « NOM PRÉNOM » en majuscules.
- Base de données : colonnes publiques sur `players` et ajout dans `engine-mapping`.

## 7. Changements précis à faire

1. **types.ts** :
   - `Bracket = "main" | "consolation" | "consolation_c"`. Il faut une migration `alter type bracket_kind add value 'consolation_c'`, puis `pnpm db:types` ;
   - `Round.kind: "partie" | "cadrage"` (migration `rounds.kind`) ;
   - dans `TournamentConfig`, ajouter :
     - `cadrage: {afterRound: 1|2}` ;
     - `consolation: {enabled, source: "losers_round_1"|"pool_non_qualified", entry}` ;
     - `consolationC: {enabled, entry}` ;
     - `pause` ;
     - `byeScore`, séparé de `forfeitScore` (audit n° 13, valeur à fixer par le propriétaire) ;
   - `Player.club` ;
   - `Team.entries?: Bracket[]`.
2. **config.ts** :
   - schéma zod et `resolveConfig`, en gardant la lecture de l'ancien `consolation.enabled` ;
   - les valeurs par défaut viennent de `packages/sports` (pétanque : `redraw`, k = 1, B activé, C désactivé, `entry: "auto"`).
   - Dans le web : « pétanque seule » se règle en désactivant le football dans le catalogue et le formulaire, pas en le supprimant du code.
3. **formats.ts** :
   - remplacer `drawRedrawRound` et le choix fixe/redraw de `drawElimination` (lignes 143-170) par la règle de la section 1, en passant par un nouvel `eliminationDrawPlan(T, playedRounds, k, fromPools)` → `{matches, office, exempt, kind}` ;
   - la phase finale suit `bracketMode` (redraw en pétanque) au lieu de forcer le tableau fixe ;
   - `qualifiers()` écarte les forfaits avant de couper la liste ;
   - `consolationEntrants` est généralisé à (source, tableau parent, inscriptions) ;
   - `drawNext`, `canDrawNext` et `autoAdvance` gèrent les 3 tableaux, l'inscription volontaire et la pause.
   - Le tableau fixe (`buildFixedTree`) reste disponible pour les autres sports.
4. **pairing.ts** : nouveau `cadragePairing(teams, P, rng, opts)` (choix aléatoire de qui joue, puis `randomPairing`). `chooseBye` ne change pas.
5. **queries.ts** : `largestPowerOfTwo`, `roundLabel(state, round)` (renvoie une clé i18n), `teamAffiliation`.
6. **commands.ts** :
   - nouvelles commandes `team.enterBracket`, `tournament.close`, `tournament.resume` ;
   - en `finished`, liste des commandes autorisées ;
   - `isTournamentComplete` tient compte des 3 tableaux.
7. **Tests** :
   - N = 2, 3, 5, 7, 13, 33, 100, 129, 200, 256, avec k = 1 et k = 2, avec et sans poules ;
   - B et C avec inscription volontaire ;
   - double forfait après le cadrage (7 gagnants : 3 parties et 1 d'office) ;
   - retrait d'un qualifié de poule ;
   - pause du 2e jour ;
   - refus des commandes après la clôture ;
   - un test aléatoire qui vérifie qu'après le cadrage le nombre d'équipes est toujours une puissance de 2.

**Effort** : section 1 = M, 2 = M, 3 = S, 4 = S, 5 = S (moteur) + M (serveur), 6 = S (moteur) + M (saisie et affichage).

## Questions pour le propriétaire

1. **Délai avant la clôture définitive.** Le lien à usage unique va contre la règle « l'organisateur peut tout corriger ». Proposition : corrections possibles jusqu'au bouton « Clore définitivement », ou automatiquement 24 h après la finale.
2. **Ce qui est supprimé au bout de 14 jours.** Proposition : noms, contacts, codes et historique. On garde les paiements et factures, que la loi oblige à conserver, ainsi que les statistiques anonymes du club.

Les autres choix ont une valeur par défaut et ne bloquent pas le développement :
- l'exempt de la 1re partie ne va pas au B ;
- le score d'un exempt est à fixer (13-7 proposé par l'audit) ;
- en phase finale, une équipe ne retrouve pas tout de suite une équipe de sa poule.

Fichiers concernés :
- /home/user/Misticone/packages/engine/src/formats.ts
- /home/user/Misticone/packages/engine/src/pairing.ts
- /home/user/Misticone/packages/engine/src/config.ts
- /home/user/Misticone/packages/engine/src/types.ts
- /home/user/Misticone/packages/engine/src/commands.ts
- /home/user/Misticone/packages/engine/src/queries.ts
- /home/user/Misticone/packages/sports/src/sports/petanque.ts
- /home/user/Misticone/supabase/migrations/20261012000100_core_schema.sql

## Tâches

### M1 — Moteur : types et configuration (cadrage, B/C, pause, byeScore, clubs des joueurs)
- Agent : `expert-regles-concours` · effort S · dépend de : —
- Fichiers : packages/engine/src/types.ts, packages/engine/src/config.ts, packages/sports/src/schema.ts, packages/sports/src/sports/petanque.ts, packages/sports/src/sports/football.ts
- Spécification : Ajouter les types suivants :
- Bracket : 'consolation_c' ;
- Round.kind : 'partie' | 'cadrage' ;
- dans TournamentConfig : cadrage {afterRound: 1|2}, consolation {enabled, source, entry, feeCents?}, consolationC {enabled, entry, feeCents?}, pause, byeScore ;
- Player.club? {number, name} ;
- Team.entries?: Bracket[].

Mettre à jour le schéma zod et resolveConfig. L'ancien consolation.enabled et losersOfRound doit toujours se lire (migration en lecture).

Les valeurs par défaut sont déclarées dans packages/sports :
- pétanque : redraw, k=1, B auto activé, C désactivé, byeScore 13-7 ;
- football : tableau fixe, comportement actuel conservé.

Aucune logique de tirage dans cette tâche.
- Acceptation : pnpm --filter @orgasport/engine test passe. Un état stocké avec l'ancienne configuration donne une configuration résolue équivalente (test). Les valeurs par défaut de la pétanque sont vérifiées par un test dans packages/sports.

### M2 — Moteur : règle unique de tirage avec cadrage (A et phase finale)
- Agent : `expert-regles-concours` · effort M · dépend de : M1, LOT1-moteur
- Fichiers : packages/engine/src/formats.ts, packages/engine/src/pairing.ts, packages/engine/src/queries.ts, tests *.test.ts
- Spécification : Ajouter les fonctions suivantes :
- eliminationDrawPlan(T, playedRounds, k, fromPools) → {matches, office, exempt, kind} ;
- cadragePairing(teams, P, rng, opts) ;
- largestPowerOfTwo ;
- roundLabel(state, round), qui renvoie une clé i18n.

Remplacer drawRedrawRound et le choix fixe/redraw de drawElimination (formats.ts:143-170). La phase finale après les poules suit bracketMode (redraw en pétanque) au lieu de forcer le tableau fixe. On évite de retrouver tout de suite une équipe de sa poule.

Le filet de sécurité (règle 3) s'applique à chaque tour. Une équipe d'office est enregistrée comme une partie « bye » à un seul côté, dans un tour kind='cadrage'. Le tableau fixe reste disponible pour les autres sports.
- Acceptation : Tests pour N = 2, 3, 5, 7, 13, 33, 100, 129, 200, 256, avec k = 1 et k = 2, avec et sans poules : nombres de parties, d'équipes d'office et d'exempts conformes aux tableaux de rules_spec. Un double forfait après le cadrage avec 7 gagnants donne 3 parties et 1 d'office. Les noms de tours sont corrects (Cadrage, 1/4, 1/2, FINALE). Les 80 tests existants restent verts ; ceux qui dépendaient de l'ancien comportement sont mis à jour et la raison est expliquée.

### M3 — Moteur : un qualifié de poule qui se retire est remplacé par le suivant
- Agent : `expert-regles-concours` · effort S · dépend de : LOT1-moteur
- Fichiers : packages/engine/src/formats.ts (qualifiers, l. 288-303), tests
- Spécification : Écarter les équipes forfait ou retirées AVANT le slice des qualifiés. L'équipe suivante de la poule prend la place si le tableau final n'est pas encore tiré.
- Acceptation : Test : poule de 4, le 2e se retire avant le tirage final, alors le 3e est qualifié. Après le tirage final, rien ne change : la règle de correction actuelle s'applique.

### M4 — Moteur : concours B et C (origine, inscription volontaire, cadrage propre)
- Agent : `expert-regles-concours` · effort M · dépend de : M2
- Fichiers : packages/engine/src/formats.ts (consolationEntrants, drawNext, canDrawNext, autoAdvance), packages/engine/src/commands.ts, tests
- Spécification : Généraliser consolationEntrants à (source, tableau parent, inscriptions) :
- B : perdants de la 1re partie du A (sans l'exempt) ou non-qualifiés des poules ;
- C : perdants de la 1re partie du B.

Nouvelle commande team.enterBracket {teamId, bracket, enter}, refusée après le 1er tirage du tableau visé, avec son inverse dans tx.ts.

En opt_in, pas de tirage automatique du 1er tour du B ou du C. Le C est refusé si le B a compté moins de 4 équipes au départ.

isTournamentComplete tient compte des 3 tableaux.
- Acceptation : Tests :
- 13 équipes : B = 6 (1re partie, cadrage 1+1, finale), C = 3 ;
- 33 équipes : B = 16, C = 8 ;
- 100 équipes : B = 50, puis 25, cadrage 9 parties et 7 d'office, il en reste 16 ;
- opt_in : seules les équipes inscrites sont tirées, le tirage est manuel, l'annulation de enterBracket fonctionne ;
- 5 équipes : le C n'est pas tiré et le concours peut se terminer.

### M5 — Moteur : concours sur 2 jours (pause et reprise)
- Agent : `expert-regles-concours` · effort S · dépend de : M4
- Fichiers : packages/engine/src/formats.ts (autoAdvance), packages/engine/src/commands.ts, tests
- Spécification : config.pause est évalué avant chaque tirage automatique. S'il est atteint, aucun tirage n'est fait et l'état indique pausedAt.

tournament.resume (ou round.draw manuel) relance l'enchaînement. Le B et le C se mettent en pause en même temps que le A.

Aucune heure n'est calculée.
- Acceptation : Tests : pause {remaining: 16} avec 64 équipes, alors le tour des 1/8 n'est pas tiré tant que resume n'a pas été lancé ; afterPools ; le B et le C sont en pause eux aussi ; l'annulation de resume fonctionne.

### M6 — Moteur : lien à usage unique (statut finished limité, tournament.close)
- Agent : `expert-regles-concours` · effort S · dépend de : M1
- Fichiers : packages/engine/src/commands.ts (run l. 192, settle l. 161), tests
- Spécification : En finished, seules les commandes match.score, match.forfeit et match.reopen sont autorisées. Toutes les autres renvoient TOURNAMENT_FINISHED.

Nouvelle commande tournament.close, qui fait passer de finished à archived. En archived, tout est refusé. settle ne fait plus repasser archived en live.
- Acceptation : Tests : team.create, round.draw et team.enterBracket sont refusés en finished ; une correction de score en finished est acceptée et recalcule le classement ; tout est refusé après close.

### M7 — Moteur : appartenance au club et N.H.
- Agent : `expert-regles-concours` · effort S · dépend de : M1
- Fichiers : packages/engine/src/queries.ts, packages/engine/src/commands.ts (team.create, PlayerInput), tests
- Spécification : teamAffiliation(state, teamId) renvoie {kind: 'club', number, name}, {kind: 'nh'} ou {kind: 'none'}.

team.create remplit team.club quand tous les joueurs ont le même club et le laisse vide quand l'équipe est N.H. La règle « même club évité » utilise ce résultat.
- Acceptation : Tests : 3 joueurs du même club donnent ce club ; 2 clubs différents donnent nh et aucune contrainte de club au tirage ; sans information, le club saisi à la main est conservé.

### M8 — Moteur : test aléatoire massif des invariants de tirage
- Agent : `expert-regles-concours` · effort S · dépend de : M4, M5, M6
- Fichiers : packages/engine/src/*.fuzz.test.ts (modèle des tests aléatoires existants)
- Spécification : Concours aléatoires, de 2 à 300 équipes, avec k = 1 ou 2, avec ou sans poules, B et C activés ou non, forfaits aléatoires et pauses. Les concours sont joués jusqu'au bout.
- Acceptation : Invariants vérifiés sur 2 000 graines :
- après le cadrage, le nombre d'équipes est toujours une puissance de 2 ;
- au plus un exempt par tour avant le cadrage ;
- jamais deux fois le même exempt quand c'est évitable ;
- chaque concours se termine ;
- annuler chaque action ramène à l'état précédent.
Le test dure moins de 30 s en CI.

### B1 — Base : migration (consolation_c, rounds.kind, club des joueurs, inscriptions B/C, finished_at)
- Agent : `developpeur-serveur` · effort M · dépend de : M1, M7
- Fichiers : supabase/migrations/2026101600xxxx_cadrage_bc.sql, packages/db/src/engine-mapping.ts, packages/db/src/database.types.ts, supabase/tests/rls.sql
- Spécification : La migration ajoute :
- alter type bracket_kind add value 'consolation_c' ;
- rounds.kind ('partie', 'cadrage') ;
- players.club_number et players.club_name, publics ;
- la table team_bracket_entries (team_id, bracket) ou une colonne tableau sur teams ;
- tournaments.finished_at et tournaments.purged_at.

Aucune nouvelle politique d'écriture côté client : l'écriture passe par le serveur seulement, comme l'exige la migration 20261015000100. Mettre à jour engine-mapping dans les deux sens, puis lancer pnpm db:types. apply_tournament_changes doit accepter les nouveaux champs.
- Acceptation : pnpm db:reset puis pnpm test:db passent. Le test aller-retour d'engine-mapping couvre le cadrage, le C, les clubs et les inscriptions. Les tests RLS prouvent que ces tables ne sont pas modifiables par un client.

### B2 — Serveur : clôture (finished_at, clôture auto 24 h, annulation refusée après clôture)
- Agent : `developpeur-serveur` · effort S · dépend de : B1, M6
- Fichiers : apps/web/src/lib/tournament/execute.ts, apps/web/src/app/api/cron/tick/route.ts, apps/web/src/app/api/t/[code]/*
- Spécification : finished_at est écrit quand le moteur passe en finished et effacé si le concours repasse en live.

Le cron tick envoie tournament.close 24 h après finished_at. L'annulation et les commandes sont refusées sur un concours archived, avec un message en français dans i18n.
- Acceptation : Tests Vitest d'execute et du cron : clôture faite à 24 h et pas avant ; annulation refusée en archived ; correction de score acceptée en finished.

### B3 — Serveur : conservation 14 jours puis suppression (tâche planifiée)
- Agent : `developpeur-serveur` · effort M · dépend de : B2
- Fichiers : supabase/migrations/…_purge.sql (fonction purge_finished_tournaments, rôle service), apps/web/src/app/api/cron/tick ou pg_cron, docs/DEPLOIEMENT.md
- Spécification : La fonction SQL idempotente supprime, pour les concours archived dont finished_at date de plus de 14 jours :
- players, players_private, registrations ;
- team_secrets et tournament_staff ;
- tournament_actions, notifications et abonnements liés ;
- les noms d'équipes, rendus anonymes.

Elle garde payments, les factures, la ligne tournaments (code jamais réattribué) et les compteurs anonymes, puis remplit purged_at.

Elle est lancée chaque jour par pg_cron en production et par le cron tick en local.
- Acceptation : Un test SQL dans supabase/tests prouve qu'un concours de 15 jours est purgé, qu'un concours de 13 jours ne l'est pas, que les paiements restent, qu'une 2e exécution ne fait rien et que le générateur de codes ne réutilise pas le code. La page /c/CODE d'un concours purgé affiche « Résultats supprimés » (test e2e ou unitaire de render).

### B4 — Notifications : textes pour le cadrage, l'Office, les tableaux B/C et la pause
- Agent : `developpeur-serveur` · effort S · dépend de : M4, M5
- Fichiers : apps/web/src/lib/notifications/templates.ts, packages/sports/src/sports/petanque.ts (modèles), i18n
- Spécification : Qualifiée d'office : message « Qualifiés d'office pour le tour suivant ». Inscription au B confirmée. Annonce « Reprise demain » lors d'une pause. Aucune notification quand une partie est seulement replacée.
- Acceptation : notifications.test.ts couvre chaque nouvel événement ; les clés anti-doublon sont uniques.

### T1 — Pages terrain : modèle de vue des tirages façon resultats-ppf
- Agent : `developpeur-web` · effort M · dépend de : M2, M4, M7, B1
- Fichiers : apps/web/src/terrain/view-model.ts, apps/web/src/lib/names.ts, apps/web/src/i18n/fr/*
- Spécification : Pour chaque tableau (A, B, C), produire une section par tour, la plus récente en haut. Le libellé vient de roundLabel. Chaque ligne contient :
- le terrain (« T.8 », vide pour une équipe d'office) ;
- les 2 équipes, chacune avec ses joueurs « NOM PRÉNOM » en majuscules, un par ligne, puis « (n°/CLUB) », « (N.H.) » ou rien ;
- le statut perdante (pour la griser) ;
- le score, ou « ** » tant que la partie n'est pas jouée ;
- « Office » face à une équipe d'office.

Le choix « noms complets / initiales » de lib/names.ts reste respecté.
- Acceptation : Tests unitaires de view-model : concours de 13 équipes avec cadrage, ordre des sections, Office, N.H., perdante, « ** ».

### T2 — Pages terrain : rendu en grands tableaux (Terrain | Équipe | Équipe | Score)
- Agent : `developpeur-web` · effort M · dépend de : T1
- Fichiers : apps/web/src/terrain/render.ts, apps/web/src/terrain/terrain.css, apps/web/src/app/c/[code]/route.ts
- Spécification : Un <table> HTML simple par tour, avec un titre de section « Résultats Cadrage » ou « 1/4 de finale ». Les cases perdantes et Office sont grisées par des tokens de couleur, pas de couleur en dur.

En haut de page : onglets ou ancres A, B, C, le lien « Résultats par équipes » et le rappel « Ctrl+F pour chercher, F5 pour actualiser ». La mise en avant de « mon équipe » et le prochain match en tête de page sont conservés : priorité 1, moins de 10 s.

Pas de flex gap, aucun JS nécessaire.
- Acceptation : Comparaison visuelle avec docs/references/tirage-*.jpg (capture à valider par le propriétaire). Page lisible sans JS. Taille de 7KQ2 inférieure à 100 Ko ; 256 équipes jouées jusqu'au bout tiennent sous 100 Ko compressés (mesure dans le test). e2e : un joueur trouve son prochain match en tête de page.

### T3 — Pages terrain : « Résultats par équipes » et page des inscrits
- Agent : `developpeur-web` · effort S · dépend de : T1
- Fichiers : apps/web/src/app/c/[code]/equipes/route.ts (nouveau), apps/web/src/terrain/render.ts
- Spécification : Route HTML légère :
- liste alphabétique des équipes, avec joueurs, club ou N.H., statut (pointée, en lice, éliminée au tour X, tableau B ou C) et parcours tour par tour ;
- ancre par équipe, pensée pour Ctrl+F ;
- avant le tirage, cette page sert de liste des inscrits, sur le modèle ludax « Page_Inscrits ». Les colonnes seront ajustées quand les captures arriveront.
- Acceptation : Fonctionne sans JS. Page de moins de 100 Ko pour 256 équipes. Les données privées (licences, contacts) n'apparaissent pas (test). Lien présent depuis T2.

### T4 — Pages terrain : vieux ordinateurs et sans réseau
- Agent : `expert-performance` · effort M · dépend de : T2, T3
- Fichiers : apps/web/public/sw.js, apps/web/src/terrain/live-script.ts, apps/web/src/terrain/render.ts, apps/web/e2e/*
- Spécification : Ce qui est réaliste :
- une page déjà ouverte reste lisible sans réseau grâce au service worker, qui garde le dernier tirage et la page des équipes ;
- un tout premier accès sans réseau est impossible ; la solution de secours est le bouton « Enregistrer pour hors ligne », qui télécharge un fichier .html autonome (CSS intégré, sans script), et l'impression.

À faire :
- vérifier le ES5 (aucune syntaxe ES2015 dans live-script) et un rendu correct sans flexbox gap ni grid ;
- les styles d'impression doivent donner les tableaux façon ppf ;
- live-script : actualisation avec délai aléatoire (lien avec l'audit n° 29), F5 reste la méthode documentée.
- Acceptation : Test Playwright :
- un contexte hors ligne recharge /c/7KQ2 et affiche le dernier tirage ;
- le fichier .html téléchargé s'ouvre en file:// sans réseau ;
- un analyseur ES5 (acorn ecmaVersion 5) accepte live-script.
Sur un navigateur ancien (Firefox ESR 52 ou Chrome 49 si disponible, sinon contrôle statique du CSS), le rendu est lisible : capture.

### T5 — Pages terrain : états terminé, clôturé et supprimé
- Agent : `developpeur-web` · effort S · dépend de : B2, B3, T2
- Fichiers : apps/web/src/app/c/[code]/route.ts, score/, inscription/, table/
- Spécification : finished : bandeau « Concours terminé », résultats finaux, formulaires d'inscription et de score des capitaines désactivés. archived : idem, plus « Lien clôturé ». purged : page minimale « Résultats supprimés ». La table de marque n'est plus accessible par PIN après la clôture.
- Acceptation : Tests e2e ou unitaires de chaque état. Un POST sur score ou inscription d'un concours clôturé est refusé avec un message clair, sans erreur 500.

### TM1 — Table de marque : évaluation réaliste (vieil ordinateur, sans réseau)
- Agent : `expert-performance` · effort S · dépend de : —
- Fichiers : apps/web/src/components/table/*, apps/web/src/app/c/[code]/table/, next.config.ts, browserslist
- Spécification : Mesurer et rédiger, dans la réponse et non dans un fichier rapport :
- navigateurs minimum réellement supportés par le bundle Next 16 (visiblement Chrome/Edge 109, la dernière version sous Windows 7, et Firefox ESR) ;
- poids JS de la page ;
- temps de saisie sur un processeur bridé 6x ;
- comportement après un rechargement sans réseau : la page Next ne se recharge pas aujourd'hui sans service worker.

Proposer les limites à annoncer au propriétaire, par exemple « ordinateur de 2012 et plus avec Chrome 109 ou plus ; un navigateur plus ancien utilise la feuille imprimée ».
- Acceptation : Chiffres mesurés : poids, temps d'interaction avec processeur bridé, liste des navigateurs testés. Liste des points bloquants qui alimente TM2.

### TM2 — Table de marque : réouverture sans réseau et feuilles imprimées de secours
- Agent : `developpeur-web` · effort M · dépend de : TM1
- Fichiers : apps/web/public/sw.js, apps/web/src/components/table/store.ts, apps/web/src/components/table/PrintTab.tsx
- Spécification : Le service worker garde en cache la page table et ses morceaux JS après une première ouverture en ligne. L'état du moteur et la file d'envoi sont relus depuis localStorage au rechargement. Le témoin de connexion reste visible.

PrintTab imprime les tirages au format ppf (T2), comme solution de secours sur papier.

La correction du score qui disparaît après une coupure (audit n° 40) vient de l'autre lot ; ne pas la refaire.
- Acceptation : Test Playwright : ouvrir en ligne, couper le réseau, recharger, saisir 3 scores, rétablir le réseau ; les 3 scores sont en base, une seule fois chacun.

### TM3 — Table de marque : gestion du cadrage, des tableaux B/C, de la pause et de la clôture
- Agent : `developpeur-web` · effort M · dépend de : M4, M5, M6, B1
- Fichiers : apps/web/src/components/table/tabs.tsx, ui.tsx, src/lib/tournament/command-schema.ts, i18n
- Spécification : Ajouter :
- onglet ou filtre A, B, C ;
- en opt_in : liste à cocher « Inscrit au B / C » (team.enterBracket), puis bouton « Tirer le B » ;
- les tours de cadrage avec les équipes Office ;
- bouton « Reprendre le concours » quand il est en pause ;
- bouton « Clore définitivement », éloigné des actions courantes, avec double confirmation (lien avec l'audit n° 7).

command-schema accepte les nouvelles commandes.
- Acceptation : e2e : concours de 13 équipes avec B opt_in, inscription de 4 équipes au B, tirage du B, pause puis reprise, clôture. Fonctionne aussi hors ligne : la file d'envoi rejoue team.enterBracket.

### F1 — Retirer toute heure de fin et toute estimation de durée
- Agent : `developpeur-web` · effort S · dépend de : —
- Fichiers : apps/web/src/lib/tournament-form/advisor.ts, build.ts, components/tournament-form/FormatAdvisor.tsx, VenuePlan.tsx, plan.ts, app/c/[code]/calendrier.ics/route.ts, lib/ics.ts, lib/tournament/load.ts, lib/assistant/tools.ts, pages détail et catalogue, i18n, apps/videos (textes)
- Spécification : Le conseiller garde « terrains nécessaires au 1er tour » mais n'affiche plus ni heure de fin, ni durée, ni « parties retardées en heures ».

On n'écrit plus estimated_end_at : la colonne reste, valeur null. Le .ics utilise seulement DTSTART (événement sans fin, ou VALUE=DATE). L'assistant ne donne jamais d'heure de fin.

Rechercher « fin », « estim », « durée » et endTime dans i18n et les composants.
- Acceptation : La recherche de endTime, estimated_end et des textes « fin prévue » ou « durée » ne trouve plus rien dans l'interface. ics.test est mis à jour. Les tests et e2e existants passent.

### F2 — Formulaire de création : options cadrage, B/C, inscription au B, 2 jours
- Agent : `developpeur-web` · effort M · dépend de : M1, F1
- Fichiers : apps/web/src/components/tournament-form/steps/DrawStep.tsx, SummaryStep.tsx, apps/web/src/lib/tournament-form/(schéma, valeurs par défaut, conseiller), i18n
- Spécification : Dans l'étape Tirage :
- cadrage : « après les poules » automatique avec poules, sinon « après la 1re / 2e partie » ;
- concours B oui/non, avec l'origine (perdants de la 1re partie / non-qualifiés des poules) et l'inscription (automatique / sur inscription, avec droit d'inscription en euros, information seulement) ;
- concours C oui/non ;
- « Concours sur 2 jours » : pause avant les 1/16, 1/8, 1/4 ou 1/2, ou après les poules.

Tout est prérempli par le sport. Le conseiller prévient si le C est impossible (B de moins de 4 équipes attendues). Le droit d'inscription du B est affiché sur la page détail et sur l'affiche.
- Acceptation : form.test vérifie les valeurs par défaut et qu'un ancien brouillon (draft_form) se relit. Le form_snapshot payé donne la bonne configuration du moteur (test de build). Capture de l'étape.

### F3 — Formulaire : création complète en 5 minutes maximum
- Agent : `designer-ux` · effort M · dépend de : F2, P1
- Fichiers : apps/web/src/components/tournament-form/TournamentWizard.tsx, steps/*, e2e/
- Spécification : Mesurer le parcours actuel en nombre d'écrans, de champs obligatoires et de clics. Replier les options avancées (C, montant, pause) derrière « Plus d'options ». Avec la pétanque seule, l'étape du choix du sport disparaît. Les valeurs par défaut doivent suffire.

Le déplacement des co-organisateurs et des PIN plus loin dans le parcours (audit, choix produit) est proposé avec une maquette avant d'être fait.
- Acceptation : Test e2e chronométré : un concours en doublette, sans poules, avec B auto, C et 2 jours, créé jusqu'au paiement en 25 interactions ou moins. Un test manuel par une personne qui découvre l'outil prend 5 minutes ou moins. Le nombre d'interactions est noté avant et après.

### P1 — Pétanque seule : football désactivé partout (sans supprimer le code)
- Agent : `developpeur-web` · effort S · dépend de : —
- Fichiers : packages/sports/src/sports/football.ts (enabled:false), apps/web/src/components/catalog/AdoptSport.tsx, tournament-form/SportPicker.tsx, onboarding, lib/prefs.ts, lib/data/catalog, admin, i18n/fr/landing3d.ts, tests *.test.ts qui citent football
- Spécification : Tous les écrans visibles utilisent enabledSports(). getSport() continue de résoudre le football pour les concours existants. Un cookie os_sport=football est ramené à la pétanque. Le choix du sport est masqué s'il n'y a qu'un seul sport actif. Les tests du moteur sur le football sont conservés.
- Acceptation : La recherche de « foot » dans le HTML rendu de l'accueil, du catalogue, du formulaire, de l'onboarding et du profil ne trouve rien (test e2e). Le test « réactiver football = un booléen » passe. pnpm -r test passe.

### P2 — Données de démo : pétanque uniquement, avec cadrage, B/C et N.H.
- Agent : `developpeur-serveur` · effort M · dépend de : M4, M7, B1, P1
- Fichiers : packages/db/scripts/generate-seed.ts, supabase/seed.sql (généré), e2e/*, docs/DEMO.md, CLAUDE.md
- Spécification : Retirer FT8S. 7KQ2 : 32 doublettes, cadrage après la 1re partie, B activé, clubs des joueurs avec un mélange d'équipes homogènes et N.H. Ajouter un concours terminé avec cadrage et C, et un concours en pause (2e jour). Mettre à jour les e2e qui utilisaient FT8S.
- Acceptation : pnpm seed:gen && pnpm db:reset, puis pnpm test:e2e passent. La démo montre un tour « Cadrage » avec des équipes Office et des étiquettes N.H.

### P3 — Vidéos : pétanque seule, terrains sans clignotement, rendu à refaire
- Agent : `designer-ux` · effort L · dépend de : V1, V2, T2
- Fichiers : apps/videos/src/scenes, apps/videos/src/three, apps/videos/src/data, docs/videos/storyboard.md, apps/web/src/i18n/fr/videos.ts, apps/web/public/videos
- Spécification : Retirer le ballon et le football du storyboard et des scènes. Reprendre la boule de V2 et la correction anti-clignotement de V1 (même cause : plans superposés, scintillement des néons). Montrer les tirages au nouveau format et les options B/C. Rendre les 4 vidéos et les sous-titres WebVTT.
- Acceptation : Les 4 MP4 sont rendus sans aucune image de football. Une revue image par image d'un extrait des terrains ne montre aucun scintillement. Les sous-titres sont à jour et le poids des fichiers ne dépasse pas l'actuel de plus de 10 %.

### V1 — Vitrine 3D : rendu net et fluide, sans tremblement ni clignotement
- Agent : `expert-performance` · effort M · dépend de : —
- Fichiers : apps/web/src/components/vitrine/heroScene3d.ts, SportHero.tsx, landing.css
- Spécification : Causes à corriger :
- clignotement des terrains : plans superposés au même niveau (lignes et sol), à corriger par polygonOffset ou un léger décalage ; aussi les animations d'intensité des néons et l'acné des ombres ;
- tremblement : amortissement de la caméra dépendant du nombre d'images par seconde (lerp sans delta), bruit du pointeur, pixelRatio qui varie. À corriger par un amortissement exponentiel avec delta, un seuil mort sur le pointeur et un pixelRatio fixe (au plus 2) ;
- netteté : antialias ou MSAA, couleurs correctes (sRGB et tone mapping).

Le chargement différé et la règle « seulement si l'appareil est assez puissant » ne changent pas.
- Acceptation : Capture Playwright de 10 s à 60 i/s, image fixe sans défilement : la différence entre images est nulle sur les terrains et le décor. FPS stable sur une machine de test, et le LCP de l'accueil ne se dégrade pas. loadPolicy.test passe.

### V2 — Vitrine : boule réaliste argent très foncé, gravure ORGASPORT, plus de ballon
- Agent : `designer-ux` · effort M · dépend de : —
- Fichiers : apps/web/src/components/vitrine/ballModel.ts, ballGeometry.ts, heroScene3d.ts, SportHero.tsx, scripts/render-hero-balls.mjs, public/vitrine/*.webp, i18n/fr/landing3d.ts
- Spécification : Boule lisse comme docs/references/boule-reference.png, sans rainures ni stries. Matière : metalness 1, roughness d'environ 0,2 à 0,3, couleur argent très foncé (environ #2b2d31), avec des reflets doux d'environnement.

Gravure « ORGASPORT » en relief creux, dans le style de la police capitale de la référence : carte normale et carte de relief générées depuis un canvas, aucune police externe. Une seule gravure, aucune autre marque.

Retirer la bascule boule et ballon. Rendre à nouveau les images fixes de secours.
- Acceptation : Capture comparée à la référence, à valider par le propriétaire (seule validation visuelle demandée). Plus aucune géométrie de ballon chargée. Les images webp de secours sont régénérées et le poids du module 3D ne dépasse pas l'actuel.

### A1 — Assistant : périmètre sport et site élargi
- Agent : `developpeur-serveur` · effort S · dépend de : —
- Fichiers : apps/web/src/lib/assistant/prompt.ts, suggestions.ts, assistant.test.ts
- Spécification : Le prompt autorise explicitement :
- les questions de sport (règles, conseils de jeu, organisation de concours) ;
- les questions sur le site (fonctions, prix, PIN, tirage, B/C, 2 jours, conservation des résultats).

Les informations officielles d'un concours viennent toujours des outils et de la base. L'assistant ne donne jamais d'heure de fin. Les suggestions d'accueil sont mises à jour.
- Acceptation : Tests : une question sur le règlement et une question « comment marche le PIN » ne sont plus refusées ; une question hors sujet est toujours refusée poliment.

### A2 — Assistant : base de connaissances enrichie et datée (site et règlements)
- Agent : `developpeur-serveur` · effort M · dépend de : A1, M4, M5
- Fichiers : packages/db/scripts/kb-content.ts, reference-data.ts, supabase/reference.sql (généré), apps/web/src/lib/assistant/tools.ts, apps/web/src/app/(app)/admin/assistant
- Spécification : Fiches d'aide sur le site : chaque fonction, le PIN, le cadrage, Office, N.H., B/C, 2 jours, la clôture et la suppression à 14 jours.

Fiches de règlement : résumé du règlement officiel de la pétanque, avec la source et la date de version. L'outil de recherche les renvoie avec la source et l'assistant cite « règlement en vigueur au … ».

L'admin peut modifier ou ajouter des fiches. Une alerte admin se déclenche si un règlement n'a pas été revu depuis 12 mois. Les autres sports seront ajoutés le jour où ils seront activés.

Pas de recherche web : décision du propriétaire, pas de changement d'architecture.
- Acceptation : pnpm --filter @orgasport/db reference:gen fonctionne. Les tests de l'outil de recherche trouvent la fiche « cadrage » et la fiche « PIN ». Sans clé API, la réponse de secours cite ces fiches.

### K1 — PIN bénévole : explication claire dans l'interface
- Agent : `designer-ux` · effort S · dépend de : —
- Fichiers : apps/web/src/components/table/PinForm.tsx, page membres et PIN du club (club/…/staff), tournament-form (étape des PIN), i18n
- Spécification : Phrase type : « Le PIN est un code à donner à un bénévole qui n'a pas de compte : il ouvre la table de marque de ce concours seulement, pendant 24 h, sur son téléphone. Vous pouvez le révoquer à tout moment. »

Schéma en 3 étapes : créer, donner, le bénévole saisit. L'aide est affichée là où l'organisateur crée les PIN et sur l'écran de saisie.

Les corrections de l'audit sur le PIN (n° 8, 9, 30, 52) sont dans l'autre lot ; ne pas les refaire.
- Acceptation : Captures sur téléphone et ordinateur, sans débordement. Textes dans i18n. Test d'un utilisateur : l'organisateur sait expliquer le PIN après lecture.

### K2 — PIN bénévole : fiche à imprimer et à donner (QR code et PIN)
- Agent : `developpeur-web` · effort S · dépend de : K1
- Fichiers : apps/web/src/app/c/[code]/table/, apps/web/src/components/table/PrintTab.tsx ou nouvelle route /c/[code]/benevole (HTML léger), qr.svg
- Spécification : Fiche A6 ou A4 : nom du concours, QR code vers /c/CODE/table (sans le PIN dans l'URL, par sécurité), PIN en grand, 3 étapes d'utilisation. Elle est générée depuis la gestion des PIN.

Option « PIN unique de la table » proposée à l'organisateur : un seul PIN par concours créé par défaut au paiement, d'autres PIN facultatifs.
- Acceptation : La fiche s'imprime sur une page. Le QR code scanné ouvre l'écran PIN du bon concours. Le PIN n'est jamais dans une URL ni dans les journaux (test).

### Z1 — Clôture du chantier : documentation, tâche de purge en production, recette complète
- Agent : `integrateur-deploiement` · effort S · dépend de : B3, T4, TM3, F3, P2, P3, V1, V2, A2, K2
- Fichiers : CLAUDE.md, docs/DEPLOIEMENT.md, docs/DEMO.md, docs/PLAN.md
- Spécification : Documenter :
- la planification pg_cron de la purge et de la clôture automatique ;
- les navigateurs supportés (résultat de TM1) ;
- l'option « réactiver le football » ;
- les nouvelles règles de tirage.

Puis lancer la recette de fin de phase.
- Acceptation : pnpm -r test, pnpm test:db, pnpm test:e2e et pnpm build sont verts. Captures de la page des tirages (cadrage, Office, N.H.), de la vitrine et de la fiche bénévole. CLAUDE.md est à jour : plus de FT8S, pétanque seule, rétention de 14 jours.

## Questions pour le propriétaire

- Clôture définitive du lien : elle va contre la règle « l'organisateur peut tout corriger ». Je propose que les corrections restent possibles jusqu'au bouton « Clore définitivement », ou automatiquement 24 h après la finale. Est-ce que cela vous convient ? Sans réponse, on applique ce choix.
- Score d'un exempt avant le cadrage : c'est une règle de jeu. Je propose 13-7, à la place du 13-0 actuel qui avantage l'exempt au goal-average. Est-ce que cela vous convient ? Sans réponse, on applique 13-7.
