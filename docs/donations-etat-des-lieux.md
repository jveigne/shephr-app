# Module Dons — état des lieux et reste à faire

**Date** : 14/09/2026 · **Cadrage** : JP 14/09/2026 · **Mise à jour** : 14/09/2026 (après chantier T1→T12)
**Périmètre** : `cmfipraise-backend`, `shephr-app/mobile`, `shephr-webapp` (back-office)
**Hors périmètre explicite** : `shephr-app/web` (Espace ministère) — décision JP 14/09.

> Ce document remplace comme référence de travail `cmfipraise-backend/docs/shephr/10_08_2026/01_Plan_Module_Dons.md`
> (plan D0→D9) et `…/16_08_2026/03_Module_Dons_Reste_A_Faire.md` (mise en attente).
> Deux sujets connexes ont leur propre document : **`docs/notifications.md`** (informer le
> trésorier, relancer les fidèles) et **`docs/goals-hierarchie-et-rappels.md`** (leadership
> géographique vs discipulat, rappels groupés Goals).
> La question laissée ouverte le 16/08 — « y a-t-il un trésorier, ou pas de rôle du tout ? » — est
> **tranchée ici** : il y a un trésorier, et c'est une **affectation à un nœud**, pas un rang.

---

## 0. La règle, telle qu'elle est posée

1. **Le périmètre se crée au back-office**, comme pour Goals. On n'invente rien : on réutilise ce que
   Goals fait déjà bien (nation → région → ville → assemblée).
2. **Pas d'invitation.** Pour s'inscrire, une personne doit être **rattachée à une assemblée**.
   Sans rattachement, pas de compte exploitable.
3. **Si le module Dons est activé sur un nœud, il s'affiche dans toute la sous-branche** (héritage
   descendant de l'abonnement).
4. **Trésorier = affectation à un nœud.** Il voit les finances de sa hiérarchie ; un trésorier placé
   plus haut voit plus large. Au plus simple, sans casser l'existant.
5. **Les rubriques se configurent au back-office.**
6. **Exports Excel et PDF.**

Et trois garde-fous :

- **« Mes objectifs » ne doit jamais disparaître.** Le but quinquennal est central ; activer les Dons
  ne doit rien lui retirer.
- **On ne mélange pas Dons et Goals.** Un rôle Goals n'ouvre rien côté Dons, et réciproquement.
- **Le web est hors sujet** pour cette livraison.

---

## 0 bis. Décisions du 14/09/2026 (JP)

| # | Question | **Décision** |
|---|---|---|
| **J-1** | Déclaration multi-rubriques et vérification ? | **Oui, les deux — mais au plus simple.** La personne déclare (une date, des rubriques, des montants) ; le trésorier **vérifie et valide**. Deux statuts, pas davantage : `DÉCLARÉ` → `VÉRIFIÉ`. Pas d'« écart », pas de « rejeté » : si le montant ne correspond pas, le trésorier **laisse en `DÉCLARÉ`** et parle à la personne, qui corrige elle-même (une déclaration reste modifiable tant qu'elle n'est pas validée). |
| **J-2** | Notification au trésorier ? | **Un résumé des dons, adressé à TOUS les trésoriers du nœud.** Pas une notification par déclaration. |
| **J-3** | Push ? | **Maintenant.** Le push Expo entre dans le lot (lot N4 de `notifications.md`). |
| **J-4** | Hiérarchie et discipulat ? | **La Hiérarchie n'affiche que le discipulat** — voir `goals-hierarchie-et-rappels.md` §1.5. |

Ces décisions **remplacent** les décisions correspondantes du plan du 10/08 (D0-4, D0-6, D0-8 notamment).

---

## 1. Synthèse — ce qui est fait, ce qui reste

> ⚠️ **Mise à jour du 14/09 au soir** : les lots T1→T12 ont été implémentés. Ce tableau dit ce qui
> est **écrit et compilé**, pas ce qui est **éprouvé** : rien n'a encore été testé à la main.
> La recette est dans `docs/donations-recette.md`, les réserves lot par lot dans
> `docs/dons-journal-implementation.md`.

