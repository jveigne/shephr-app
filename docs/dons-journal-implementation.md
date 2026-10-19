# Journal d'implémentation — chantier Dons, Goals et Notifications

**Date** : 14/09/2026 · **Auteur** : chantier en lots parallèles (T1→T12, G1→G3, N4a→N4c)
**Dépôts touchés** : `cmfipraise-backend`, `shephr-app/mobile`, `shephr-webapp`
**Hors périmètre, non touché** : `shephr-app/web` (Espace ministère)

> À quoi sert ce document : savoir **où on en est réellement**. Il dit ce qui a été écrit, ce qui a
> été vérifié **mécaniquement** (compilation, tests, typecheck, lint) et — surtout — **ce qui reste
> incertain ou ouvert**. Rien n'a été **éprouvé à la main** : c'est l'objet de
> `docs/donations-recette.md`.
>
> **Rien n'a été committé.** Tout est dans le working tree des trois dépôts.

---

## 0. État mécanique à la clôture du chantier

Commandes lancées à la consolidation, sorties réelles :

| Vérification | Commande | Résultat |
|---|---|---|
| Mobile — types | `cd shephr-app/mobile && npx tsc --noEmit` | **exit 0**, aucune sortie |
| Mobile — lint | `npm run lint` | **`✖ 7 problems (0 errors, 7 warnings)`** — détail ci-dessous |
| Back-office — types | `cd shephr-webapp && npx tsc --noEmit` | **exit 0**, aucune sortie |
| Backend — compilation | `cd cmfipraise-backend && JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn -q -DskipTests compile` | **exit 0**, journal vide |
| Backend — suite complète | `JAVA_HOME=… YOUTUBE_API_KEY=dummy mvn test` | **`Tests run: 1374, Failures: 0, Errors: 0, Skipped: 0` · BUILD SUCCESS** (2 min 18) |

**Les 7 avertissements de lint sont tous préexistants** et hors des fichiers du chantier :

```
app/(tabs)/care/record/[id].tsx     11:8   'HandDivider' is defined but never used
app/(tabs)/goals/remind.tsx         66:6   useEffect missing dependency: 'load'
app/(tabs)/profile.tsx              12:10  'canManageStructure' is defined but never used
components/GoalAggregates.tsx      158:…   4 × react-hooks/exhaustive-deps
```

Le seul qui provienne du chantier est celui de `goals/remind.tsx` (lot G3) : c'est la même forme que
le `useEffect` de `goals/units.tsx` déjà en place, il a été laissé tel quel par cohérence.

**À noter** : `PushManuelServiceImplTest.envoyer_notificationExpiree_estRefusee`, que **six lots ont
signalé comme rouge**, **passe désormais**. Il échouait depuis le 04/09 pour une cause étrangère au
chantier : le test fige l'horloge au 03/09/2026 mais datait sa fin de période avec `Instant.now()`
réel. Le lot N4a l'a corrigé d'une ligne. Vérifié isolément : `Tests run: 16, Failures: 0`.

**Deux pièges d'environnement rencontrés** (pas des défauts de code) :

- plusieurs builds Maven **concurrents** sur le même dépôt corrompent `target/generated-sources`
  (sources MapStruct tronquées : `PledgeMapperImpl`, `AdminModuleMapperImpl`, `AdminContactMapperImpl`).
  Remède : `rm -rf target` puis un build à la fois ;
- `mvn clean` échoue parfois dans ce bac à sable (« Failed to delete target/classes »), ce qui laisse
  un `target/` partiel et produit des erreurs trompeuses (`Continent not present`, `JwtUtil` introuvable).

---

## 1. Les lots, un par un

### T1 — Supprimer les mélanges Goals / Dons (défauts A, D, E, F, G) — ✅ fait

**Fait.** La tuile « Mes objectifs » n'est plus conditionnée par `!hasDonations` (défaut A) : elle
s'affiche dès que la personne a des objectifs, module Dons activé ou non, avec un commentaire de
décision qui interdit de la re-conditionner. L'accueil n'a plus ni `PRIMARY_CURRENCY` ni `YEAR_GOAL`
en dur (défaut D) : une ligne **par devise**, avec sa variation calculée devise par devise ; la barre
de progression et l'« objectif 3 000 £ » ont disparu, clé i18n comprise. « Mes dons » regroupe ses
totaux **et ses sous-totaux mensuels** par devise (défaut E). La date du don devient saisissable par
un sélecteur maison (calendrier mensuel local, **sans nouvelle dépendance**), jours futurs grisés,
navigation bornée au mois courant — miroir du `@PastOrPresent` de `DonationCreateRequest.java:36`
(défaut F). Le montant part vide, la fausse référence « CMCI-xxxx » et le nom « CMCI UK » sont
retirés du reçu, qui affiche la devise réellement choisie (défaut G).

