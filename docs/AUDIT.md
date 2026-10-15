# Audit — phase 1 (15/10/2026)

Rapport des 9 auditeurs, trié par les 3 chefs de pôle. Aucune modification n'a été faite.
Légende : **[vous]** = demande une action ou une décision du propriétaire. Effort : S (petit), M (moyen), L (gros).

## Pôle produit

> Le pôle produit n'est pas encore prêt pour la vente. Le moteur de tirage est solide, mais 5 défauts peuvent gâcher un concours le jour J : des formats « mêlée » mal combinés, une correction de double forfait qui fausse la suite, une poule unique qui bloque la fin du concours, une équipe exclue du tirage après « Annuler forfait », et des noms d'équipes illisibles au pointage sur téléphone. J'ai vérifié ces constats dans le code et ils sont confirmés. Tout le reste relève de l'équité des règles, du confort mobile et de la finition.

### Critique (5)

**1. Les concours « à la mêlée » peuvent faire jouer les gens seuls ou à 4 contre 4** — effort M, confié à `expert-regles-concours`

- Pourquoi : Vérifié dans le code. Le formulaire contrôle le type d'équipe et le format du concours chacun de son côté (schema.ts, sportIssues), sans les relier. « Mêlée (doublettes tirées) » avec « Élimination » donne une inscription individuelle (registration-rules.ts:54) sans aucune étape qui forme les doublettes : les joueurs jouent donc seuls. « Doublette » avec « Mêlée tournante » donne teamSize = 2 (config.ts:47), soit 2 équipes par côté : 4 contre 4. C'est un format très courant en pétanque et il devient inutilisable le jour J.
- Correction : Interdire ces combinaisons dans le formulaire et sur le serveur, en déclarant dans packages/sports les formats de concours permis pour chaque format d'équipe. Ajouter des tests. Une commande « tirer les doublettes » avant un concours classique serait une nouvelle fonctionnalité : elle reste à proposer au propriétaire plus tard.

**2. Corriger un « forfait des deux équipes » après coup élimine un vainqueur ou qualifie une équipe forfait, sans prévenir** — effort S, confié à `expert-regles-concours`

- Pourquoi : Vérifié : swapInLaterMatches (formats.ts:548) s'arrête sans rien dire quand le nombre de gagnants change (passage de « forfait des deux » à un vrai score, ou l'inverse). La correction est acceptée, mais la suite du tableau reste fausse. On s'en aperçoit sur le terrain, avec des contestations.
- Correction : Dans applyResult, quand l'ancien ou le nouveau résultat est un forfait des deux équipes, refuser la correction avec le message « annulez d'abord le tour suivant » tant que des matchs suivants concernent ces équipes (hors tableau fixe). Ajouter les deux scénarios en tests.

**3. Poules avec un seul qualifié au total : le dernier score est refusé et le concours ne peut pas se terminer** — effort S, confié à `expert-regles-concours`

- Pourquoi : Vérifié : canDrawNext (formats.ts:465-469) autorise le tableau final dès que les poules sont finies, sans vérifier qu'il reste au moins 2 qualifiés. Le tirage automatique échoue alors et annule la saisie du score. Le concours est bloqué le jour J, surtout pour les petits concours.
- Correction : Exiger au moins 2 qualifiés encore en lice. Sinon, terminer le concours avec le vainqueur de poule comme vainqueur. Dans le formulaire, empêcher qu'il y ait moins de 2 qualifiés au total (qualifiés × poules < 2).

**4. « Annuler forfait » fait disparaître du tirage une équipe présente** — effort S, confié à `designer-ux`

- Pourquoi : Vérifié : le bouton remet l'équipe « inscrite » (tabs.tsx:144), alors que le tirage ne retient que les équipes « pointées » dès qu'au moins une l'est (queries.ts:59). Une équipe présente et qui a payé est exclue sans aucun avertissement. Le risque est d'autant plus réel que « Forfait » part en un seul toucher.
- Correction : Remettre l'équipe dans son état précédent (« pointée » si elle l'avait été). Avant le tirage, afficher la liste des équipes inscrites mais non pointées.

**5. Table de marque sur téléphone : au pointage, le nom des équipes est réduit à une lettre** — effort S, confié à `designer-ux`

- Pourquoi : Vérifié dans le code (tabs.tsx:136-139) : le bloc du nom peut rétrécir jusqu'à zéro, si bien que les boutons « Présente » et « Forfait » prennent toute la place. Le pointage est la première action de la journée. Le bénévole risque de pointer ou de mettre forfait la mauvaise équipe.
- Correction : Sous la taille tablette, mettre le nom sur sa propre ligne et les boutons en dessous. Le nom complet doit rester lisible.

### Important (10)

**6. « Forfait » et « Clore le concours » partent au premier toucher, sans confirmation** — effort S, confié à `designer-ux`

- Pourquoi : Un toucher à côté donne un 13-0 ou clôt le concours, et des notifications partent aux joueurs. Seul le nouveau tirage demande une confirmation. On peut corriger après coup, mais rien ne guide le bénévole pour le faire.
- Correction : Reprendre le principe du double toucher déjà utilisé pour le nouveau tirage (« Confirmer le forfait de l'équipe 13 ? »), ou afficher un bandeau « Annuler » pendant quelques secondes. Éloigner « Clore » des actions courantes.

**7. Saisie rapide des scores : une erreur de frappe passe sans aucun message** — effort S, confié à `designer-ux`

- Pourquoi : Une saisie invalide ne déclenche aucun message visible, et « 12 x 7 » envoie une valeur non numérique au moteur. Le bénévole croit le score enregistré alors qu'il ne l'est pas. Le champ n'a pas non plus de libellé pour les lecteurs d'écran.
- Correction : Vérifier avant l'envoi que les deux scores sont des nombres entiers. Afficher un message d'erreur en rouge (role=alert) qui rappelle le format attendu. Ajouter un libellé au champ et raccourcir le texte d'aide (« 12 13 7 »).

**8. Page du code PIN plus large que l'écran du téléphone** — effort S, confié à `designer-ux`

- Pourquoi : C'est la porte d'entrée du bénévole : il doit faire défiler sur le côté et le bouton d'ouverture est coupé. Le premier contact paraît peu professionnel.
- Correction : Permettre au champ PIN de rétrécir (w-full min-w-0) et rappeler le nom du concours au-dessus.

**9. En-tête de la table de marque trop haut sur téléphone, nom du concours coupé** — effort S, confié à `designer-ux`

- Pourquoi : L'en-tête prend environ 40 % de l'écran et le nom du concours n'est pas lisible : il reste moins de place pour travailler, et le bénévole ne voit pas sur quel concours il est.
- Correction : Mettre le nom du concours sur une ligne complète, résumer la sous-ligne en « 7KQ2 · PIN », mettre le témoin de connexion et « Quitter » sur une seule ligne, et déplacer le lien vers la page publique. Le témoin de connexion doit rester visible.

**10. Un concours complet est affiché « Inscriptions ouvertes » dans le fil et sur le tableau de bord du club** — effort M, confié à `designer-ux`

- Pourquoi : Vérifié : hors du catalogue, la carte n'a pas d'information d'inscription (window: null, model.ts:156) et affiche le statut brut « publié ». Le joueur et le club lisent deux informations contradictoires.
- Correction : Calculer l'état des inscriptions (ouvertes, liste d'attente, complet, fermées) pour toutes les cartes, avec le même calcul que le catalogue.

**11. Code de concours erroné : la page d'erreur ne propose pas de retaper le code** — effort S, confié à `designer-ux`

- Pourquoi : Vérifié dans route.ts:20-23 : la page ne propose qu'un bouton « Voir » vers une autre page. C'est un aller-retour de plus, alors que l'objectif est que le joueur trouve son match en moins de 10 secondes.
- Correction : Mettre directement dans cette page le petit formulaire « code + Voir le tirage » (sans JS) qui mène à /tirage/aller.

**12. Équité : en élimination avec nouveau tirage à chaque tour, une équipe peut arriver en finale grâce à un exempt** **[vous]** — effort M, confié à `expert-regles-concours`

- Pourquoi : C'est le réglage par défaut en pétanque. Un exempt à presque chaque tour, jusqu'en demi-finale, est contestable par les licenciés. L'usage fédéral est de ramener le nombre d'équipes à une puissance de 2 dès le premier tour (le « cadrage »). Changer une règle de jeu par défaut doit être décidé par le propriétaire.
- Correction : Ajouter une option « cadrage au 1er tour », proposée par défaut en pétanque et déclarée dans packages/sports. L'exempt à chaque tour reste disponible en option.

**13. Équité : un exempt compte comme une victoire 13-0 et classe mieux qu'une vraie victoire** **[vous]** — effort S, confié à `expert-regles-concours`

- Pourquoi : Le même score sert pour le forfait et pour l'exempt. En suisse, en mêlée tournante et en poules, être exempt devient un avantage au goal-average, ce qui fausse les qualifications et les lots. La valeur à retenir est une règle de jeu : elle revient au propriétaire.
- Correction : Séparer le score d'exempt du score de forfait, avec une valeur par défaut déclarée dans packages/sports (par exemple 13-7 en pétanque).

**14. En tableau fixe, le concours complémentaire promis est presque vide** — effort S, confié à `expert-regles-concours`

- Pourquoi : Le complémentaire prend les perdants du tour 1 au sens strict. Or en tableau fixe, beaucoup d'équipes sont exemptes au tour 1 et jouent leur première partie au tour 2. Résultat : 4 équipes au complémentaire sur 20 inscrites, aucune sur 129. Les équipes n'ont pas le complémentaire annoncé sur l'affiche.
- Correction : Prendre les équipes qui ont perdu leur première partie réellement jouée (sans compter les exempts). Ajouter des tests avec 20 et 129 équipes.

**15. Poules mal découpées : poules de 2 équipes, ou poules où tout le monde se qualifie** — effort S, confié à `expert-regles-concours`