| # | Point | Fait | Reste à faire |
|---|---|---|---|
| 1 | Périmètre créé au back-office | ✅ **complet** | — |
| 2 | Inscription = rattachement à une assemblée | ✅ **complet** | jouer **à la main** le script de réparation `donation/10-repair-user-donation-unit.sql` sur la base visée (volontairement hors changelog) |
| 3 | Activation sur un nœud → visible dans la sous-branche | ✅ **complet** | repli `org_node` ajouté en défense en profondeur ; contrôler l'absence d'assemblées « node-only » avant démo (§0.2 de la recette) |
| 4 | Trésorier affecté à un nœud, voit sa hiérarchie | ✅ **écrit** (T2·T3·T4) : table `don_treasurer_assignment`, `TreasuryAccessService`, `MeResponse.treasurer`, CRUD API, écran back-office, onglet mobile « Trésorerie » | recette §4 · le rang pastoral n'ouvre plus rien (effet de bord voulu : un dirigeant non trésorier ne voit que ses dons) |
| 5 | Rubriques configurées au back-office | ✅ **écrit** (T5) : table `don_category` (une liste **par ministère**), CRUD, `Settings.tsx` débranché du mock, mobile branché sur l'API + cache | recette §5 · la carte « Devises » du même écran reste un mock |
| 6 | Export Excel et PDF | ⚠️ **partiel** (T9) : `xlsx` (POI, 2 feuilles) et `pdf` (openpdf) livrés côté API, avec les 4 colonnes J-1 | **aucun bouton d'export dans le mobile** : la recette §6 se fait par appel d'API. Contenu des fichiers en **français uniquement** |
| — | Ne pas mélanger Dons et Goals | ✅ **écrit** (T1·T2·T4) : onglet « Trésorerie » gaté sur `isTreasurer`, `/stats/summary` ouvert au membre sur ses propres dons, `isDonationAdmin` réduit à `superAdmin` | recette §4.c et §8 |
| — | « Mes objectifs » ne disparaît pas | ✅ **écrit** (T1) : la tuile ne dépend plus que des droits Goals | recette §7 — **le point le plus important** |
| — | Déclaration multi-rubriques + validation (J-1) | ✅ **écrit** (T6·T7·T8) : `don_declaration` / `don_declaration_line`, 7 endpoints, 2 statuts, reprise de tout l'historique en mono-ligne, écrans mobile de déclaration et file « À vérifier » | recette §8 bis · **la reprise d'historique n'est pas exercée par les tests** (H2) : à valider sur PostgreSQL |
| — | Notifications au trésorier / relance (J-2) | ✅ **écrit** (T10·T11) : résumé quotidien par nœud à **tous** les trésoriers, relance groupée des non-déclarants | recette §11.a et §11.b · la modale in-app **n'ouvre aucun écran** (pas d'action dans `NotificationGate`) |
| — | Push Expo (J-3) | ⚠️ **écrit, non éprouvable** (N4a·N4b·N4c) : ciblage par utilisateur, catégorie `RAPPELS`, mobile complet, routage du tap | **bloqué par les démarches Apple / Google** (clé APNs, compte Firebase, `google-services.json`) — §0 ter de la recette |

**Lecture d'ensemble** : le socle *abonnement → visibilité* était déjà solide ; tout ce qui fait la
valeur métier du module — trésorier, rubriques, déclaration réelle, validation, exports,
notifications — est désormais **écrit, compilé et couvert par des tests automatisés côté backend**
(`mvn test` : 1374 tests, 0 échec au 14/09). Ce qui manque est d'un autre ordre : **la recette
manuelle**, un bouton d'export mobile, et les identifiants push.

---

## 2. Point 1 — Le périmètre se crée au back-office ✅

**C'est fait, et c'est exactement le mécanisme de Goals.**