**Fichiers** : `mobile/app/(tabs)/home.tsx`, `mobile/app/(tabs)/donations.tsx`, `mobile/app/declare.tsx`,
`mobile/utils/i18n/locales/{fr,en}.json`.

**Réserves** :
- Les **noms de mois** de l'accueil et des en-têtes de « Déclarations » passent par
  `utils/format.monthLabel`, dont les libellés sont **en français en dur** quelle que soit la langue.
  Défaut réel, hors périmètre du lot, **visible en anglais** (recette 10.6).
- Le calendrier démarre la semaine le **lundi** dans les deux langues, y compris en anglais.
- Le montant n'étant plus pré-rempli, le clavier ne s'ouvre pas tout seul (pas d'`autoFocus`).
- Le sélecteur de date est **local à `declare.tsx`** ; il a depuis été repris par `DeclarationForm`
  (T7).

### T12 — Rattachement Dons et assemblées « node-only » — ⚠️ partiel (script non joué)

**Fait.** `ModuleAccessServiceImpl.addUnitAndAncestors` ne repose plus sur la seule chaîne legacy
`org_unit → org_locality → org_zone → org_country` : dès qu'elle n'atteint pas la nation, la remontée
est complétée par `org_node`. `DonationServiceImpl.create` interroge `org_node` quand `org_unit` ne
rend rien et refuse explicitement en **422 `UNIT_NOT_MIRRORED`** (avec un log nommant le nœud) au
lieu d'un 404 opaque. Script de réparation `donation/10-repair-user-donation-unit.sql`, idempotent,
commenté, **volontairement hors de `db.changelog-master.xml`**.

**Fichiers** : `subscription/ModuleAccessServiceImpl.java`, `donation/donation/DonationServiceImpl.java`,
`db/changes/donation/10-repair-user-donation-unit.sql` + 2 tests de chaque côté.

**Réserves** :
- **Le script n'a pas été joué.** C'est un geste manuel, à faire sur la base visée (recette 2.6→2.10).
- Le repli `org_node` et le 422 sont de la **défense en profondeur**, pas la correction d'un bug
  observable : la clé étrangère `t_user.*_unit_id → org_unit(id)` empêche aujourd'hui d'être rattaché
  à une assemblée node-only. Vérifiés par test unitaire, **pas** par la recette manuelle.
- `POST /api/org/admin/nodes` reste **la seule porte** qui fabrique des assemblées node-only. Un refus
  serveur de créer un `ASSEMBLY` par cet endpoint fermerait le trou ; hors périmètre, à trancher.
- Le 2ᵉ ordre du script (`donation_role = 'MEMBRE'` là où il est NULL) est neutre en droits ; à
  retirer si JP préfère ne toucher qu'à `donation_unit_id`.

### T2 — Le trésorier (backend) — ✅ fait

**Fait.** Le trésorier existe comme **affectation à un nœud** : table `don_treasurer_assignment`,
`TreasuryAccessService` (périmètre = union des `subtreeIdsOfType(nodeId, ASSEMBLY)`, **recalculé à
chaque requête, en base, sans claim JWT**), `MeResponse.treasurer` + `treasurerNodeIds`, CRUD
`/api/church/admin/treasurers` réservé SECRETARIAT / SUPER_ADMIN, nomination **idempotente**, retrait
= désactivation (la trace reste). Les autorisations sont refondues : `restrictToSelfOnly =
!isTreasurer`, `@PreAuthorize("ROLE_LEADER")` retiré des stats et de l'export, `/donations/stats/summary`
**ouvert à tout membre abonné** sur ses propres dons (c'est ce qui corrige le défaut B),
`/api/church/leader/**` passe en `authenticated()` + `requireTreasurer`, et `isDonationAdmin` ne
conserve que `superAdmin`. `DonationAccessService`/`Impl` est **supprimé**.

**Fichiers** : 11 modifiés, 3 supprimés, 6 créés + la migration `11-don-treasurer-assignment.sql`
(package `donation/treasury/**`, `donation/common/security/TreasuryAccess*`, `MeResponse`,
`SecurityConfig`, `DonationServiceImpl`, `DonationStats*`, `DonationExportController`,
`LeaderViewServiceImpl`).

**Vérifié** : `TreasurerScopeIntegrationTest` 12 tests verts (périmètre assemblée/ville/région,
assemblée créée après nomination, dirigeant non trésorier, retrait immédiat avec le **même** jeton,
`/me`, CRUD, idempotence).

**Réserves** :
- **Effet de bord assumé** : un dirigeant qui n'est pas trésorier ne voit plus que ses propres dons.
  C'est la traduction directe de « on ne mélange pas Dons et Goals », mais **c'est un changement
  visible** pour qui l'ignore.
- LEADER, SECRETARIAT et DIRIGEANT_COORDINATEUR ne peuvent plus éditer ni supprimer le don d'autrui.
  Seul un SUPER_ADMIN le peut encore. **Le trésorier non plus — il lit.**

### T3 — Écran « Nommer trésorier » (back-office) — ✅ fait

**Fait.** Action « Trésorier » dans la colonne d'actions de la page Utilisateurs, visible seulement
pour SECRETARIAT / SUPER_ADMIN (miroir exact de la garde serveur). La modale montre les affectations
en cours (type de nœud, nom, auteur, bouton « Retirer ») et l'arbre org à 4 niveaux **du ministère de
la personne** : on nomme sur un ou plusieurs nœuds en une fois ; les nœuds déjà couverts sont
cochés-verrouillés. Nouveau service `treasurerService.ts`, `ChurchUser` aligné sur `MeResponse`,
21 clés i18n ajoutées des deux côtés (arbres fr/en vérifiés identiques).

**Fichiers** : `shephr-webapp/src/services/{treasurerService.ts,authService.ts}`,
`src/pages/Utilisateurs.tsx`, `src/i18n/locales/{fr,en}.json`.

**Réserves** :
- L'arbre est **dupliqué**, pas factorisé : `TreasurerTreeRow` est le jumeau de `TreeRow`
  d'`Abonnements.tsx`. Toute évolution de l'affichage est à porter **aux deux endroits**.
- La nomination multi-nœuds est **N appels POST séquentiels**, pas une transaction : si le 3ᵉ échoue,
  les 2 premiers restent acquis (sans gravité, l'API est idempotente).
- Les affectations **retirées** ne sont pas affichées (`includeInactive` non exploité par l'écran).
- Le gating lit le `/me` mis en cache dans `localStorage` : un compte qui vient de recevoir SECRETARIAT
  verra le bouton **au rechargement de la page**, pas à chaud.
- `npm run lint` du back-office rend **1 erreur préexistante** (`src/components/primitives.tsx:264`),
  sur un fichier non modifié.

### T4 — Onglet Trésorerie et accueil membre (mobile) — ✅ fait

**Fait.** L'onglet « Périmètre » devient « **Trésorerie** » et n'est plus gaté sur `isLeader` (qui
dérivait aussi de `goalRole`) mais sur `isTreasurer`, exposé par `AuthContext` depuis
`MeResponse.treasurer`. Les trois écrans trésorier affichent un **bandeau d'erreur avec « Réessayer »**
au lieu d'un zéro crédible, et leurs totaux sont calculés **par devise** (le filtre `currency === 'GBP'`
en dur masquait les dons en EUR/USD). Deux corrections de véracité : « Reçu ce mois » interroge enfin
les stats à partir du 1ᵉʳ du mois, et la carte « Vos dons » perd son montant (depuis T2,
`/stats/summary` y renvoie le total du **périmètre**, pas les dons personnels).

**Fichiers** : `mobile/services/authApi.ts`, `contexts/AuthContext.tsx`, `app/(tabs)/_layout.tsx`,
`app/(tabs)/leader/{index,stats,unit/[unitId]}.tsx`, `app/(tabs)/home.tsx`,
`components/ErrorBanner.tsx`, `utils/currencyTotals.ts`, locales.

**Réserves** :
- `me` n'est relu **qu'au démarrage de l'app**, au login et sur `refreshMe()` : une nomination ou un
  retrait de trésorier ne change l'onglet **qu'au relancement**, pas à chaud.
- La tuile « **Membres actifs** » reste à « — » : aucun endpoint de comptage, non remplie pour ne pas
  inventer un chiffre.
- Le « Top catégories » calcule le pourcentage **dans la devise de chaque ligne** : avec deux devises,
  deux barres peuvent afficher 100 % chacune. Volontaire (mélanger les dénominateurs serait faux),
  mais à regarder.

### T5 — Référentiel des rubriques, de bout en bout — ✅ fait

**Fait.** Table `don_category` (unique sur `(ministry_id, code)`), seedée avec les 6 rubriques réelles
pour chaque ministère existant ; `don_donation` gagne `category_id` (FK nullable) avec **reprise des
données par rapprochement sur le code**, la colonne `category` restant l'historique. CRUD
`/api/church/donations/categories` : lecture ouverte au ministère, écriture réservée
SECRETARIAT / SUPER_ADMIN ; une rubrique utilisée **se désactive et ne se supprime pas** (422
`CATEGORY_IN_USE`, testé y compris pour un don historique sans `category_id`). Le code est dérivé du
libellé français à la création puis **immuable** — c'est lui qui rattache l'historique. Back-office :
`ConfigTab` débranché du mock `@/data/mock`. Mobile : `constants/categories.ts` ne porte plus que
l'apparence, le référentiel vient d'un `useDonationCategories` (cache mémoire + AsyncStorage,
déduplication, **purge à chaque changement de session**) ; six écrans rebranchés.

**Réserves** :
- **Référentiel non fermé** : un code inconnu laisse `category_id` à null et la déclaration passe avec
  sa rubrique en clair. C'est le cadrage du lot, et ça préserve la correction d'un vieux don ; mais
  une déclaration **forgée par API** peut porter une rubrique hors référentiel.
- **Deux listes par défaut coexistent** et doivent rester alignées : le seed SQL (ministères existants)
  et `DonationCategoryDefaults.SEEDS` (ministères créés ensuite).
- L'**amorçage se fait dans `list()`**, donc sur un chemin de **lecture**. Une fois par ministère, et
  un amorçage concurrent est absorbé par l'unicité — mais c'est une écriture sur un GET.
- Le contrôleur est **sans `@RequiresModule("DONATIONS")`** (symétrie avec les trésoriers) : on
  paramètre avant d'activer l'abonnement. Un membre d'une assemblée non abonnée peut donc **lire** la
  liste des rubriques (il ne voit toujours aucun don).
- Les rubriques du **seed de dev** (« Dîme » avec accent et majuscule) ne se rapprochent d'aucun code :
  sur une base de dev seedée, les dons existants resteront sans `category_id`.
- La carte « **Devises** » du même écran back-office reste un **mock** — ne pas la démontrer.
- La section i18n `categories.*` du mobile est **conservée volontairement** : elle sert de repli pour
  un don dont la rubrique a été désactivée. Ne pas la supprimer en croyant à du code mort.

### T6 — Déclaration multi-rubriques et validation (backend) — ✅ fait

**Fait.** Tables `don_declaration` / `don_declaration_line`, package `donation/declaration/**`,
7 endpoints dont `mine=true`, `/verify` et `/unverify`. Règles encodées : `declared_total = Σ lignes`
(422 `DECLARED_TOTAL_MISMATCH`), **une seule devise** (422 `DECLARATION_SINGLE_CURRENCY`), correction
et suppression par le donateur **tant que c'est `DECLARE`** — la fenêtre de 24 h est **supprimée** —,
transition réservée au trésorier **dont le périmètre couvre l'unité**, auto-validation autorisée et
tracée (`selfVerified` + audit « AUTO-VALIDÉE »). `don_donation` reste la ligne comptable ; l'ancien
`POST /api/church/donations` produit lui aussi une déclaration mono-ligne. Les vues gagnent `?status=` ;
omis, elles rendent **exactement** ce qu'elles rendaient avant. La migration reprend tout l'historique
en déclarations mono-ligne `DECLARE`.

**Vérifié** : `DeclarationIntegrationTest` 20 tests + 85 tests sur tout le module Dons, verts.

**Réserves** :
- **Le backfill SQL n'est pas exercé par les tests** (profil `test` = H2, Liquibase désactivé) : il
  **doit** être validé à la main sur PostgreSQL (recette 8b.42 et 8b.43).
- Écart assumé avec le croquis du §9 : `don_declaration_line` porte deux colonnes de plus —
  `donation_id` (sans lequel chaque correction renumérote l'historique) et `category` (le code en clair).
- `DonationResponse` expose `declarationId` mais **pas** le statut, délibérément (éviter un N+1).
- **Point technique à ne pas défaire** : `Declaration.lines` est **sans `cascade` ni `orphanRemoval`**.
  Les id étant assignés à la construction, `save` passe par `merge`, dont la cascade **annulait
  silencieusement** les suppressions d'orphelins. Les lignes sont écrites explicitement par le dépôt.

### T7 — Parcours membre de la déclaration (mobile) — ✅ fait

**Fait.** « Déclarer un don » devient la saisie d'un **versement** : une date, **une** devise au niveau
de la déclaration, N lignes « rubrique + montant + note », et un total **calculé en direct** — jamais
saisi, ce qui rend le 422 `DECLARED_TOTAL_MISMATCH` impossible à provoquer depuis le mobile. Aucun
champ bancaire, aucun moyen de versement, aucune référence (D0-10). L'onglet liste « Mes déclarations »
avec pastille de statut, filtre à deux valeurs, totaux par devise. La fenêtre de 24 h a disparu du
client : le droit d'écrire est **server-driven** (`editable`). Deux briques partagées créées :
`DeclarationForm` et `DeclarationStatusPill`.

**Réserves** :
- **La note est portée par ligne, pas par le versement** : le modèle T6 n'a pas de note au niveau de la
  déclaration. À confirmer par JP si l'intention était une note globale.
- Plus de **filtre par rubrique** dans « Mes déclarations » (l'API n'expose pas ce paramètre) ;
  remplacé par le filtre de statut.
- **Pagination laissée de côté** : la liste demande `size=100`. Au-delà, les plus anciennes ne
  s'affichent pas.
- `createDonation` / `updateDonation` / `deleteDonation` ont été **retirés** de `donationApi.ts`.
  L'endpoint existe toujours côté serveur ; un lot qui en aurait besoin doit le réintroduire.
- Des clés i18n ont été **supprimées** (`detail.reference`, `detail.means`, section `editDon`…) :
  un lot qui y ferait référence afficherait une chaîne brute.
- `tabs.donations` passe de « Mes dons » à « Déclarations » (valeur i18n).
- L'accueil liste encore des **lignes comptables** et navigue par id de don ; le détail rattrape en
  retombant sur `getDonation(id).declarationId`.

### T8 — File « À vérifier » du trésorier (mobile) — ✅ fait

**Fait.** Écran `leader/verify.tsx` : les déclarations du périmètre triées par date de don
**croissante**, avec déclarant, date, assemblée, total par devise et ventilation **visibles sans
ouvrir la fiche** ; filtres statut et « Mes dons », pagination, relecture au focus. Fiche
`leader/declaration/[id].tsx` : **un seul geste**, « Valider ». Aucun champ de montant constaté, aucun
motif d'écart, aucun rejet. Bandeau « Auto-validée ». Le tableau de bord passe le **statut** en filtre
et pilote les trois agrégats (par mois, par rubrique, **par assemblée** — ajouté). L'accueil Trésorerie
gagne une carte d'entrée avec le compteur des déclarations en attente.

**Réserves** :
- **Tri ancienneté croissante** : le tri serveur par défaut est décroissant. À confirmer (0t.6).
- Le geste « **Dévalider** » est exposé sous confirmation : prévu par J-1 comme rattrapage, **mais non
  nommé dans le cadrage du lot**. À confirmer (0t.7).
- Pas de **validation en lot** : explicitement hors V1.
- Pas de bouton d'export dans la file : c'est T9.
- `.expo/types/router.d.ts` (généré, non versionné) était périmé et faisait échouer `tsc` sur les
  nouvelles routes ; régénéré en lançant brièvement `npx expo start`. **Toute machine qui n'a pas
  relancé Metro verra ces erreurs de typed routes.**

### T9 — Exports Excel et PDF — ⚠️ partiel

**Fait.** `format=csv|xlsx|pdf` ; tout autre format reste un 400. `poi-ooxml:5.2.5` ajouté au pom
(openpdf y était déjà). Classeur à **deux feuilles** : « Déclarations » (une ligne par ligne de
rubrique, montants en cellules **numériques**, dates réelles, filtre + volet figé) et « Synthèse »
(contexte, puis totaux par rubrique, par assemblée, par mois, **par statut** et total général — chaque
bloc **par devise**). PDF paysage avec en-tête ministère + périmètre en clair, totaux par devise,
pied de page daté et numéroté. Les quatre colonnes J-1 — `Statut / ValidePar / DateValidation /
AutoValidee` — sont dans les trois formats ; la colonne reste **vide** tant que c'est `DECLARE`
(« pas encore validée » n'est pas « validée par un tiers »). Le CSV historique est préservé.

**Vérifié** : `DonationExportIntegrationTest` (8 tests) relit réellement le `.xlsx` avec POI.

**Ce qui manque — c'est ce qui rend le lot partiel** :
- **Aucun bouton d'export dans l'écran Trésorerie du mobile.** `buildExportUrl` existe dans
  `statsApi.ts` mais n'est branché nulle part : `mobile/` ne faisait pas partie des fichiers du lot.
  Tant qu'il n'existe pas, **la recette §6 se déroule par curl / Postman**.

**Autres réserves** :
- **Nom de la feuille** : le cadrage T9 dit « Déclarations », le §6.2 d'origine disait « Dons ».
  À trancher (0t.5), sinon le test tombe à tort.
- Le contenu de l'export est **en français uniquement** (en-têtes, « Oui »/« Non », libellé de rubrique).
  Le backend n'a aucun mécanisme d'i18n d'export.
- **L'export n'est plus streamé** : la réponse est construite en mémoire. Nécessaire (un `.xlsx` ne se
  streame pas) et cela **corrige un vrai défaut** (SecurityContext vide au dispatch ASYNC → 403 sur une
  réponse déjà envoyée) — mais un export national sur plusieurs années tiendra en mémoire.
- Le PDF tient ses douze colonnes en paysage à **7 pt** : lisible mais dense.

### T10 + T11 — Notifications du module Dons — ✅ fait

**Fait.** **T10** : job quotidien (7 h 10 Paris, verrou consultatif PostgreSQL, coupe-circuit
`donations.digest.enabled`) écrivant **par nœud** un résumé des déclarations encore `DECLARE`, adressé
à **tous** les trésoriers du nœud (J-2), montants **par devise**. **T11** :
`POST /api/church/donations/reminders/bulk` relance les personnes du périmètre n'ayant rien déclaré
(défaut : mois courant) ; anti-spam 24 h par personne, **les déjà-relancés sont sautés, pas en erreur** ;
`GET .../reminders/scopes` rend à l'intéressé ses propres nœuds **avec leur nom**.

**Point technique** : la sonde anti-spam existante ne regarde **pas le destinataire**. Avec
`refEntityId = le nœud`, le résumé écrit pour le premier trésorier aurait fait passer les autres pour
déjà servis — **panne silencieuse**. D'où une sonde **par destinataire**, locale au paquet.

**Réserves** :
- Le déclencheur mobile `components/RelanceNonDeclarants.tsx` avait été livré **sans être importé
  nulle part** (l'écran Trésorerie appartenait au lot T8). **Il a été branché au lot de consolidation**
  dans `app/(tabs)/leader/index.tsx` — c'est la seule ligne de code produite par la consolidation.
- **Recette 11.9 non couverte** : `NotificationGate` n'a aucune notion d'action ni de lien profond, et
  le lot interdisait le travail d'UI. La modale n'ouvre donc aucun écran.
- **Divergence de nommage** avec G3 : `envoyes / dejaRelances / dejaDeclares / envoyesA` ici, `sent /
  alreadyReminded / alreadySubmitted / sentToNames` côté Goals. Même sens, deux langues.
- **Période figée au mois courant**, non exposée à l'écran.
- La **langue est figée à l'envoi** ; le volume n'est pas plafonné ; le verrou consultatif est
  Postgres-only (non exercé par les tests H2).
- Un **SUPER_ADMIN** n'a aucune affectation : le bloc « Relancer » ne s'affiche pas chez lui.

### G1 + G2 — Hiérarchie Goals (J-4 et J-5) — ✅ fait

**Fait.** **G1** : `unassignedUnits` a quitté la réponse Hiérarchie (DTO, service, type mobile). La
fonction n'est pas perdue : `GET /api/church/leaders/units/unassigned` + l'écran **Structure**, qui
pose le label « dirigeant requis » (RG-DS-10) et un rappel compté en tête de l'onglet Assemblées.
**G2** : garde serveur dans `declareSupervisor` **et** `searchCandidates` (403 pour un acteur non
dirigeant, 422 `SUPERVISOR_NOT_A_LEADER` pour un superviseur non dirigeant, recherche filtrée) ;
`getVisibleUnitIds` saute les subordonnés non-dirigeants et `canSeeUser` utilise un sous-arbre filtré
(le `subtreeUserIds` public reste complet — anti-cycle et plafond de rôles en dépendent) ; `buildChain`
part de l'**assemblée** du fidèle. **Aucune migration de données.** Définition unique du dirigeant :
`ModuleRole.isManager()` + `User.isManager()`. 5 tests ajoutés, 3 réalignés.

**Réserves** :
- **`canManageUser` n'a pas été filtré** : un dirigeant peut encore **administrer** un simple fidèle
  portant un `supervisor_id` historique vers lui, hors de sa ville. Non traité volontairement.
- Le **back-office** propose toujours un sélecteur de superviseur sur des comptes non-dirigeants
  (chemin `/api/church/admin/users`, hors de la garde J-5).
- Les `supervisor_id` posés sur de simples fidèles **restent en base**, inertes.
- `shephr-app/web` lit encore `data.unassignedUnits` : sa section devient vide, sans casse.

### G3 — Rappel groupé Goals — ✅ fait

**Fait.** `POST /api/church/goals/reminders/bulk` (scope `ASSEMBLY | CITY | ZONE | COUNTRY | DISCIPLES`)
servi par un service dédié, le rappel unitaire restant intact et **partageant la même clé d'anti-spam**.
Destinataires = non-soumis de l'année, anti-spam appliqué individuellement, réponse à trois compteurs.
La garde s'appuie sur le périmètre **géographique post-G2**. `GET /goals/reminders/scopes` rend les
périmètres réellement visables **avec l'aperçu du nombre de destinataires**. Écran mobile
`goals/remind.tsx` : deux sections **jamais fondues**, un seul choix envoyé, aperçu, compte rendu.

**Réserves** :
- **Q3 tranchée par le refus** : LEADER et SECRETARIAT reçoivent 403 sur tout périmètre géographique,
  et gardent « Mes disciples ». **À confirmer par JP** (0t.8) — c'est une ligne à changer.
- Le `superAdmin` est autorisé sur tous les périmètres, y compris cross-ministère avec un `scopeId`
  explicite ; le cadrage ne l'évoquait pas.
- L'**aperçu ne retranche pas** les personnes déjà relancées dans les 24 h.
- Le même message part à tout le périmètre (pas de « Bonjour {prénom} »).
- `GET /goals/reminders/scopes` recalcule le périmètre **par option** : à surveiller pour un
  coordinateur portant beaucoup de nations.
- **Environnement** : tout test à contexte Spring exige `YOUTUBE_API_KEY` (défaut du module `video`,
  antérieur et étranger au lot). Il serait sain que le profil `test` fournisse une valeur par défaut.

### N4a — Ciblage push par utilisateur + catégorie RAPPELS — ✅ fait

**Fait.** `DiffusionPush` gagne `List<UUID> utilisateurs` (convention documentée « liste vide = aucune
restriction », miroir de `tousPays()`), un constructeur secondaire gardant intacts les deux chemins de
diffusion de masse. Le sélecteur porte la clause `user_id IN (…)` **dans la requête**, découpée en lots
de 500 — jamais une requête par personne, jamais la lecture du parc entier pour trois trésoriers.
Quatrième catégorie `RAPPELS` livrée **avec ses quatre conditions** : colonne `pref_rappels`
(DEFAULT TRUE), canal Android `rappels`, clause dans le sélecteur, champ DTO (absent = `true`, pour que
les versions antérieures ne se coupent pas des rappels en silence). Point d'articulation N4c :
`RelaiPushNotification`, qui **diffère l'envoi à `afterCommit`** et porte le garde-fou « liste de
destinataires vide ⇒ on ne diffuse rien ».

**Réserves** :
- **Le garde-fou de la liste vide est porté par le relais, pas par `DiffusionPush`.** Un lot futur qui
  construirait un `DiffusionPush` à la main avec une liste calculée puis vide **diffuserait à tout le
  parc**, sans erreur nulle part. Les appelants doivent passer par le relais.
- `LOT_UTILISATEURS = 500` n'a jamais été exercé sur une vraie base.
- `db.changelog-master.xml` est modifié par **plusieurs lots à la fois** : au moment de committer,
  vérifier que les cinq changeSets y sont et que `resync-sequences` reste **en dernier**.

### N4b + N4c — Push Expo mobile et branchement sur la file in-app — ⚠️ fait, non éprouvable

**Fait.** Push Expo entièrement câblé, transposé de l'implémentation en production de CMFIPraise et
adapté au thème Shephr, à son `AuthContext` et à son `apiClient` (axios). Dépendances installées via
`expo install` (`expo-notifications` 0.32.17, `expo-device` 8.0.10, `expo-localization` 17.0.9).
**Trois** catégories réglables, trois canaux Android dont `rappels` — identifiants recopiés au
caractère près depuis `CategoriePush.canalAndroid()`. Enregistrement à la connexion
(`targetApp: "Shephr"`), suppression à la déconnexion. **N4c** : le routeur de tap traite
`NOTIFICATION` + id et `NOTIFICATIONS` sans id ; il n'affiche rien — il **recharge la file des
non-lues** et laisse `NotificationGate` faire son travail, puis conduit à l'écran d'après la `source`.

**Réserves** :
- **ACTION HORS CODE, BLOQUANTE** : clé APNs (`org.cmfi.shephr`), compte de service Firebase et
  `google-services.json` (`com.cmfi.shephr`). Sans elles, aucune bannière ne part — mais l'app démarre
  et la file in-app fonctionne à l'identique.
- `app.json` › `android.googleServicesFile` **volontairement non renseigné**.
- **Expo Go ne délivre plus le push distant sur Android** (SDK 53) : build de développement obligatoire.
- `assets/notification-icon.png` a été **dérivé automatiquement** de `logo-512.png` par seuillage :
  lisible, mais ce n'est pas un travail de graphiste.
- Deux fichiers hors de la liste du lot ont été touchés **minimalement** : `NotificationGate.tsx` (un
  abonnement de rechargement) et `profile.tsx` (l'entrée de menu, qui était commentée).
- **Divergence assumée** : la déconnexion **supprime** l'appareil côté serveur (Shephr n'a pas de mode
  visiteur). Le `DELETE` part avec le jeton capturé juste avant `logout()` ; si l'appel échoue, la
  ligne survit jusqu'à la prochaine connexion.
- La destination du tap est déduite de la `source` : une source nommée autrement ouvrirait la modale
  mais **aucun écran**.
- Aucun interrupteur « Nouvelles vidéos » : `prefVideos` vaut `true` au serveur. Sans conséquence tant
  qu'aucune diffusion `VIDEOS` ne vise `TargetApp.Shephr`.
- Le **badge** d'icône est remis à zéro à chaque passage au premier plan.

### Consolidation (ce lot) — documentation + une ligne de code

- Les trois documents de cadrage ont été mis à jour (`donations-etat-des-lieux.md` §1 et §10,
  `notifications.md` §1.3, §3 et §4, `goals-hierarchie-et-rappels.md` §4 et §5).
- `donations-recette.md` a été **entièrement réécrit** : 265 points de contrôle, numérotation continue
  par section, marqueurs `🔒 socle` / `🧪 à vérifier` / `🔨 à livrer`, plus une section **0 ter**
  regroupant ce qui dépend d'une action extérieure.
- **Une seule modification de code** : `<RelanceNonDeclarants />` rendu dans
  `app/(tabs)/leader/index.tsx`. Sans elle, la relance groupée des non-déclarants existait côté serveur
  mais **n'était atteignable par aucun geste** dans l'application.
- **Aucune collision entre lots n'a été trouvée** : les trois dépôts compilent et la suite backend
  complète passe. Il n'y a rien à corriger qui aurait été masqué.

---

## 2. À faire avant de montrer au client

Dans l'ordre. Les trois premiers points sont des **gestes**, pas du développement.

1. **Assainir la base de démonstration** (§0.2 de la recette) : désactiver l'abonnement
   `DONATIONS` ministère-large, vérifier qu'il n'existe **aucune assemblée « node-only »** ni
   d'assemblée legacy sans miroir `org_node`, puis **jouer à la main** le script
   `donation/10-repair-user-donation-unit.sql`. Sans cela, l'activation ciblée ne démontre rien et un
   compte historique échouera à la première déclaration.
2. **Démarrer une fois le backend sur la base PostgreSQL de démonstration** et vérifier la reprise
   d'historique : `SELECT COUNT(*) FROM don_donation WHERE declaration_id IS NULL;` doit rendre **0**.
   C'est **le seul point du chantier qu'aucun test automatisé ne couvre**, et il porte sur les données
   existantes.
3. **Trancher les cinq arbitrages du §0 ter B** — au minimum le nom de la feuille Excel (0t.5) et la
   question Q3 des rappels ministère-large (0t.8). Un seul mot à changer dans le code de chaque côté,
   mais la recette dépend de la réponse.
4. **Dérouler la recette**, dans cet ordre de priorité :
   **§7** (le but quinquennal n'a pas bougé) → **§4** (le trésorier) → **§8 bis** (déclarer et valider)
   → **§5** (rubriques) → **§8** (montants justes) → **§11.a/11.b** (résumé et relance) → **§12** (Goals).
5. **Décider pour l'export.** En l'état, un trésorier **ne peut pas exporter depuis l'application** :
   il faut un bouton dans l'écran Trésorerie appelant `buildExportUrl` (petit travail, non fait faute
   d'appartenir aux fichiers du lot T9). Sans lui, la démonstration de l'export se fait depuis Postman
   — ce qui est acceptable pour un point technique, **pas devant un client**.
6. **Si le push doit être montré** : faire les démarches Apple et Google (§0 ter A), renseigner
   `android.googleServicesFile`, produire un build de développement. **C'est le plus long en délai
   calendaire** (validation des comptes). Si ce n'est pas fait, **ne pas annoncer le push** : la
   relance et le résumé fonctionnent parfaitement en modale à l'ouverture de l'app, et c'est
   démontrable dès aujourd'hui.
7. **Deux détails visibles à l'écran**, à corriger si la démonstration se fait en anglais :
   les **noms de mois en français en dur** (`utils/format.monthLabel`) sur l'accueil et l'historique,
   et la tuile « **Membres actifs** » de l'écran Trésorerie qui affiche « — ».
8. **Ne pas démontrer** : la carte « Devises » de Réglages (mock), et l'action de l'in-app sur le
   résumé du trésorier (la modale n'ouvre aucun écran).