- Pourquoi : Vérifié dans pairing.ts:211 : 5 équipes en poules de 3 donnent une poule de 3 et une poule de 2, et 7 équipes donnent 3/2/2. Le formulaire permet aussi de qualifier toute une poule de 3. Le club ne s'en aperçoit qu'une fois le tirage fait.
- Correction : Ne jamais faire de poule de moins de 3 équipes, quitte à agrandir une poule. Limiter le nombre de qualifiés à la taille de la plus petite poule moins 1, et l'afficher dans le conseiller de format.

### Amélioration (10)

**16. Heures coupées en fin de ligne (« 13 h » puis « 30 » à la ligne)** — effort S, confié à `designer-ux`

- Pourquoi : Vérifié dans format.ts:15 : ce sont des espaces ordinaires. C'est une finition, mais visible sur toutes les pages, y compris le jour du concours.
- Correction : Utiliser des espaces insécables autour du « h » dans formatTime.

**17. Concours de démonstration : l'historique des actions est vide** — effort M, confié à `expert-regles-concours`

- Pourquoi : En rendez-vous commercial, on ne peut pas montrer l'historique et l'annulation, qui sont un argument fort (« l'organisateur peut tout corriger »).
- Correction : Faire enregistrer par le générateur de la démo les actions qu'il joue déjà, au moins pour 7KQ2, puis régénérer la démo (pnpm seed:gen).

**18. Ordre de départage en pétanque différent de l'usage (confrontation directe trop tardive, pas de Buchholz en suisse)** **[vous]** — effort M, confié à `expert-regles-concours`

- Pourquoi : Le classement peut différer de ce qu'attendent arbitres et licenciés. Comme c'est une règle de jeu, le propriétaire doit valider l'ordre exact.
- Correction : Proposer l'ordre victoires → confrontation directe → goal-average particulier → goal-average général → points marqués. Ajouter un critère « victoires des adversaires » (Buchholz) pour le suisse, dans packages/sports.

**19. Système suisse : trop de revanches dans les petits concours** — effort S, confié à `expert-regles-concours`

- Pourquoi : Le nombre de tours n'est pas plafonné : avec 2 équipes sur 5 tours, c'est 5 fois le même match. Quand la recherche normale échoue, l'appariement de secours ne cherche pas à éviter les revanches.
- Correction : Plafonner le nombre de tours selon le nombre d'équipes, et faire chercher au secours l'appariement qui donne le moins de revanches.

**20. Impossible de jouer une partie en 11 points** **[vous]** — effort S, confié à `expert-regles-concours`

- Pourquoi : La cible de 13 points est fixe. Les clubs qui jouent leurs poules ou leurs concours jeunes en 11 points ne peuvent pas saisir leurs scores. C'est un nouveau réglage, à valider par le propriétaire.
- Correction : Ajouter un réglage « points pour gagner », borné par le sport, à l'étape « fin de partie » du formulaire.

**21. Liste d'attente : rien ne se passe quand une équipe se désiste** — effort M, confié à `expert-regles-concours`

- Pourquoi : La place libérée reste vide si l'organisateur oublie de promouvoir une équipe, et l'équipe promue n'est pas prévenue.
- Correction : Avant le tirage, proposer la promotion de la première équipe en attente quand une place se libère, et la notifier.

**22. La bulle de l'assistant cache le raccourci « Tout le reste par défaut » du formulaire de création** — effort S, confié à `designer-ux`

- Pourquoi : Le raccourci le plus utile pour publier vite est en partie masqué sur téléphone.
- Correction : Masquer ou remonter la bulle sur les pages qui ont une barre d'actions fixe (formulaire de création, table de marque).

**23. Liens trop petits à toucher en bas des pages concours** — effort S, confié à `designer-ux`

- Pourquoi : « Affiche A4 », « Table de marque » et « Retour » mesurent 17 à 20 px de haut, sous le minimum d'accessibilité de 24 px.
- Correction : Agrandir la zone de toucher dans terrain.css (padding vertical, sans flex gap pour rester compatible avec les anciens navigateurs).

**24. Pas de lien « Aller au contenu » pour la navigation au clavier** — effort S, confié à `designer-ux`

- Pourquoi : Accessibilité : les personnes qui naviguent au clavier ou avec un lecteur d'écran doivent parcourir toute la navigation à chaque page.
- Correction : Ajouter ce lien, visible quand il reçoit le focus, dans la structure commune des pages de l'application, avec son texte dans i18n/fr.ts.

**25. Formulaire de création : les questions secondaires passent avant le nom et la date du concours** **[vous]** — effort S, confié à `designer-ux`

- Pourquoi : Commencer par les co-organisateurs et les codes PIN donne une impression de complexité. Changer l'ordre des étapes est un choix produit, à soumettre au propriétaire.
- Correction : Commencer par l'étape « général » (nom, date, lieu) et placer « qui utilisera le lien ? » juste avant le récapitulatif. La validation de chaque étape reste la même.

<details><summary>Constats écartés par le chef</summary>

- (aucun faux positif) — J'ai vérifié dans le code les constats les plus discutables (mêlée, double forfait, poule unique, Annuler forfait, découpage des poules, statut des cartes, page d'erreur, format des heures) : ils sont tous confirmés. Les deux rapports ne se recoupent pas. « Forfait sans confirmation » et « Annuler forfait exclut du tirage » sont liés mais restent séparés : le premier est un défaut d'interface, le second un défaut de règle.

</details>

## Pôle technique

> Non, le pôle technique n'est pas encore prêt pour la vente. Le code est propre et tous les tests unitaires passent, mais quatre problèmes graves sont confirmés dans le code. Un bénévole qui a un compte peut modifier la base directement, sans laisser de trace. N'importe qui peut faire recharger en boucle les téléphones des spectateurs. Les grands concours (plus de 200 équipes environ) perdent des données sans aucune alerte. Enfin, la page publique ne tient pas la charge quand tous les joueurs la consultent en même temps. Presque toutes les corrections sont ciblées (effort S ou M) et ne demandent aucun changement d'architecture.

### Critique (4)

**26. Un bénévole ou un admin de club peut modifier directement les scores, les équipes et les accès, sans historique et sans annulation possible** — effort M, confié à `expert-securite`

- Pourquoi : Vérifié dans supabase/migrations/20261012000200_rls.sql. Aucune migration ultérieure ne supprime les politiques « for all » sur matches, teams, venues, players, players_private, registrations et tournament_staff (lignes 111-160). De plus, can_manage_tournament accorde ce droit à tout membre de tournament_staff, quel que soit son rôle. Conséquences : la règle non négociable « écriture uniquement via executeCommand » est contournée, un PIN révoqué peut être réactivé, un bénévole peut se promouvoir organisateur, et un club peut dépasser le nombre d'équipes de son forfait payé. Les données, l'argent et le déroulement du concours sont menacés.
- Correction : Écrire une migration qui supprime les politiques d'écriture côté client sur ces 7 tables et garde seulement la lecture (le serveur écrit déjà avec le rôle service). Réserver si besoin la lecture des contacts et des licences aux rôles organizer et co_organizer. Dans /api/t/[code]/staff, n'accepter qu'un admin de club ou le rôle 'organizer'. Ajouter les cas correspondants dans supabase/tests/rls.sql.

**27. N'importe qui peut envoyer de faux messages « mise à jour » qui font recharger en boucle tous les téléphones des spectateurs, au risque de faire couper l'hébergement gratuit** — effort M, confié à `expert-securite`

- Pourquoi : Vérifié. execute.ts:56 diffuse les mises à jour avec private:false, et live-script.ts:17 recharge la page dès qu'une version plus grande arrive, sans limite. La clé publique figure dans chaque page. Une simple boucle curl déclenche environ une requête serveur par spectateur toutes les 0,8 s. Sur l'offre gratuite, le site peut être mis en pause pour tous les clubs.
- Correction : Passer le canal en privé (Realtime Authorization) : tout le monde peut lire le sujet tournament:%, seul le serveur (rôle service) peut écrire. Mettre private:true dans broadcastUpdate et dans l'abonnement de la page. Côté page : au plus un rechargement toutes les 10 à 15 s, et ignorer un numéro de version plus de 50 au-dessus de la version actuelle.

**28. Grands concours (environ 200 équipes ou 1 000 matchs et plus) : noms des joueurs et matchs perdus sans alerte, notifications non envoyées** — effort M, confié à `expert-performance`

- Pourquoi : Vérifié dans load.ts:83-85. La requête .in("team_id", teamIds) contient tous les identifiants d'équipes dans l'adresse : au-delà d'environ 210 équipes, la base répond « adresse trop longue » (erreur 414), et l'erreur est ignorée (players.data ?? []). Aucune requête n'est paginée alors que la base renvoie au plus 1 000 lignes (max_rows) : joueurs et matchs sont tronqués. Le moteur calcule alors appariements et classement sur un état faux. recipients() dans les notifications a le même défaut. Or le formulaire accepte jusqu'à 1024 équipes : c'est un défaut de produit vendu, qui touche les plus gros concours.
- Correction : Lire les joueurs par jointure sur le concours (teams!inner(tournament_id)), comme le fait déjà team_secrets. Paginer avec .range() les joueurs, matchs et équipes, dans un ordre stable. Vérifier chaque .error et lever une exception : executeCommand ne doit jamais calculer sur un état incomplet. Dans recipients(), filtrer par concours ou découper la liste en paquets de 100. Ajouter un test d'intégration avec 512 triplettes et plus de 1 000 matchs, et un test du moteur avec 512 équipes plafonné en durée.

**29. Le jour du concours, tous les téléphones rechargent la page à la même seconde et le serveur relit tout le concours à chaque fois : 5 à 10 s d'attente sur un gros concours** — effort M, confié à `expert-performance`