| Brique | Emplacement | État |
|---|---|---|
| Arbre org 4 niveaux (Nation / Région / Ville / Assemblée) | `org_node`, `OrgNodeTree` | ✅ |
| Catalogue des modules (`DONATIONS` payant, activé) | `sub_module`, seed `db/changes/subscription/01-subscriptions.sql:42` | ✅ |
| Abonnement par nœud, 5 granularités | `Subscription`, `SubscriptionScope` (`MINISTRY/COUNTRY/ZONE/LOCALITY/UNIT`) | ✅ |
| Écran d'activation « Activer ici » sur n'importe quel nœud | `shephr-webapp/src/pages/Abonnements.tsx` | ✅ |
| Suspension / réactivation | `Abonnements.tsx:180-209`, `AdminSubscriptionServiceImpl` | ✅ |
| Garde serveur | `@RequiresModule("DONATIONS")` sur les 4 contrôleurs dons, appliquée par `RequiresModuleAspect` → 403 `MODULE_ACCESS_DENIED` | ✅ |

⚠️ **Un piège de recette, pas un défaut** : la migration `01-subscriptions.sql:47-49` a créé, pour
**tout ministère existant**, un abonnement `DONATIONS` au niveau `MINISTRY` (rétro-compatibilité
pilote CMCI UK). Sur une base existante, tout le monde a donc déjà le module. Pour démontrer
l'activation ciblée, il faut d'abord **désactiver cet abonnement ministère-large**.

---

## 3. Point 2 — Inscription = rattachement à une assemblée ✅ (réparation livrée, à jouer à la main)

**Le parcours voulu est celui qui existe déjà**, et il est symétrique Goals / Dons.

Pour déclarer un don, le backend exige `donationUnitId` (`DonationServiceImpl.java:61` →
422 `USER_NO_UNIT`). Voici qui le pose :

| Chemin d'inscription | `goalUnitId` | `donationUnitId` | Verdict |
|---|---|---|---|
| Demande de rattachement à une assemblée (mobile) | ✅ | ✅ `AssemblyJoinRequestServiceImpl:383-388` | ✅ conforme |
| Code d'adhésion d'assemblée | ✅ | ✅ `UnitServiceImpl:77,87` | ✅ conforme |
| Changement d'assemblée par le membre | ✅ | ✅ `UnitServiceImpl:135-136` | ✅ conforme |
| Nomination d'un dirigeant d'assemblée | ✅ | ✅ `AdminUnitServiceImpl:238-241` | ✅ conforme |
| Réaffectation back-office (`reassign`) | ✅ | ✅ aligné depuis RG-RT-06 (19/08), `AdminUserServiceImpl:982` | ✅ conforme |
| **Invitation** (formulaire web/back-office) | ✅ | ❌ **jamais posé** | ⛔ abandonné (point 2) |

**Ce qui reste** : l'alignement de `reassign` *ne crée pas* un rattachement absent
(`AdminUserServiceImpl:975-982`, choix documenté). Les comptes créés par invitation avant cette
décision ont donc `goalUnitId` sans `donationUnitId` : ils verront l'onglet Dons et échoueront à la
première déclaration. Il faut **une réparation unique** (script ou bouton) alignant
`donation_unit_id` sur `goal_unit_id` pour ces comptes.

```sql
-- Comptes concernés
SELECT id, username, full_name FROM t_user
 WHERE active AND goal_unit_id IS NOT NULL AND donation_unit_id IS NULL;
```

---

## 4. Point 3 — Activation sur un nœud → toute la sous-branche ✅ (réserve levée par un repli, lot T12)

**C'est fait et c'est la règle RG-SUB-04.** `ModuleAccessServiceImpl.collectCoverageEntityIds:100-119`
rassemble tous les rattachements de la personne puis **remonte** ses ancêtres (assemblée → ville →
région → nation → ministère) ; un abonnement posé à n'importe lequel de ces niveaux la couvre.
Résultat exposé par `GET /api/me/accessible-modules`.

Côté mobile, le branchement est **fait** : `hasDonations = modules.includes('DONATIONS')`
(`contexts/AuthContext.tsx:144`), onglets gatés (`app/(tabs)/_layout.tsx:64,86`), et l'ancien flag
en dur `mobile/constants/features.ts` a été supprimé.