- Pourquoi : Vérifié dans route.ts (no-store, loadTournament à chaque requête) et dans live-script.ts:14 (rechargement fixe 800 ms après chaque score, sans délai aléatoire). Mesure de l'auditeur : 2 000 clients sur 512 équipes donnent une attente médiane de 5,1 s, et jusqu'à 18,9 s. Cela va directement contre la priorité n° 1 (trouver son match en moins de 10 s) et peut aussi ralentir la table de marque, qui partage la même base.
- Correction : En deux temps, sans changer l'architecture. (1) Tout de suite : un délai aléatoire de 0,5 à 6 s avant chaque rechargement (S). (2) Un cache court du rendu par code et par state_version, avec une seule requête légère pour lire la version, et un cache CDN de 3 à 5 s sur ?fragment=1 sans cookie d'équipe. Refaire la mesure avec 2 000 clients.

### Important (21)

**30. Code PIN de la table de marque : on peut tenter des centaines de PIN d'un coup, ou au contraire bloquer tous les bénévoles pendant 15 minutes** — effort S, confié à `expert-securite`

- Pourquoi : Vérifié dans pin/route.ts:20-26. La limite n'est que lue avant la vérification et n'est comptée qu'après un échec : des requêtes envoyées en parallèle passent toutes. Et quand le plafond de 60 échecs par concours est atteint, même un PIN correct est refusé : un mauvais joueur peut paralyser la table le jour J. Les deux auditeurs proposent des corrections contraires, que j'ai donc arbitrées ici.
- Correction : Limite par appareil : la compter de façon atomique AVANT la vérification (8 essais par 15 min), sur le préfixe /64 en IPv6. Limite par concours : ne compter que les échecs et ne jamais refuser un PIN valide (les PIN générés ont 6 chiffres). Ajouter des tests unitaires de clientIp et de la route (9e essai renvoie 429, un PIN valide passe même après 60 échecs).

**31. Un lien piégé peut renvoyer un organisateur vers un faux site juste après sa connexion** — effort S, confié à `expert-securite`

- Pourquoi : Le filtre de redirection n'accepte que les chemins qui commencent par « / » et refuse « // », mais il ne vérifie pas « /\ ». Or les navigateurs interprètent « /\site » comme un autre domaine. Cela permet un hameçonnage crédible depuis le vrai domaine, contre des comptes qui gèrent paiements et données personnelles.
- Correction : Créer une fonction unique safeInternalPath(next), utilisée par la page de connexion, AuthForm et auth/callback : refuser « \ », les caractères de contrôle et « // », et vérifier que new URL(next, origin).origin === origin. Ajouter un test unitaire.

**32. Saisie par les capitaines : le code d'équipe à 4 chiffres peut être deviné en changeant d'adresse internet, ce qui permet de valider un faux score** — effort S, confié à `expert-securite`

- Pourquoi : Vérifié dans score/route.ts:31. La seule limite est fixée par adresse IP complète (20 essais par 15 min). En IPv6, une box dispose de milliards d'adresses. Une fois le code adverse trouvé, une équipe valide seule sa victoire.
- Correction : Ajouter une limite par équipe visée (10 échecs par 15 min, en ne comptant que les échecs). Calculer la clé IPv6 sur le préfixe /64 dans clientIp, ce qui profite à toutes les limites. Passer le code à 6 chiffres est à arbitrer avec le chef produit, car il est imprimé sur la liste.

**33. Un concurrent peut bloquer les inscriptions en ligne d'un concours pendant une heure** — effort S, confié à `expert-securite`

- Pourquoi : Le plafond de 300 inscriptions par concours et par heure est consommé AVANT la vérification anti-robot Turnstile. 300 envois sans jeton valide suffisent à faire répondre « trop de demandes » aux vrais joueurs.
- Correction : Vérifier Turnstile d'abord, et ne compter dans le plafond du concours que les envois qui l'ont passé. Garder la limite par IP, calculée sur le préfixe /64.

**34. Les abonnements aux notifications acceptent n'importe quelle adresse : le serveur peut être utilisé pour contacter des sites choisis par un attaquant, et la file d'envoi peut être saturée** — effort S, confié à `expert-securite`

- Pourquoi : Le seul contrôle porte sur https:// : aucune liste des services de notification autorisés. Des abonnements factices peuvent retarder les vraies alertes « À vous de jouer », puisque la file n'envoie que 200 messages par minute, les plus anciens d'abord.
- Correction : Mettre dans le schéma zod une liste blanche des hôtes push (fcm.googleapis.com, *.push.services.mozilla.com, *.push.apple.com, *.notify.windows.com). Plafonner le nombre d'abonnements par équipe. Envoyer en priorité les « your_turn ».

**35. Un double clic sur « S'inscrire » (réseau lent) crée deux équipes** — effort S, confié à `relecteur-code`

- Pourquoi : Vérifié dans register.ts:43 : un nouvel identifiant d'opération aléatoire est tiré à chaque envoi, donc la protection anti-doublon ne joue jamais. Le formulaire sans JS ne bloque pas le bouton. Les équipes fantômes prennent des places, faussent le tirage et doivent être retirées à la main.
- Correction : Ajouter un jeton caché dans le formulaire et en dériver le clientOpId, pour qu'un second envoi soit reconnu comme doublon et renvoie la même confirmation. Tests : deux POST identiques donnent une seule équipe (test unitaire et e2e sans JS).

**36. Inscription en ligne : si l'enregistrement des coordonnées échoue, le joueur voit « inscrit » mais le club n'a ni son téléphone, ni son email, ni ses licences** — effort S, confié à `relecteur-code`

- Pourquoi : Vérifié dans register.ts:82 : l'erreur de register_team_private est seulement écrite dans les journaux, puis la fonction renvoie ok:true. C'est rare, mais personne n'en est averti.
- Correction : Réessayer une fois. Si l'échec persiste, annuler la création de l'équipe (undo de l'action) et renvoyer « busy » pour que le joueur recommence. Ajouter un test unitaire avec un appel rpc en erreur.

**37. Après un désistement, un nouvel inscrit passe devant la liste d'attente, et l'organisateur peut dépasser le nombre d'équipes payé** **[vous]** — effort M, confié à `expert-regles-concours`

- Pourquoi : Vérifié dans le moteur (commands.ts:196-204) : le retrait d'une équipe ne fait pas remonter la première équipe en attente, et team.setStatus ne contrôle pas la capacité. C'est injuste pour les joueurs et cela fait perdre du chiffre d'affaires (le prix dépend du nombre d'équipes). Le choix de la règle relève du pôle produit.
- Correction : Choix à faire par le propriétaire, sur avis de l'expert des règles : soit la première équipe en attente est promue automatiquement lors d'un retrait, soit les nouvelles inscriptions sont refusées tant qu'une liste d'attente existe. Ajouter un contrôle de capacité dans setStatus. Écrire les tests moteur : retrait avant le tirage, retrait après le tirage, promotion au-delà de la capacité.

**38. Saisie des scores par les capitaines : matchs bloqués ou litiges effacés quand deux saisies se croisent, et message « score invalide » affiché alors que le serveur est seulement occupé** — effort M, confié à `relecteur-code`

- Pourquoi : Vérifié dans score/route.ts:57-77. La confrontation des deux saisies n'est pas atomique : chaque capitaine lance match.score avec un identifiant différent. Un échec, même un simple « occupé », est affiché « invalid ». Un nul en phase finale de foot n'est jamais signalé à la table. Un capitaine qui ressaisit après un litige efface le signal « Litige ». Le jour J, la table ne voit pas ces matchs bloqués.
- Correction : Dériver le clientOpId du match et du score (la seconde validation est alors traitée comme un doublon). En cas d'échec de match.score, marquer le match « disputed ». Ne jamais remplacer « disputed » par « score_submitted ». Distinguer BUSY (« réessayez dans un instant ») d'un score réellement invalide.

**39. Quand plusieurs scores arrivent en même temps, la moitié des saisies échoue avec « serveur occupé »** — effort S, confié à `expert-performance`

- Pourquoi : Mesure de l'auditeur : sur 10 saisies simultanées, 5 reçoivent une erreur 409. Les 4 nouvelles tentatives d'execute.ts partent immédiatement, sans attente. La table de marque finit par renvoyer ses saisies, mais avec du retard au moment des fins de parties.
- Correction : Attendre un délai croissant avec une part aléatoire entre les tentatives (50 à 300 ms), et faire 6 à 8 tentatives. Ajouter un test de saisies simultanées.

**40. Table de marque : après une coupure réseau, un score déjà enregistré disparaît de l'écran pendant 20 s, et le bénévole le ressaisit en double** — effort S, confié à `relecteur-code`

- Pourquoi : Vérifié dans store.ts:177. Pour un doublon, le serveur renvoie changes:[], qui vaut « vrai » en JavaScript : la copie locale passe à la version suivante SANS appliquer le score. C'est précisément le cas « réseau instable » pour lequel la table hors ligne a été conçue.
- Correction : Si body.duplicate est vrai ou si changes est vide, recharger l'état avec fetchState(). Extraire la boucle d'envoi en fonction pure et la tester : ordre conservé, 409 rejoué, 422 mis en échec, doublon qui recharge l'état.

**41. Des joueurs peuvent recevoir deux fois la même notification** — effort M, confié à `relecteur-code`

- Pourquoi : Vérifié dans notifications/server.ts:231-285. dispatchQueued lit les lignes « queued » sans les réserver. Il est lancé après chaque action et chaque minute par le cron : deux envois proches traitent donc les mêmes lignes. Les doublons font amateur et consomment le quota d'emails gratuit.
- Correction : Ajouter une fonction SQL claim_notifications (update … set status='sending' … for update skip locked returning *), qui remet les lignes en « queued » après un échec temporaire et récupère celles restées en « sending » depuis plus de 5 min.

**42. Notifications lentes et emails de secours limités sur un gros concours : un appel par joueur, calculs refaits chaque minute, plafond de 100 emails par jour chez Resend (offre gratuite)** **[vous]** — effort M, confié à `expert-performance`

- Pourquoi : recipients() appelle getUserById pour chaque joueur, l'un après l'autre (notifications/server.ts:86-95). Les rappels de la veille sont recalculés à chaque minute. L'envoi est plafonné à 200 messages par minute. Un tirage de 512 équipes retarde donc « À vous de jouer » au-delà de la durée de validité du message (15 min), et le quota Resend gratuit est dépassé dès le premier rappel.
- Correction : Récupérer les emails en une seule requête (fonction SQL en rôle service). Noter qu'un rappel est déjà en file pour ne pas le recalculer. Enchaîner les lots tant qu'il reste du temps, environ 20 s. Limiter les emails par concours et l'afficher à l'organisateur. Passer à un Resend payant est une décision du propriétaire.

**43. Tirage automatique : des concours abandonnés sont retentés sans fin et finissent par bloquer le tirage à l'heure pour tous les clubs** — effort S, confié à `relecteur-code`

- Pourquoi : Vérifié dans auto-draw.ts:12-18. La requête prend 20 concours au plus, sans ordre, et un échec (moins de 2 équipes) n'est jamais enregistré : 20 concours sans inscrits suffisent à bloquer tous les autres. De plus, chaque visite de la page publique relance le tirage complet en parallèle au moment précis où tout le monde regarde. Aucun test ne couvre le cron.
- Correction : Trier par autoDrawAt. Enregistrer la tentative et l'échec, pour ne pas retenter avant une modification (inscription, pointage). Prévenir l'organisateur. Ne déclencher le filet de la page publique que si l'heure est dépassée de plus de 90 s, et au plus une fois par minute. Tests : refus du cron sans CRON_SECRET (401), deux appels au même instant ne donnent qu'un seul tirage.

**44. Chaque score saisi relit tout le concours deux à trois fois** — effort S, confié à `expert-performance`

- Pourquoi : executeCommand charge l'état. Puis notifyFromChanges le recharge entièrement, alors qu'il est déjà en mémoire. La route des capitaines le charge aussi une fois de plus. La charge en base est doublée ou triplée au pire moment.
- Correction : Transmettre loaded.meta et result.state à notifyFromChanges, et ne relire l'état qu'en cas de conflit de version.

**45. Offres gratuites dépassées sur un gros concours : direct limité à 200 connectés, reconnexions toutes les 5 s, risque de mise en pause du site** **[vous]** — effort M, confié à `expert-performance`

- Pourquoi : Supabase gratuit plafonne à 200 connexions temps réel. Au-delà, les téléphones retentent toutes les 5 s et passent au rafraîchissement toutes les 30 s, même onglet masqué. Les crédits Netlify peuvent s'épuiser en un week-end. Fixer un seuil de taille, ou passer à une offre payante, est une décision du propriétaire, puisque l'hébergement doit rester gratuit.
- Correction : Espacer les reconnexions de plus en plus, avec une part aléatoire (de 5 à 60 s). Ne pas rafraîchir un onglet masqué. Passer à 60 s sans temps réel. Ne pas ouvrir de connexion temps réel sur /concours/[code] pendant le concours. Documenter les quotas par taille de concours et proposer un seuil au propriétaire.

**46. La vérification automatique du code (pnpm lint) est en échec** — effort S, confié à `testeur`