⚠️ **Réserve technique à lever** : `addUnitAndAncestors:130-149` résout l'assemblée dans `org_unit`
(table legacy) et **abandonne silencieusement la remontée** si elle n'y est pas. Une assemblée qui
n'existerait que dans `org_node` casserait à la fois la couverture d'abonnement **et** la création
de don (`DonationServiceImpl:66-67` → 404 `Unit`).

Les deux chemins de création d'assemblée passent aujourd'hui par `UnitFactory.createAssembly`, qui
écrit `org_unit` **et** le miroir `org_node` — le risque est donc théorique, mais
`POST /api/org/admin/nodes` (back-office) ne crée pas d'`org_unit`. À contrôler avant toute démo :

```sql
SELECT n.id, n.name FROM org_node n
 LEFT JOIN org_unit u ON u.id = n.id
 WHERE n.type = 'ASSEMBLY' AND u.id IS NULL;   -- doit être vide
```

⚠️ **Rafraîchissement** : les modules ne sont rechargés que quand le token change
(`AuthContext.tsx:66-76`). Après activation au back-office, l'onglet apparaît **au relancement de
l'app ou à la reconnexion**, pas à chaud.

---

## 5. Point 4 — Le trésorier ❌ à l'analyse → ✅ livré (T2 · T3 · T4)

> **État au 14/09 au soir** : livré par les lots **T2 · T3 · T4**. Le diagnostic ci-dessous est celui d'avant le chantier ; il est conservé parce qu'il explique *pourquoi* le rang pastoral a été débranché. Ce qui a été construit est décrit dans `dons-journal-implementation.md`.

**Aucune notion de trésorier dans le code.** Aujourd'hui, « voir les dons des autres » dérive du
**rang pastoral**, ce qui est précisément ce qu'il faut supprimer :

| Mécanisme actuel | Emplacement | Problème |
|---|---|---|
| `donationRole != MEMBRE` → autorité Spring `ROLE_LEADER` | `JwtAuthenticationFilter:94-104` | pivot de tout le reste |
| `ROLE_LEADER` garde stats et exports | `DonationStatsController:26`, `DonationExportController:40` | un trésorier sans rang est bloqué ; un dirigeant sans fonction passe |
| Visibilité = sous-arbre **de personnes** (superviseurs) | `AccessControlServiceImpl.getVisibleUnitIds:139-199` | suit l'organigramme pastoral, pas la trésorerie |
| `LEADER` / `SECRETARIAT` / `COORDINATEUR` peuvent **modifier et supprimer** le don de n'importe qui | `DonationServiceImpl.isDonationAdmin:191-199` | un trésorier ne doit jamais réécrire la déclaration d'un membre |

Deux tables `don_leader_assignment` / `don_leader_hierarchy` existent en base
(`db/changes/donation/05`, `06`) mais **aucune entité Java ne les référence** — code mort, à ignorer.

**Ce qu'il faut construire** (au plus simple, sans toucher à `ModuleRole`) :

1. Table `don_treasurer_assignment (id, user_id, node_id, ministry_id, active, created_at, created_by_id)`,
   unique sur `(user_id, node_id)`. `node_id` référence `org_node` : assemblée, ville, région ou nation.
2. `TreasuryAccessService` :
   - `isTreasurer(user)` → au moins une affectation active ;
   - `visibleUnitIds(user)` → union des `OrgNodeTree.subtreeIdsOfType(nodeId, ASSEMBLY)` de ses
     affectations. **La brique existe déjà** (`org/node/OrgNodeTree.java:43`) — c'est elle qui donne
     « un trésorier plus haut voit plus large », gratuitement.
3. Remplacer `@PreAuthorize("hasAnyRole('LEADER','SUPER_ADMIN')")` par un contrôle applicatif
   `isTreasurer(user)`. **Pas de claim JWT** : une nomination doit prendre effet immédiatement.