- Pourquoi : 3 erreurs no-require-imports dans apps/web/scripts/record-demo.cjs, plus 1 avertissement dans run.test.ts:17. La règle « les tests doivent passer après chaque lot » ne peut pas être tenue tant que ce n'est pas corrigé, et le bruit masquerait les vraies erreurs.
- Correction : Ignorer apps/web/scripts/*.cjs dans la configuration eslint (ou convertir le script en .mjs) et supprimer la variable inutilisée « stop ».

**47. Un test de sécurité échoue à tort après les tests de parcours (nombre de concours écrit en dur)** — effort S, confié à `testeur`

- Pourquoi : rls.sql:30 attend exactement 4 concours publiés. Or le parcours e2e de la phase 3 en publie un 5e. Pendant les lots de corrections, la boucle « le testeur vérifie » produirait de faux échecs.
- Correction : Comparer avec le nombre de concours non brouillons calculé avant le changement de rôle, et vérifier qu'aucun brouillon n'est visible.

**48. Les portes d'entrée sensibles du serveur (commandes, PIN, inscription, paiement) n'ont aucun test** — effort M, confié à `testeur`

- Pourquoi : execute.ts, staff.ts, register.ts et payments/webhook.ts sont les seuls points d'écriture, d'après les règles non négociables, et rien ne les teste. Une régression (publication sans paiement, table de marque ouverte) passerait inaperçue jusqu'en production.
- Correction : Écrire des tests Vitest avec un client admin simulé, sur le modèle de http.test.ts. staff.test.ts : cookie falsifié, expiré, émis pour un autre concours, PIN révoqué. webhook.test.ts : événement rejoué, « expired » après paiement, montant discordant, simulation refusée en production. execute.test.ts : conflit puis nouvelle tentative, doublon client_op_id, UNDO_CONFLICT.

**49. Les règles d'accès aux données personnelles (notifications, emails privés, scores des capitaines…) ne sont pas testées pour 10 tables** — effort S, confié à `testeur`

- Pourquoi : Les politiques existent bien, mais une future migration pourrait les casser sans qu'aucun test ne le voie (risque RGPD). Ces tests protégeront aussi la correction critique sur l'écriture directe.
- Correction : Ajouter dans rls.sql des blocs anon / joueur / autre joueur / club pour notifications, push_subscriptions, push_targets, profiles_private, score_submissions, follows, ai_usage, rate_limits, app_settings et platform_admins.

**50. Les tests de parcours effacent la base à chaque lancement, et aucune vérification automatique n'est faite avant d'envoyer du code** **[vous]** — effort M, confié à `testeur`

- Pourquoi : Pendant les corrections, plusieurs agents partagent la même base : on ne peut pas relancer toute la suite sans effacer leurs données. Et rien n'empêche de pousser du code qui échoue. Ajouter une intégration continue (GitHub Actions gratuit) est un nouvel outil, donc à valider par le propriétaire.
- Correction : Faire travailler les tests qui écrivent sur des concours créés pour l'occasion et nettoyés à la fin (afterAll). Avec l'accord du propriétaire, ajouter un workflow GitHub Actions gratuit (tests unitaires, typecheck, lint).

### Amélioration (13)

**51. Pages concours et table de marque envoyées sans compression (90 Ko au lieu de 9 Ko sur un gros concours)** — effort S, confié à `expert-performance`

- Pourquoi : Mesuré en local avec next start. Netlify compresse peut-être déjà les réponses des fonctions : il faut le vérifier avant de corriger. On reste sous la limite de 100 Ko jusqu'à environ 520 équipes.
- Correction : Vérifier sur un déploiement de test. Si les réponses ne sont pas compressées, compresser dans la route (node:zlib, en-tête Vary: Accept-Encoding).

**52. Ajout d'un PIN de bénévole : le code de génération est en double, et un PIN peut parfois être inutilisable ou attribué à la mauvaise personne** — effort S, confié à `relecteur-code`

- Pourquoi : staff/route.ts utilise un modulo biaisé, ne vérifie ni l'erreur de hash_pin ni l'unicité du PIN, alors que generatePins() existe déjà dans lib/payments/pins.ts.
- Correction : Réutiliser generatePins(1), refuser un PIN déjà présent dans le concours, et vérifier l'erreur de hash_pin (SAVE_FAILED).

**53. Les quotas de l'assistant IA peuvent être dépassés en envoyant plusieurs questions à la fois, et le « jour » change à 2 h du matin** — effort S, confié à `relecteur-code`

- Pourquoi : La vérification et le comptage sont séparés : le quota n'est compté qu'à la fin de la réponse. Le dépassement possible reste faible (modèle peu coûteux, budget mensuel plafonné).
- Correction : Réserver la question dès le début avec un incrément atomique (RPC), et calculer le jour en heure de Paris (parisDatePlus).

**54. Quelques textes écrits directement dans le code, et l'email de l'organisateur visible dans l'historique pour les bénévoles** — effort S, confié à `relecteur-code`

- Pourquoi : Des libellés comme « Capitaine », « Automatique » ou « Terrain » sont en dur, contre la règle i18n. Et staff.ts:74 utilise l'email quand le compte n'a pas de nom affiché.
- Correction : Déplacer ces libellés dans fr.ts, et remplacer l'email par le libellé « Organisateur ».

**55. Logo de club : le contenu du fichier n'est pas vérifié, et le format SVG est accepté** — effort S, confié à `expert-securite`

- Pourquoi : Le type de fichier vient du navigateur, alors que les affiches sont, elles, vérifiées par sniffType. Le risque reste faible, car le stockage est sur un domaine séparé du site.
- Correction : Appliquer sniffType (png, jpeg, webp) avant l'envoi, et retirer image/svg+xml du bucket par une migration.

**56. La recherche d'adresse peut être utilisée par n'importe qui sans limite** — effort S, confié à `expert-securite`

- Pourquoi : /api/geocode n'a pas de limite de débit : des appels de fonctions gratuits sont consommés, et l'IGN risque de bloquer l'adresse du serveur.
- Correction : Ajouter rateLimit(`geo:${ip}`, 60, 600) et répondre 429 au-delà.

**57. En-têtes de sécurité du navigateur incomplets** **[vous]** — effort S, confié à `expert-securite`

- Pourquoi : Pas de HSTS ni de object-src, base-uri ou form-action. L'échappement actuel est correct, il s'agit d'une seconde ligne de défense. Une politique script-src stricte rendrait les pages dynamiques sous Cache Components : c'est un choix d'architecture.
- Correction : Ajouter tout de suite object-src 'none', base-uri 'self', form-action 'self' et HSTS. Une politique script-src avec nonce n'est à envisager qu'avec l'accord du propriétaire.

**58. Guide de mise en ligne : rappeler de garder la confirmation d'email activée et d'exiger des mots de passe plus longs** — effort S, confié à `expert-securite`

- Pourquoi : Si la confirmation d'email était désactivée en production, quelqu'un pourrait prendre la place d'un co-organisateur en créant un compte avec son adresse.
- Correction : Dans DEPLOIEMENT.md, ajouter « Confirm email = ON », une longueur minimale de 10 caractères et « Secure password change ». Éventuellement, afficher un avertissement dans l'admin.

**59. La page détail d'un gros concours est lourde (735 Ko pour 512 équipes) et se rafraîchit toutes les 30 s même pendant le concours** — effort M, confié à `expert-performance`

- Pourquoi : Chaque équipe figure deux fois (HTML et données React), la liste n'est pas mise en cache, et chaque visiteur ouvre une connexion temps réel.
- Correction : Afficher les 50 premiers inscrits avec un lien « voir tout ». Ne plus suivre en direct pendant le concours (renvoyer vers /c/CODE).

**60. Chaque inscription en ligne vide le cache de tout le catalogue** — effort S, confié à `expert-performance`

- Pourquoi : revalidateTag("tournaments") invalide toutes les pages concours, et pas seulement celle qui a reçu l'inscription.
- Correction : N'invalider que tournament:${code}, et le catalogue au plus une fois par minute.

**61. Les vidéos de présentation (8 à 11 Mo) consomment la bande passante gratuite de l'hébergeur** **[vous]** — effort S, confié à `expert-performance`

- Pourquoi : Elles ne sont téléchargées qu'au clic, mais un pic de visites peut entamer les crédits mensuels de Netlify. Les héberger ailleurs est un choix du propriétaire.
- Correction : Les réencoder plus légères (CRF plus élevé, 720p pour la version 9:16), ou les héberger sur une plateforme vidéo gratuite si le propriétaire l'accepte.

**62. Les cas particuliers de l'inscription (complet, liste d'attente, inscriptions closes) ne sont pas testés de bout en bout** — effort M, confié à `testeur`

- Pourquoi : Seul le cas normal est couvert. Les règles pures sont testées, mais pas le parcours HTTP (409, email « liste d'attente », cookie d'équipe).
- Correction : Écrire des tests sans JS sur un petit concours créé pour l'occasion : remplissage jusqu'à complet, liste d'attente, concours sans liste d'attente, clôture dépassée.

**63. Les petits concours (0 à 7 équipes) fonctionnent, mais aucun test ne les fige** — effort S, confié à `testeur`

- Pourquoi : Les sondes de l'auditeur montrent que le moteur se comporte correctement, mais une régression sur 3 ou 5 équipes (cas fréquent en club) ne serait pas détectée.
- Correction : Ajouter un it.each (format × [0, 1, 2, 3, 5, 7] équipes), sans oublier le tête-à-tête et la triplette en poules.

<details><summary>Constats écartés par le chef</summary>

- Découper tabs.tsx (772 lignes) en un fichier par onglet — C'est une réorganisation sans gain pour les utilisateurs, et elle ajouterait un risque de conflit pendant les lots de corrections, qui touchent justement la table de marque. Elle va contre la consigne « ne pas tout réécrire ». L'avertissement eslint de run.test.ts est repris dans le point « pnpm lint en échec ».
- Au-delà de 1 000 lignes, matchs et joueurs tronqués (expert-performance) / Erreur 414 au-delà d'environ 216 équipes (relecteur-code) — Doublons : fusionnés dans le point critique « Grands concours : données perdues sans alerte ».
- Aucun test de montée en charge du moteur ni du chargement (expert-performance) — Doublon : ces tests (512 équipes, plus de 1 000 matchs) font partie de la correction du point critique « Grands concours ».
- Échec de register_team_private ignoré (testeur) — Doublon du constat du relecteur-code, fusionné.
- Limites anti-force brute non testées (testeur) — Doublon : les tests sont intégrés aux corrections du PIN et du code capitaine.
- Notifications : appels getUserById un par un (relecteur-code) — Doublon : fusionné dans le point de performance sur les notifications.
- File hors ligne de la table de marque sans test unitaire (testeur) — Fusionné avec la correction « score qui disparaît après une coupure réseau » : on y teste la même fonction.
- Cron /api/cron/tick non testé (testeur) / Filet de sécurité du tirage automatique lancé en parallèle (expert-performance) — Fusionnés dans le point « Tirage automatique », pour une correction unique de auto-draw.ts.
- Saisies simultanées : capitaines qui lisent « score invalide » (partie du constat expert-performance) — Doublon partiel : le message capitaine est traité dans le point « Saisie des scores par les capitaines ». La nouvelle tentative avec attente côté serveur reste un point à part.

</details>

## Pôle business

> Non, le pôle business n'est pas encore prêt à vendre. Le circuit de paiement est solide sur l'essentiel, mais quatre points bloquent : les pages légales sont vides, aucune acceptation des CGV n'est demandée avant de payer, un club peut être débité deux fois, et les joueurs ne reçoivent aucune information sur leurs données. Côté mise en ligne, presque tout reste à faire par le propriétaire : statut d'entreprise, domaine, comptes Netlify, Supabase, Stripe, Resend et Turnstile, tâches automatiques, puis un vrai paiement test avant de passer Stripe en réel.

### Critique (12)

**64. Les pages légales sont vides : mentions légales, CGV, confidentialité, cookies** **[vous]** — effort M, confié à `juriste-rgpd`

- Pourquoi : Vérifié : la page affiche seulement « Cette page sera rédigée avant le lancement ». Les mentions légales sont obligatoires (sanction pénale). Sans CGV, rien n'est opposable à un club. Sans politique de confidentialité, l'obligation d'informer n'est pas remplie. Un club sérieux n'achètera pas.
- Correction : Le juriste rédige 4 brouillons marqués « à faire valider par un professionnel ». Ils reprennent l'inventaire réel des cookies et du stockage local (fonctionnels, donc pas de bandeau ; Turnstile cité), les sous-traitants et l'OSM. Le propriétaire fournit son identité légale (nom ou raison sociale, SIREN, adresse, email, directeur de publication) et fait relire les textes.

**65. On paie sans accepter les CGV, sans renoncer au délai de rétractation et sans savoir si le prix est TTC** **[vous]** — effort S, confié à `expert-paiement`

- Pourquoi : Doublon entre deux auditeurs, vérifié dans checkout.ts : la session Stripe est créée sans consentement ni texte. Un club de type association peut réclamer un remboursement sous 14 jours, même après son concours. Le prix ne précise pas TTC ou « TVA non applicable ».
- Correction : Ajouter une case obligatoire avant « Payer » : acceptation des CGV avec lien, demande d'activation immédiate et perte du droit de rétractation. Enregistrer la date et la version des CGV dans form_snapshot, sans nouvelle colonne. Afficher la mention TTC ou TVA choisie par le propriétaire. En option, activer consent_collection côté Stripe.

**66. Un club peut être débité deux fois pour le même concours** — effort S, confié à `expert-paiement`

- Pourquoi : Vérifié dans checkout.ts. Si Stripe refuse d'annuler une session déjà payée, l'erreur est seulement notée. Le paiement est quand même marqué « expiré » et un nouveau paiement est proposé. Au second paiement, publish.ts écrit seulement « refund needed » dans les journaux, sans prévenir personne.
- Correction : Avant de relancer un paiement, relire la session Stripe. Si elle est payée ou terminée, refuser le nouveau paiement et afficher « paiement en cours de confirmation ». Ne jamais marquer « expiré » une session dont l'expiration n'a pas été confirmée. Le testeur ajoute un test.

**67. L'inscription en ligne collecte les données des joueurs sans les informer, et les pages /c/ n'ont aucun lien légal** — effort S, confié à `juriste-rgpd`

- Pourquoi : Le capitaine saisit les noms et licences de ses coéquipiers, son téléphone et son email. On ne leur dit ni qui est responsable, ni combien de temps les données sont gardées, ni si les noms seront affichés en entier. Une plainte CNIL viserait d'abord la plateforme.
- Correction : Ajouter une mention courte au-dessus du bouton (texte dans i18n) : le club, OrgaSport comme prestataire, l'affichage des noms, la durée de conservation, un lien vers la confidentialité. Ajouter une case « J'ai informé mes coéquipiers ». Ajouter un pied de page HTML léger (Mentions légales · Confidentialité) sur toutes les pages /c/.

**68. Au moment de payer, le club lit une note interne : « Prix de départ, à fixer dans l'administration »** — effort S, confié à `marketing`

- Pourquoi : Vérifié dans reference-data.ts et reference.sql : cette description de formule s'affiche juste au-dessus du bouton « Payer ». Le prix paraît provisoire au moment décisif de l'achat.
- Correction : Remplacer les descriptions dans reference-data.ts par un texte pour le client (« Paiement unique pour un concours : inscriptions, tirage, table de marque, affiche, résultats en direct »), puis lancer reference:gen.

**69. À FAIRE PAR LE PROPRIÉTAIRE : choisir le statut d'entreprise et la TVA** **[vous]** — effort M, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Tout le reste en dépend : les mentions légales, les CGV, la mention TTC ou TVA, les factures Stripe et le passage de Stripe en réel. On ne peut pas vendre légalement sans structure (micro-entreprise ou société) ni SIREN.
- Correction : Le propriétaire crée ou choisit sa structure (micro-entreprise en franchise de TVA, art. 293 B, ou entreprise assujettie). Il communique ensuite SIREN, adresse et régime de TVA au Directeur. Conseil d'un comptable recommandé, notamment sur la facturation électronique.

**70. À FAIRE PAR LE PROPRIÉTAIRE : acheter un nom de domaine** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Sans domaine à soi, les emails (connexion, rappels, factures) ne peuvent pas partir. Le domaine sert aussi à Turnstile et au webhook Stripe. C'est le seul coût d'hébergement inévitable : environ 10 € par an, en dehors de « gratuit uniquement ».
- Correction : Le propriétaire achète par exemple orgasport.fr chez OVH ou Gandi et valide ce petit coût. Il ajoute ensuite les enregistrements DNS demandés par Netlify et Resend (DEPLOIEMENT.md, étapes 2 et 3).

**71. À FAIRE PAR LE PROPRIÉTAIRE : créer la base de données en ligne (Supabase gratuit, région Paris)** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Le site n'existe aujourd'hui qu'en local. Sans base en ligne, rien ne fonctionne.
- Correction : Suivre l'étape 1 de DEPLOIEMENT.md : créer le projet, puis lancer db push et reference.sql (jamais seed.sql). Régler l'adresse du site et les redirections dans Authentication, et noter les clés. Le Directeur peut guider pas à pas.

**72. À FAIRE PAR LE PROPRIÉTAIRE : mettre le site en ligne sur Netlify (offre gratuite) avec toutes les clés** **[vous]** — effort M, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Le site doit être hébergé, relié au domaine et configuré avec les variables d'environnement (Supabase, secrets de session et de cron, Stripe, Resend, VAPID, Turnstile, Anthropic, URL du site).
- Correction : Suivre l'étape 3 de DEPLOIEMENT.md. Générer STAFF_SESSION_SECRET et CRON_SECRET (openssl rand -hex 32), brancher le domaine, redéployer. Revérifier que l'offre gratuite Netlify autorise l'usage commercial et surveiller les crédits mensuels, car le site est mis en pause s'ils sont épuisés.

**73. À FAIRE PAR LE PROPRIÉTAIRE : clés anti-robots Turnstile (sinon personne ne peut s'inscrire en ligne)** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Vérifié : en production, l'inscription en ligne aux concours est refusée tant que les clés Turnstile manquent. La création de comptes doit aussi être protégée.
- Correction : Créer un compte Cloudflare puis un widget Turnstile pour le domaine, et coller les clés dans Netlify et dans Supabase (CAPTCHA). Voir DEPLOIEMENT.md, étape 6.

**74. À FAIRE PAR LE PROPRIÉTAIRE : brancher les tâches automatiques (tirages à l'heure, rappels, envoi des notifications)** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Sans l'appel de /api/cron/tick chaque minute, les tirages programmés, les rappels et les notifications ne partent pas, ou seulement quand quelqu'un affiche la page.
- Correction : Dans Supabase, activer pg_cron et pg_net, coller le script de l'étape 8 de DEPLOIEMENT.md, puis vérifier les réponses 200.

**75. À FAIRE PAR LE PROPRIÉTAIRE : paiement Stripe en mode test de bout en bout, puis passage en réel avec un vrai achat remboursé** **[vous]** — effort M, confié à `propriétaire (avec le Directeur et expert-paiement)`

- Pourquoi : Le paiement n'a été essayé qu'en simulation locale. Il faut prouver que Stripe, le webhook, la publication, l'email et la facture fonctionnent en ligne avant d'encaisser un club.
- Correction : Mode test : compte Stripe, clé sk_test, webhook avec les 4 événements (plus remboursement et litige une fois gérés), carte 4242, concours publié en quelques secondes. Ensuite, et seulement après les CGV et le statut d'entreprise : profil d'entreprise complet, factures et reçus par email activés, URL des CGV dans Stripe, clés live et nouveau whsec, vrai achat de 1 € puis remboursement.

### Important (23)

**76. À FAIRE PAR LE PROPRIÉTAIRE : emails (Resend) avec domaine vérifié et modèles en français** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Les liens de connexion, les rappels et les emails de secours partent par Resend. Sans domaine vérifié (SPF, DKIM), ils n'arrivent pas ou finissent en indésirables. Limites de l'offre gratuite à vérifier (environ 100 emails par jour, 3 000 par mois) : un gros concours avec des rappels aux capitaines peut les atteindre.
- Correction : Suivre l'étape 2 de DEPLOIEMENT.md : domaine, clé, SMTP Supabase, copie des 4 modèles. Vérifier les quotas du jour et décider s'il faut limiter les rappels par email.

**77. À FAIRE PAR LE PROPRIÉTAIRE : notifications sur téléphone (clés VAPID) et vraie réception testée sur Android et iPhone** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Les notifications « Votre match commence » sont un argument de vente fort, mais elles n'ont jamais été reçues sur un vrai téléphone en ligne. Sur iPhone, il faut que la page soit ajoutée à l'écran d'accueil.
- Correction : Générer la paire VAPID une seule fois (étape 5) et la coller dans Netlify. Puis tester sur un Android et sur un iPhone (page ajoutée à l'écran d'accueil) avec un concours de test joué depuis la table de marque.

**78. À FAIRE PAR LE PROPRIÉTAIRE : créer son compte administrateur et organiser des sauvegardes hebdomadaires** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Sans compte admin, impossible de régler les prix, les codes promo et les pages légales. L'offre gratuite Supabase ne propose pas de sauvegarde téléchargeable : en cas d'erreur, les concours et les paiements seraient perdus.
- Correction : Étape 9 de DEPLOIEMENT.md (insertion dans platform_admins). Faire chaque semaine un export avec supabase db dump, gardé hors du dépôt. Surveiller aussi les limites de l'offre gratuite (taille de la base, connexions en direct simultanées un jour de gros concours, mise en pause d'un projet inactif).

**79. Le prix n'est visible nulle part avant la dernière étape : il manque une page Tarifs** — effort M, confié à `marketing`

- Pourquoi : Vérifié : /tarifs n'existe pas et l'accueil ne mentionne aucun prix. Un président de club veut connaître le coût avant de créer un compte, sinon il soupçonne un abonnement caché. L'argument « paiement unique, sans abonnement » n'est que dans la vidéo.
- Correction : Ajouter une section Tarifs sur l'accueil et une page /tarifs qui lit les formules actives en base : paiement unique, ce qui est inclus, « vous payez seulement en publiant », bouton « Créer mon concours ». Ajouter le lien dans le pied de page.

**80. Impossible d'essayer l'outil en ligne avant de payer** **[vous]** — effort M, confié à `marketing`

- Pourquoi : Les concours de démo et le code BIENVENUE n'existent qu'en local. Un club ne voit une vraie page en direct, une affiche ou la table de marque qu'après avoir payé. C'est le principal frein à la première vente.
- Correction : Le propriétaire choisit : (a) un concours de démonstration public en production avec un lien « Voir un concours en direct », sans changer l'architecture ; (b) un premier concours offert via un code promo créé dans /admin ; (c) les deux.

**81. Aucune alerte quand un paiement tourne mal (payé mais non publié, payé deux fois, montant différent)** **[vous]** — effort M, confié à `expert-paiement`

- Pourquoi : Ces cas ne laissent qu'une trace dans des journaux Netlify courts et rarement lus. Un club qui a payé peut rester sans concours sans que le propriétaire le sache.
- Correction : Dans /admin/paiements, ajouter un état « à traiter » pour ces cas et envoyer un email à l'admin via Resend. Le rattrapage automatique dans le cron serait une 2e porte de publication à côté du webhook : décision du propriétaire.

**82. Les remboursements et les litiges Stripe ne sont pas pris en compte** **[vous]** — effort M, confié à `expert-paiement`

- Pourquoi : Un remboursement fait dans Stripe laisse le paiement « Payé » dans les factures du club et dans les statistiques, et le concours reste en ligne. La comptabilité affichée devient fausse.
- Correction : Traiter les événements de remboursement (statut refunded) et de litige (marquage et alerte admin), et les ajouter au guide. Le propriétaire décide si un concours remboursé est dépublié.

**83. Un code promo peut servir plus que prévu, et un club peut réutiliser à l'infini un code « premier concours offert »** **[vous]** — effort M, confié à `expert-paiement`

- Pourquoi : Vérifié : le plafond est contrôlé seulement au devis. La publication incrémente le compteur sans revérifier, et aucune limite par club n'existe. C'est un manque à gagner direct si un code circule.
- Correction : Incrémenter le compteur sous condition (refus si le plafond est atteint, sauf pour un paiement déjà encaissé, qui est alors signalé). Ajouter une option « une fois par club ».

**84. Factures incomplètes : TVA, nom et adresse du club, mentions du vendeur** **[vous]** — effort S, confié à `expert-paiement`

- Pourquoi : Doublon entre deux auditeurs. Seul l'email du club est transmis à Stripe, sans pied de facture ni mention TVA. Une mairie, un comité ou le trésorier d'une association refusera une facture non conforme.
- Correction : Une fois le statut TVA choisi : billing_address_collection obligatoire, collecte facultative du numéro de TVA, nom du club en champ personnalisé, pied de facture avec la mention TVA (texte i18n). Le propriétaire complète le profil de facturation dans Stripe.

**85. Les garanties du paiement ne sont pas protégées par des tests automatiques** — effort M, confié à `testeur`

- Pourquoi : Les 37 tests unitaires passent, mais rien ne vérifie le webhook de bout en bout : événement reçu deux fois, expiration tardive, montant différent, double paiement. Une régression pourrait passer inaperçue.
- Correction : Ajouter des tests e2e qui envoient des événements signés, et un test SQL qui appelle publish_tournament deux fois.

**86. Un utilisateur ne peut ni supprimer son compte ni récupérer ses données** — effort M, confié à `juriste-rgpd`

- Pourquoi : Les droits d'effacement, d'accès et de portabilité doivent être honorés sous un mois. Aujourd'hui, seule une intervention manuelle en SQL le permet.
- Correction : Ajouter « Supprimer mon compte » dans le profil (refusé si la personne est seule propriétaire d'un club avec un concours en cours) et « Télécharger mes données » (JSON). Documenter la procédure pour les joueurs sans compte.

**87. Téléphones, emails, licences et adresses IP sont gardés pour toujours** **[vous]** — effort M, confié à `juriste-rgpd`

- Pourquoi : Aucune purge n'existe. Les coordonnées des capitaines restent en base des années après le concours, ce qui maximise le préjudice en cas de fuite.
- Correction : Ajouter une purge dans le cron existant : limites anti-abus expirées, emails des notifications après 30 jours, contacts et licences 6 mois après la fin du concours, paiements gardés 10 ans. Durées à valider par le propriétaire.

**88. Activer les notifications sur téléphone réactive en silence les emails que l'utilisateur avait refusés** — effort S, confié à `expert-securite`

- Pourquoi : Vérifié dans route.ts:73. L'impact immédiat est limité, puisque l'email ne part que si aucun téléphone n'est abonné. Mais si l'abonnement expire, la personne reçoit des emails qu'elle avait refusés : son consentement a été écrasé.
- Correction : Supprimer cette mise à jour : notifications et emails restent deux réglages séparés. Le testeur ajoute un test.

**89. Les emails envoyés aux capitaines sans compte ont un texte faux et aucun moyen de se désabonner** — effort S, confié à `juriste-rgpd`

- Pourquoi : Le pied de page parle d'un profil que ces capitaines n'ont pas, et ne propose aucun lien de désabonnement. Le message est trompeur et les emails risquent de finir en indésirables, y compris les rappels du jour J.
- Correction : Écrire un pied de page propre aux capitaines, ajouter un lien de désabonnement signé et l'en-tête List-Unsubscribe.

**90. La création de compte ne renvoie ni aux conditions d'utilisation ni à la confidentialité** — effort S, confié à `juriste-rgpd`

- Pourquoi : Il n'y a aucune preuve que le club a accepté les conditions de la plateforme, alors qu'OrgaSport traite pour lui les données de ses joueurs.
- Correction : Ajouter sous le bouton une phrase avec les liens légaux, et enregistrer la date d'acceptation pour un compte club, sans changer l'architecture.

**91. Sous-traitants et transferts hors Europe non documentés (registre RGPD absent)** **[vous]** — effort S, confié à `juriste-rgpd`

- Pourquoi : Netlify, Resend, Anthropic, Cloudflare et Stripe sont américains. Un club attentif ou une collectivité demandera le registre et les garanties avant d'acheter.
- Correction : Créer docs/RGPD.md : registre des traitements, sous-traitants avec pays et garanties, accords de sous-traitance à accepter. Le propriétaire accepte ces accords dans chaque tableau de bord.

**92. Concours « Jeunes » : les noms complets de mineurs peuvent être publiés** — effort S, confié à `juriste-rgpd`

- Pourquoi : Rien n'empêche l'affichage des noms complets en catégorie jeunes, et aucune autorisation parentale n'est demandée. C'est un risque d'image fort pour un club.
- Correction : Imposer les initiales en catégorie jeunes, par la configuration et non par un « if » sur le sport. Ajouter une case « accord des représentants légaux » et indiquer « compte réservé aux 15 ans et plus » dans les conditions.

**93. L'accueil parle aux joueurs, pas au club qui achète** — effort S, confié à `marketing`

- Pourquoi : Le titre et le bouton principal visent le joueur. Sur téléphone, l'offre club se retrouve sous la ligne de flottaison. Un président de club ne comprend pas en 5 secondes ce qu'il peut faire ni combien ça coûte.
- Correction : Garder la scène 3D et « Retrouver mon tirage », et ajouter juste dessous une bande « Pour les organisateurs » : une promesse, « à partir de 19 € » et un bouton. Textes dans fr.ts.

**94. Aucun argumentaire ni FAQ pour les clubs** — effort M, confié à `marketing`

- Pourquoi : Les vrais atouts (hors connexion, annulation de toute action, scores saisis par les capitaines, affiche et QR, formats, paiement unique) ne sont pas mis en avant. Les objections classiques restent sans réponse.
- Correction : Ajouter une section « Pour les clubs » (6 atouts) et une FAQ de 6 à 8 questions dans fr.ts, avec un emplacement prévu pour des témoignages.

**95. Aucune adresse de contact, alors que des messages disent « Contactez-nous »** **[vous]** — effort S, confié à `marketing`

- Pourquoi : Un club bloqué au paiement ou qui a une question avant d'acheter n'a personne à joindre : la vente est perdue et le service paraît peu sérieux.
- Correction : Le propriétaire choisit une adresse. Ajouter une variable NEXT_PUBLIC_CONTACT_EMAIL, un lien Contact dans le pied de page et des liens mailto dans les messages d'erreur.

**96. Les liens partagés (accueil et /c/CODE) s'affichent sans image ni résumé, et Google ne trouve pas les pages** — effort S, confié à `marketing`

- Pourquoi : Vérifié : pas de robots ni de sitemap, et pas d'aperçu Open Graph sur l'accueil ni sur /c/CODE, le lien que les clubs publient sur Facebook et WhatsApp. C'est la meilleure vitrine gratuite qui est perdue.
- Correction : Ajouter robots.ts, sitemap.ts, l'aperçu Open Graph et une image 1200×630 sur l'accueil, et un titre qui contient « pétanque ». Dans le gabarit terrain, quelques balises og (titre, sport · date · lieu, image) : quelques centaines d'octets, sans JS, noindex conservé.

**97. Au lancement, l'accueil affichera « 0 concours en direct · 0 joueur inscrit »** — effort S, confié à `marketing`

- Pourquoi : Les chiffres viennent aujourd'hui de la démo. En production, le site paraîtra désert et aucun club ne veut être le premier.
- Correction : N'afficher ces chiffres qu'au-delà d'un seuil, et sinon montrer des arguments fixes.

**98. La vidéo tutoriel et le champ code promo citent BIENVENUE, un code qui n'existe pas en production** **[vous]** — effort S, confié à `marketing`

- Pourquoi : Vérifié : la vidéo montre « 29 € » et « Code BIENVENUE · −20 % », et le champ suggère « ex. BIENVENUE ». En production, ce code est refusé (et vaut 100 % dans la démo). Le club perd confiance et gaspille ses essais.
- Correction : Le propriétaire choisit : créer BIENVENUE −20 % en production et figer le prix à 29 €, ou faire re-rendre la vidéo sans montant ni code. Dans tous les cas, mettre un exemple neutre dans le champ.

### Amélioration (10)

**99. À FAIRE PAR LE PROPRIÉTAIRE (facultatif) : clé de l'assistant IA avec plafond de dépense** **[vous]** — effort S, confié à `propriétaire (avec le Directeur)`

- Pourquoi : Sans clé, l'assistant répond quand même avec la base de connaissances. La clé apporte de vraies réponses, pour quelques centimes par jour.
- Correction : Étape 7 de DEPLOIEMENT.md : créer la clé, fixer une limite mensuelle chez Anthropic et garder le plafond de /admin/assistant.

**100. Fonds de carte : OpenStreetMap par défaut, non prévu pour un usage commercial** **[vous]** — effort S, confié à `juriste-rgpd`

- Pourquoi : L'adresse IP des visiteurs part vers OSM, ce qui doit figurer dans la politique de confidentialité, et un blocage est possible lors d'un gros concours.
- Correction : En production, renseigner NEXT_PUBLIC_MAP_TILES_URL avec les tuiles Plan IGN (simple variable d'environnement) et citer le fournisseur dans la politique de confidentialité.

**101. Compléter le guide de mise en ligne : liste de contrôle « Stripe en réel »** — effort S, confié à `expert-paiement`

- Pourquoi : La version d'API du webhook, les événements de remboursement et de litige, l'URL des CGV, l'envoi des factures et l'achat test remboursé ne sont pas mentionnés.
- Correction : Ajouter cette liste de contrôle à l'étape 4 de DEPLOIEMENT.md.

**102. Avec le prélèvement SEPA, un concours pourrait être publié après sa date** — effort S, confié à `expert-paiement`

- Pourquoi : Ce mode de paiement est confirmé en 3 à 14 jours, et la publication différée ne revérifie pas les dates.
- Correction : Limiter les moyens de paiement (carte, PayPal) ou refuser et alerter si la date du concours est passée. L'indiquer aussi dans le guide.

**103. Les factures Stripe ont un coût caché, et leur lien peut manquer pour toujours** **[vous]** — effort S, confié à `expert-paiement`

- Pourquoi : Le service de facturation Stripe est payant en plus de la commission. Les liens vers les factures ne sont récupérés qu'une fois.
- Correction : Le propriétaire choisit : facture Stripe ou reçu Stripe plus facture maison. Si on garde Stripe, récupérer le lien à la demande dans /club/factures et documenter le coût.

**104. Choix de la formule : une formule propre à un sport peut coûter plus cher qu'une formule générale** **[vous]** — effort S, confié à `expert-paiement`

- Pourquoi : Le problème ne se produit pas avec les 2 formules actuelles. Il apparaîtra si l'admin crée des formules par sport.
- Correction : Trier d'abord par nombre d'équipes, ou documenter dans /admin/tarifs que la formule du sport prime (décision du propriétaire).

**105. Les pages légales ne sont pas modifiables depuis l'administration** — effort M, confié à `juriste-rgpd`

- Pourquoi : Chaque correction après relecture d'un avocat demande un déploiement, et la date de mise à jour n'est pas affichée. La table legal_pages existe mais n'est pas utilisée.
- Correction : Faire lire legal_pages à la page (mise en cache, texte i18n en secours), afficher « Mise à jour le … » et ajouter un éditeur simple /admin/legal.

**106. Le bouton « Sans compte · Voir les concours » ouvre un questionnaire au lieu des concours** — effort S, confié à `designer-ux`

- Pourquoi : Le libellé promet une liste, et le visiteur curieux tombe sur des questions.
- Correction : Faire pointer le bouton vers /concours, ou changer le libellé.

**107. « Propulsé par OrgaSport » sur les pages concours n'invite pas les organisateurs** — effort S, confié à `marketing`

- Pourquoi : Des centaines de joueurs et de dirigeants voient ces pages à chaque concours : c'est un canal d'acquisition gratuit.
- Correction : Remplacer par « Organisez votre concours avec OrgaSport → » vers /tarifs, et ajouter une mention sur l'affiche.

**108. La promesse « moins de 3 minutes » n'est pas crédible : 9 écrans avant de créer le concours** — effort M, confié à `designer-ux`

- Pourquoi : La fédération, l'affiliation et le logo sont demandés avant que le club ait vu quoi que ce soit d'utile.
- Correction : Rendre ces écrans facultatifs (« Plus tard ») et reformuler la promesse.

<details><summary>Constats écartés par le chef</summary>

- Aucune acceptation des CGV avant de payer (expert-paiement) — Doublon du constat du juriste « Achat sans acceptation des CGV, rétractation, TTC » : fusionné dans un seul point critique.
- TVA, prix HT/TTC et mentions de facture (expert-paiement) — Fusionné avec « Factures Stripe probablement incomplètes » (juriste) pour les factures, et avec le point critique d'acceptation des CGV pour l'affichage TTC.
- Le champ code promo suggère « ex. BIENVENUE » (expert-paiement) — Fusionné avec le constat marketing sur la vidéo et le code BIENVENUE (même cause, même décision).
- Page cookies à rédiger avec l'inventaire réel (juriste-rgpd) — Fusionné dans le point critique « Pages légales vides » : l'inventaire sert de contenu à la page cookies.
- Le lien /c/CODE n'a aucune prévisualisation (marketing) — Fusionné avec « Pas de robots.txt, sitemap ni Open Graph » : même correction (aperçus de partage et référencement).

</details>

## Rapports bruts des auditeurs

Disponibles dans le journal de l'audit ; synthèses :

- **expert-regles-concours** : Le moteur est solide sur ses bases : 80 tests au vert, tirages reproductibles, jamais deux équipes d'une même poule au 1er tour du tableau final (0 sur 132 tirages simulés), même club évité, exempts tournants, et il tient la charge (256 équipes en poules jouées entièrement en 6,6 s, soit environ 11 ms par commande). En revanche, mes simulations (scripts dans /tmp/claude-0/-home-user-Misticone/d8809bca-f8e5-5d93-be23-d1b2191431c9/scratchpad/audit) montrent 3 défauts graves. Les formats « mêlée » combinés à un autre format de concours font jouer les gens en tête-à-tête ou à 4 contre 4. Corriger un « double forfait » après coup élimine en silence un vainqueur ou qualifie un perdant. Une poule unique avec 1 qualifié bloque la saisie du dernier score. S'y ajoutent des écarts d'équité par rapport aux usages de la pétanque : complémentaire presque vide en tableau fixe, exempt à chaque tour qui envoie directement en finale, exempt payé 13-0, poules de 2, critères de départage. (12 constats)
- **designer-ux** : J'ai parcouru le site à 360 px (clair et sombre) avec Playwright et relu le code des écrans concernés. Le pire est sur la table de marque mobile : au pointage, les noms d'équipes sont réduits à une seule lettre, la page PIN déborde sur le côté, l'en-tête prend plus d'un quart de l'écran, et « Forfait » ou « Clore le concours » partent en un seul toucher, sans confirmation. Le reste concerne la cohérence et le confort : statut « Inscriptions ouvertes » affiché pour un concours complet, heures coupées en fin de ligne, page « code inconnu » sans champ de saisie, historique vide sur le concours de démo. Le formulaire d'inscription en ligne et la connexion sont solides (erreurs par champ, aria-invalid, role=alert). (13 constats)
- **relecteur-code** : Le code est globalement propre et bien pensé : tsc et eslint passent (1 seul avertissement), les 268 tests unitaires web passent, le paiement et l'exécution des commandes de la table de marque sont atomiques et idempotents. Le défaut le plus grave est un problème de passage à l'échelle qui ne produit aucune erreur visible : dès environ 216 équipes, les requêtes `.in(...)` de Supabase reçoivent une erreur 414 que le code ignore. Les noms des joueurs disparaissent alors de l'état du concours et aucune notification « À vous de jouer » n'est envoyée ; s'y ajoute la limite de 1000 lignes par requête. Viennent ensuite plusieurs conditions de course et états faux sur les chemins critiques : notifications envoyées deux fois, tirage automatique bloqué par des concours abandonnés, retour en arrière visible sur la table de marque, contacts d'inscription perdus sans alerte, saisie des scores par les capitaines, PIN contournable par requêtes parallèles. (12 constats)
- **expert-securite** : L'audit sécurité est globalement rassurant. Les RLS sont activées sur les 35 tables. Les fonctions sensibles (publish_tournament, verify_staff_pin, register_team_private, hit_rate_limit) ne sont pas appelables par anon ni par authenticated. Le webhook Stripe est signé, le paiement simulé est refusé en production, les pages terrain échappent tout le HTML et aucun secret n'est versionné.
En revanche, deux problèmes critiques ont été démontrés. D'abord, n'importe qui peut envoyer de faux messages « mise à jour » sur le canal temps réel public d'un concours, ce qui fait recharger en boucle tous les téléphones des spectateurs et peut épuiser le quota de l'hébergement gratuit. Ensuite, les politiques RLS « ALL » donnent à tout compte d'équipe (même un simple arbitre) un accès direct en écriture aux matchs, équipes et accès staff, sans passer par le moteur. Il peut ainsi réactiver un PIN révoqué, se promouvoir organisateur ou supprimer l'organisateur.
Viennent ensuite des points importants : une redirection ouverte après connexion, plusieurs limites d'essais qui permettent de bloquer un concours (PIN, inscriptions, notifications) ou de forcer le code capitaine à 4 chiffres en changeant d'adresse IPv6, et des abonnements push vers n'importe quelle URL. (11 constats)
- **testeur** : Toutes les suites existantes sont vertes : `pnpm -r test` donne 357 tests en 25 s (moteur 80, web 268, sports 7, db 2), `pnpm test:db` affiche « RLS checks passed », `tsc` ne signale rien et les specs Playwright sans écriture (perf, a11y) passent 21/21. Le moteur résiste bien aux cas limites que j'ai sondés (0 à 7 équipes dans chaque format, et jusqu'à 512 équipes en élimination ou 256 en poules ou suisse), mais `pnpm lint` est rouge. Les vrais trous se trouvent autour du moteur : inscription en double, liste d'attente contournée après un désistement, contacts perdus en silence, et aucun test unitaire ni d'intégration pour le serveur sensible (commandes, PIN, webhook de paiement, inscription), ni de règles d'accès (RLS) pour 10 tables de données personnelles ou réservées. (13 constats)
- **expert-performance** : J'ai créé dans la base locale un concours de test « AUDIT » de 512 triplettes (1 536 joueurs, 120 terrains), je l'ai mesuré sur une version de production lancée sur le port 3100, puis j'ai tout supprimé et arrêté ce serveur. Le site de démo sur le port 3000 n'a pas été touché. Les pages terrain restent légères : 9 Ko compressés, 60 ms. En revanche, la lecture de l'état d'un concours casse sans aucun message dès environ 210 équipes, ou au-delà de 1 000 lignes (joueurs ou matchs) : noms de joueurs absents, matchs manquants, notifications perdues. Rien n'est mis en cache par version de concours ni étalé dans le temps : 2 000 joueurs qui rafraîchissent saturent le serveur (p50 5 s), et les limites des offres gratuites (Realtime, crédits Netlify, Resend) sont dépassées sur un gros concours. (13 constats)
- **expert-paiement** : Le circuit d'achat du lien concours est solide sur l'essentiel : webhook signé et seule porte de publication, contrôle session/montant/devise, publication atomique et idempotente (publish_tournament avec verrous), simulation refusée en production (provider.ts, page et webhook), et les 37 tests unitaires paiement passent. Le principal risque est le double encaissement : un club peut relancer un paiement alors que le premier, déjà payé, attend son webhook, et ce cas ne fait qu'écrire « refund needed » dans les logs. Rien n'est prévu pour les remboursements et les litiges. Les codes promo n'ont ni plafond atomique ni limite par club. Avant de passer Stripe en réel, il reste à trancher la TVA et les mentions de facture, ainsi que l'acceptation des CGV au paiement (décisions du propriétaire). (12 constats)
- **juriste-rgpd** : Sur le plan juridique, le site n'est pas vendable en l'état : les 4 pages légales (mentions légales, CGV, confidentialité, cookies) sont vides, l'achat du lien ne recueille ni l'acceptation des CGV ni la renonciation au droit de rétractation, et le formulaire d'inscription collecte des données de joueurs (dont des tiers et des mineurs possibles) sans aucune information RGPD. La technique respecte déjà de bonnes bases : initiales par défaut, licences et contacts privés, permission de notification demandée au clic, cookies purement fonctionnels, aucun traceur publicitaire, IA côté serveur sans stockage des messages. En revanche, il manque les droits des personnes (suppression, export), toute durée de conservation, la documentation des sous-traitants et des transferts hors UE, et deux défauts de consentement aux emails sont à corriger. Tous les textes proposés sont des brouillons à faire valider par un professionnel. (14 constats)
- **marketing** : Le produit est solide et la page Découvrir (vidéos sous-titrées, chapitres) est convaincante, mais l'accueil s'adresse aux joueurs (« Votre match en 10 secondes ») alors que l'acheteur est le club. Aucun prix n'est visible avant l'étape 8 du formulaire, il n'existe aucun moyen d'essayer l'outil en production, aucun contact et aucune FAQ. En plus, le texte interne « Prix de départ, à fixer dans l'administration » s'affiche au client au moment de payer. Côté référencement et partage, les bases manquent : pas de robots.txt, pas de sitemap, pas d'Open Graph sur l'accueil ni sur les liens /c/CODE que les clubs partagent sur Facebook et WhatsApp. (13 constats)