4. `DonationServiceImpl.list` : `restrictToSelfOnly = !isTreasurer(user)` — le rang ne compte plus.
5. `isDonationAdmin` : ne conserver que `superAdmin`. Le trésorier **lit**, il n'édite pas.
6. `MeResponse` : exposer `treasurer: boolean` pour que le mobile n'ait pas à deviner.
7. CRUD `GET|POST|DELETE /api/church/admin/treasurers` + action « Nommer trésorier » dans
   `shephr-webapp/src/pages/Utilisateurs.tsx` (la page ne pilote aujourd'hui que `goalRole`).

**Effet de bord voulu** : un dirigeant qui n'est pas trésorier ne voit que ses propres dons. C'est la
traduction directe de « on ne mélange pas Dons et Goals ».

---

## 6. Point 5 — Rubriques configurées au back-office ❌ à l'analyse → ✅ livré (T5)

> **État au 14/09 au soir** : livré par le lot **T5** — table `don_category`, CRUD, back-office débranché du mock, mobile branché. Le constat ci-dessous est celui d'avant le chantier.

L'écran **existe visuellement** — `shephr-webapp/src/pages/Settings.tsx:283-330`, onglet
« Devises et catégories » — mais il tourne sur un **mock local** :
`useState(CATEGORIES.map(...))` avec `CATEGORIES` importé de `@/data/mock:53`, identifiants
`c-${Date.now()}`, **aucun appel API**. Rien n'est persisté, et les libellés du mock
(« Offrande générale », « Reconnaissance », « Action de grâce ») ne correspondent même pas aux
6 clés du mobile.

Côté mobile, les rubriques sont **en dur** : `mobile/constants/categories.ts` (34 l.) —
`dime, offrande, mission, batiment, special, autre`, libellés français uniquement (champ `fr`, pas
d'anglais). Côté backend, `Donation.category` est un **`String` libre** (`Donation.java:55`,
`@Size(max=100)` sans contrôle de référentiel).

**Ce qu'il faut construire** :

1. Table `don_category (id, ministry_id, code, name, name_en, active, display_order)`, unique sur
   `(ministry_id, code)` — **une liste par ministère**, valable dans toutes ses assemblées.
   Seed avec les 6 rubriques actuelles pour chaque ministère existant.
2. `Donation` : garder `category` (String, historique) + ajouter `category_id` FK. Migration par `code`.
3. CRUD `/api/church/donations/categories` — lecture ouverte aux membres du ministère, écriture
   réservée `SECRETARIAT` / `SUPER_ADMIN` (le paramétrage est un acte de gouvernance).
   Une rubrique référencée par une déclaration se **désactive**, ne se supprime pas.
4. Brancher `Settings.tsx` sur l'API (retirer le mock) et le mobile sur un fetch + cache,
   en conservant icône et couleur mappées sur le `code`.

---

## 7. Point 6 — Exports Excel et PDF ❌ à l'analyse → ⚠️ livré partiellement (T9)

> **État au 14/09 au soir** : livré **partiellement** par le lot **T9** : `xlsx` et `pdf` existent côté API, avec les quatre colonnes de statut. **Le bouton d'export dans l'écran Trésorerie du mobile n'a pas été fait** — c'est le seul point de cette section qui reste ouvert.

**Existant** : CSV uniquement, streamé, colonnes `Date, Localite, Unite, Type, Membre, Categorie,
Montant, Devise` + une ligne TOTAL par devise (`DonationExportController.java:58-115`).
Tout `format` autre que `csv` renvoie **400** (ligne 68).

**Ce qu'il faut construire** :

- **PDF** : `openpdf` est **déjà au `pom.xml:44-48`** et utilisé par `goals/report/GoalReportServiceImpl` —
  le modèle est à recopier (en-tête ministère/assemblée, période, tableau, totaux par devise, pied daté).
- **Excel** : `poi-ooxml` **absent du `pom.xml`**, à ajouter. Feuille « Dons » (une ligne par don) +
  feuille « Synthèse » (totaux par rubrique / assemblée / mois).
- Bouton d'export dans l'écran Trésorerie du mobile.

---

## 8. Les mélanges Goals ↔ Dons à supprimer ❌ à l'analyse → ✅ corrigés (T1 · T2 · T4)

> **État au 14/09 au soir** : les sept défauts **A** à **G** sont corrigés (lots **T1**, **T2**, **T4**). Le tableau ci-dessous reste la liste de contrôle : chaque ligne se vérifie en recette (§7 et §8 de `donations-recette.md`).

C'est le point le plus visible en démonstration, et le plus rapide à corriger.

| # | Défaut constaté | Emplacement | Correction |
|---|---|---|---|
| **A** | **La tuile « Mes objectifs » disparaît de l'accueil dès que les Dons sont activés** — la condition est `!hasDonations && (hasGoals \|\| hasMemberGoals(me))` | `mobile/app/(tabs)/home.tsx:115` | retirer `!hasDonations` : le quinquennal reste affiché **quoi qu'il arrive** |
| **B** | Le bloc « Ce mois-ci / Total année » affiche **toujours 0** pour un membre : `getSummary()` est gardé `ROLE_LEADER`, le 403 est avalé par le `Promise.allSettled` | `home.tsx:39-47` + `DonationStatsController:26` | ouvrir `/stats/summary` au membre **sur ses propres dons** (périmètre = soi si non trésorier) |
| **C** | L'onglet « Périmètre » s'affiche pour un **dirigeant Goals** (`isLeader` dérive aussi de `goalRole`) puis reste vide : trois 403 silencieux | `app/(tabs)/_layout.tsx:86`, `services/authApi.ts:176`, `leader/index.tsx:38-48` | le conditionner à `isTreasurer`, et le renommer « Trésorerie » |
| **D** | Devise **GBP en dur** et objectif annuel **3 000 £ en dur** sur l'accueil, alors que la déclaration propose GBP/EUR/USD : un don en euros n'apparaît nulle part | `home.tsx:23-24` (`PRIMARY_CURRENCY`, `YEAR_GOAL`) | afficher les totaux **par devise** ; retirer l'objectif annuel en dur (ou le rendre paramétrable) |
| **E** | Même défaut sur « Mes dons » : le total additionne **toutes devises confondues** et l'affiche en `GBP` | `app/(tabs)/donations.tsx:86` | totaux par devise |
| **F** | La date du don **n'est pas saisissable** : `const [date] = useState(new Date())`, sans sélecteur — on ne peut déclarer qu'aujourd'hui | `app/declare.tsx:40` | ajouter un sélecteur de date (passé uniquement, `@PastOrPresent` côté serveur) |
| **G** | Montant **pré-rempli à « 40 »** et fausse référence `CMCI-xxxx` fabriquée côté client | `app/declare.tsx:36,69` | champ vide ; retirer la référence (aucun sens métier, et le nom du client est en dur) |

Les corrections **A** et **G** sont des réglages d'une ligne. **B** et **C** sont la conséquence
directe de la décision « trésorier » du point 4 et se font avec elle.

---

## 9. Le modèle de déclaration (décision J-1) → ✅ livré (T6 · T7 · T8)

> **État au 14/09 au soir** : livré par les lots **T6 · T7 · T8**. Le modèle décrit ci-dessous est celui qui a été construit, à deux colonnes près sur `don_declaration_line` : `donation_id` (lien 1-1 vers la ligne comptable) et `category` (le code en clair), justifiées dans le journal d'implémentation.

**Ce qui change par rapport à l'existant.** Aujourd'hui : `don_donation` = 1 montant + 1 devise +
1 rubrique (chaîne libre) + 1 date + 1 note. Pas de regroupement, pas de statut.

**Le modèle cible**, au plus simple :

```
don_declaration
  id, user_id, unit_id, ministry_id
  donation_date            -- la date à laquelle la personne a donné
  declared_total, currency
  status                   -- DECLARE | VERIFIE   (deux valeurs, pas plus)
  verified_by_id, verified_at
  created_at, updated_at

don_declaration_line
  id, declaration_id, category_id, amount, note
```

Règles :

- `declared_total = Σ des lignes` — contrôle serveur, `422` sinon ;
- **une seule devise** par déclaration ;
- statut initial `DECLARE` ; la personne modifie et supprime **tant que c'est `DECLARE`**.
  Cette règle **remplace la fenêtre arbitraire de 24 h** (`DonationServiceImpl:35`) : on corrige
  tant que personne n'a regardé, on ne touche plus après validation ;
- une seule transition : `DECLARE → VERIFIE`, par un trésorier du périmètre. **Pas de retour en
  arrière côté membre** ; un trésorier peut en revanche dévalider s'il s'est trompé ;
- si le montant ne correspond pas à ce que le trésorier constate, **il ne valide pas** : la
  déclaration reste `DECLARE`, il contacte la personne, elle corrige. C'est le geste réel, et ça
  évite un statut « écart » que personne ne saurait clore ;
- un trésorier **peut valider sa propre déclaration** ; l'audit enregistre `validateur = donateur`
  et les exports le signalent en clair ;
- toute transition journalisée (module `audit` déjà présent).

**Articulation avec l'existant** : `don_donation` est conservé comme **ligne comptable** — une ligne
de déclaration produit/actualise une `Donation`. Cela évite de casser les statistiques
(`donation/stats/**`), l'export, et les écrans mobiles actuels. Les vues gagnent un filtre `status`,
et les totaux « officiels » se calculent sur `VERIFIE`.

**Pourquoi ça compte** — en une phrase : sans regroupement, le trésorier voit deux lignes de 200 et
100 là où il a constaté **un** versement de 300 et ne peut pas les rapprocher ; sans validation,
aucun total affiché n'est présentable devant un conseil d'assemblée, et le donateur n'a jamais de
confirmation que son don a été reçu.

---

## 9 bis. Ce qui reste hors lot

Assumé :

- **La pièce jointe / justificatif** (D0-9 : non, V2) et **tout champ bancaire** (D0-10) : aucun
  moyen de versement, aucune référence — le module reste 100 % déclaratif.
- **La validation en lot** (cocher 20 déclarations d'un coup) : V2. En V1 on valide
  déclaration par déclaration.
- **L'Espace ministère web** : `FEATURES.donations = false` reste en place. Rien à faire, rien
  ne régresse.

---

## 10. Lots de travail — état réel au 14/09 au soir

> « Fait » signifie ici : **écrit, compilé, et couvert par les tests automatisés quand le lot en
> ajoute**. Aucun lot n'a été éprouvé à la main — c'est l'objet de `docs/donations-recette.md`.
> Les réserves détaillées, lot par lot, sont dans `docs/dons-journal-implementation.md`.

| Lot | Contenu | État | Réserve principale |
|---|---|---|---|
| **T1** | Corrections d'intégration Goals/Dons : défauts **A**, **D**, **E**, **F**, **G** (§8) | ✅ **fait** | les **noms de mois** de l'accueil et de l'historique restent en français en anglais (`utils/format.monthLabel`, hors lot) |
| **T2** | Trésorier : table `don_treasurer_assignment`, `TreasuryAccessService`, autorisations, `MeResponse.treasurer`, CRUD API | ✅ **fait** | effet de bord assumé : un dirigeant non trésorier ne voit plus que ses propres dons |
| **T3** | Back-office : écran « Nommer trésorier » dans `Utilisateurs.tsx` | ✅ **fait** | arbre org **dupliqué** avec `Abonnements.tsx` (non factorisé) ; nomination multi-nœuds = N POST, pas une transaction |
| **T4** | Mobile : onglet « Trésorerie » gaté sur `isTreasurer` (défaut **C**) + accueil membre (défaut **B**) | ✅ **fait** | `me` n'est relu qu'au démarrage : une nomination ne change l'onglet **qu'au relancement** de l'app |
| **T5** | Rubriques : table `don_category`, CRUD, back-office branché, mobile branché | ✅ **fait** | rapprochement code → rubrique **best-effort** (référentiel non fermé) ; amorçage d'un ministère fait sur un chemin de lecture (`list()`) |
| **T6** | Déclaration multi-rubriques + validation (J-1) : tables, API, migration depuis `don_donation` | ✅ **fait** | le **backfill SQL n'est pas exercé** par les tests (H2) : à valider sur PostgreSQL |
| **T7** | Mobile : écran « Déclarer » multi-lignes + « Mes déclarations » avec pastille de statut | ✅ **fait** | la **note** est portée par ligne, pas par versement ; pas de filtre par rubrique ; pagination figée à 100 |
| **T8** | Mobile + API : file « À vérifier » du trésorier et geste de validation | ✅ **fait** | tri **ancienneté croissante** et geste **« Dévalider »** à confirmer par JP ; pas de validation en lot (hors V1) |
| **T9** | Exports `.xlsx` (POI) et `.pdf` (openpdf), colonnes `Statut / ValidéPar / DateValidation / AutoValidée` | ⚠️ **partiel** | **le bouton d'export mobile n'existe pas** (hors fichiers du lot) : recette par appel d'API. Contenu **en français uniquement**. Export non streamé (tout en mémoire) |
| **T10** | Résumé des dons aux trésoriers du nœud (J-2) | ✅ **fait** | la modale in-app **n'ouvre aucun écran** (pas d'action dans `NotificationGate`) — point 11.9 de la recette |
| **T11** | Relance groupée des non-déclarants par le trésorier | ✅ **fait** | période figée au **mois courant** (non exposée à l'écran) ; écriture des notifications une par une, sans plafond |
| **T12** | Réparation des comptes sans `donationUnitId` + contrôle des assemblées « node-only » | ⚠️ **partiel** | le script de réparation est **livré mais non joué**, et volontairement hors du changelog Liquibase — c'est un geste manuel à faire sur la base visée |

**Lots frères, pilotés en parallèle** :

| Lot | Document | État |
|---|---|---|
| **G1** · Hiérarchie = discipulat seul (J-4) | `goals-hierarchie-et-rappels.md` | ✅ **fait** |
| **G2** · Chaîne de dirigeants (J-5) | idem | ✅ **fait** |
| **G3** · Rappel groupé Goals | idem | ✅ **fait** (Q3 tranchée par le refus, à confirmer par JP) |
| **N4a** · Ciblage push par utilisateur + catégorie `RAPPELS` | `notifications.md` | ✅ **fait** |
| **N4b/N4c** · Push Expo mobile + branchement sur la file in-app | idem | ⚠️ **fait, non éprouvable** — bloqué par les démarches Apple / Google |

---

## Annexe — inventaire du code analysé

**Backend** (`cmfipraise-backend`) — module `donation/` : 2 336 lignes, 34 fichiers.
`DonationServiceImpl` (208 l.), `DonationStatsServiceImpl` (210 l.), `DonationSpecifications` (165 l.),
`LeaderViewServiceImpl` (147 l.), `DonationExportController` (140 l.), `DonationAccessServiceImpl` (50 l.),
`Donation` (82 l.). Module `subscription/` : 1 943 lignes, dont `ModuleAccessServiceImpl` (156 l.),
`Subscription` (134 l.), `RequiresModuleAspect` (42 l.).
Transverse : `AccessControlServiceImpl.getVisibleUnitIds`, `JwtAuthenticationFilter.authorities`,
`AdminUserServiceImpl.reassign`, `OrgNodeTree`, `UnitFactory`.

**Mobile** (`shephr-app/mobile`) — 2 324 lignes : `declare.tsx` (409), `(tabs)/leader/index.tsx` (319),
`(tabs)/leader/unit/[unitId].tsx` (297), `(tabs)/donations.tsx` (266), `donation/edit/[id].tsx` (264),
`(tabs)/leader/stats.tsx` (263), `donation/[id].tsx` (220), `services/statsApi.ts` (106),
`services/donationApi.ts` (95), `services/leaderApi.ts` (39), `constants/categories.ts` (34).

**Back-office** (`shephr-webapp`) — `Abonnements.tsx` (activation, ✅ complet),
`Settings.tsx:283-330` (rubriques, ❌ mock), `Utilisateurs.tsx` (pas de trésorier).
