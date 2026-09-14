# Cahier de recette — Module Dons (mobile)

**Date** : 14/09/2026 · **Mise à jour** : 14/09/2026 après le chantier (lots T1→T12, G1→G3, N4a→N4c)
**Surface** : `shephr-app/mobile` + `shephr-webapp` (back-office) + `cmfipraise-backend`
**Référence** : `docs/donations-etat-des-lieux.md` · `docs/notifications.md` · `docs/goals-hierarchie-et-rappels.md`
**Journal d'implémentation et réserves** : `docs/dons-journal-implementation.md`
**Hors périmètre** : Espace ministère web (`shephr-app/web`) — rien à tester, rien ne doit changer.

> Mode d'emploi : cochez au fur et à mesure. Chaque test a **un résultat attendu unique**.
> Un test qui échoue se note dans la colonne « Constat » — c'est lui qui fera le reste-à-faire.
>
> | Marqueur | Sens |
> |---|---|
> | **🔒 socle** | existait avant le chantier — doit passer dès maintenant |
> | **🧪 à vérifier** | livré par le chantier du 14/09, **jamais éprouvé à la main** — c'est le cœur de cette recette |
> | **🔨 à livrer** | annoncé, pas encore construit — le test est là pour mémoire, il ne peut pas passer |
>
> Avant de commencer : lire **§0 ter**, qui liste ce qui ne peut pas être testé tant qu'une action
> extérieure (clé Apple, compte Google, arbitrage) n'a pas été faite.

---

## 0. Pré-requis

### 0.1 Environnement

- [ ] Backend lancé (JDK 17) : `JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=local"`
- [ ] Backend reconstruit **avec réseau** au moins une fois : le `pom.xml` a gagné `org.apache.poi:poi-ooxml:5.2.5` (export Excel), il doit se télécharger — `mvn -DskipTests package` → BUILD SUCCESS
- [ ] Les 5 migrations du chantier ont été jouées **sans erreur** au démarrage (`don_treasurer_assignment`, `don_category`, `don_declaration` + `don_declaration_line`, `push_devices.pref_rappels`) :
      ```sql
      SELECT * FROM don_treasurer_assignment;   -- la table existe, vide sur une base neuve
      SELECT count(*) FROM don_category;        -- 6 rubriques par ministère existant
      SELECT count(*) FROM don_declaration;     -- une déclaration par don historique
      SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_name='push_devices' AND column_name='pref_rappels';  -- boolean, NO, true
      ```
- [ ] ⚠️ La base de recette est **PostgreSQL**. La reprise d'historique (`13-don-declaration.sql`) n'est pas exercée par les tests automatisés (profil `test` = H2, Liquibase désactivé) : c'est ici qu'elle se valide.
- [ ] Back-office lancé : `cd shephr-webapp && npm run dev`
- [ ] Mobile lancé : `cd shephr-app/mobile && npx expo start`
- [ ] ⚠️ **Vérifier `mobile/app.json` › `extra.API_URL`** : il pointe la **production Railway** par
      défaut. Pour tester en local, le passer à `http://localhost:8080` — **et ne pas committer ce
      changement**.
- [ ] Pour la section 11.c (push) : **build de développement sur un téléphone réel**. Expo Go ne
      délivre plus le push distant sur Android depuis le SDK 53 ; simulateur et web sont inertes.

### 0.2 Assainissement de la base (indispensable)

- [ ] **Neutraliser l'abonnement de rétro-compatibilité.** La migration `01-subscriptions.sql:47-49`
      a donné `DONATIONS` au niveau `MINISTRY` à tout ministère existant : sans cela, tout le monde
      voit déjà le module et le test d'activation ciblée ne démontre rien.
      ```sql
      SELECT id, module_code, scope, scope_entity_id, active
        FROM sub_subscription WHERE module_code = 'DONATIONS';
      -- puis désactiver l'abonnement MINISTRY depuis le back-office (Abonnements › Suspendre)
      ```
- [ ] **Aucune assemblée « node-only »** (sinon couverture d'abonnement rompue et rattachement impossible) :
      ```sql
      SELECT n.id, n.name, p.name AS ville, n.active
        FROM org_node n
        LEFT JOIN org_unit u ON u.id = n.id
        LEFT JOIN org_node p ON p.id = n.parent_id
       WHERE n.type = 'ASSEMBLY' AND u.id IS NULL;      -- doit renvoyer 0 ligne
      ```
- [ ] **Anomalie symétrique** — assemblée legacy sans miroir `org_node` (le miroir `OrgNodeMirror`
      est best-effort : il journalise et avale ses erreurs). Elle casse le repli de couverture, la
      recherche d'assemblée du rattachement et les agrégats par nœud :
      ```sql
      SELECT u.id, u.name FROM org_unit u
        LEFT JOIN org_node n ON n.id = u.id
       WHERE u.active AND n.id IS NULL;                  -- doit renvoyer 0 ligne
      ```
- [ ] **Aucun compte actif sans rattachement Dons** — la colonne `reparable` dit si la réparation
      est possible (l'assemblée Goals doit exister dans `org_unit`, sinon la clé étrangère refuse) :
      ```sql
      SELECT u.id, u.username, u.full_name, u.goal_unit_id,
             (ou.id IS NOT NULL) AS reparable
        FROM t_user u
        LEFT JOIN org_unit ou ON ou.id = u.goal_unit_id
       WHERE u.active AND u.deletion_requested_at IS NULL
         AND u.goal_unit_id IS NOT NULL AND u.donation_unit_id IS NULL;   -- doit renvoyer 0 ligne
      ```
      Si la requête rend des lignes : jouer **à la main** `src/main/resources/db/changes/donation/10-repair-user-donation-unit.sql`
      (volontairement **hors** de `db.changelog-master.xml` : une réparation de données se lance en
      connaissance de cause, pas au démarrage).
- [ ] **À surveiller à part** — comptes sans aucun rattachement : le script ne peut rien pour eux
      (il n'y a rien à recopier), ils relèvent du parcours de rattachement.
      ```sql
      SELECT count(*) FROM t_user WHERE active AND goal_unit_id IS NULL AND donation_unit_id IS NULL;
      ```

### 0.3 Jeu de données

Structure minimale, créée **depuis le back-office** (c'est aussi le test du point 1) :

```
Nation « Testland »
└── Région « Nord »
    ├── Ville « Ville-A »
    │   ├── Assemblée A1   ← abonnée DONATIONS
    │   └── Assemblée A2
    └── Ville « Ville-B »
        └── Assemblée B1   ← NON abonnée
```

Comptes (tous rattachés à une assemblée — **aucune invitation**) :

| Compte | Assemblée | Rôle Goals | Fonction Dons |
|---|---|---|---|
| `membre-a1` | A1 | MEMBRE | — |
| `membre-a2` | A2 | MEMBRE | — |
| `membre-b1` | B1 | MEMBRE | — |
| `dirigeant-a1` | A1 | DIRIGEANT_UNITE | **aucune** (test du non-mélange) |
| `dirigeant-ville-A` | A1 | DIRIGEANT (Ville-A) | — |
| `dirigeant-b1` | B1 | DIRIGEANT_UNITE | — |
| `secretariat` | A1 | SECRETARIAT | — (c'est lui qui **nomme** les trésoriers) |
| `tresorier-a1` | A1 | MEMBRE | trésorier de **l'assemblée A1** |
| `tresorier-b1` | B1 | MEMBRE | trésorier de **l'assemblée B1** |
| `tresorier-ville` | A1 | MEMBRE | trésorier de **Ville-A** |
| `tresorier-region` | A1 | MEMBRE | trésorier de **Région Nord** |

> ⚠️ Un compte `SUPER_ADMIN` est trésorier « par nature » (il passe toutes les gardes) mais n'a
> **aucune affectation** : `GET /donations/reminders/scopes` lui rend une liste vide et le bloc
> « Relancer » ne s'affiche pas chez lui. Ne pas conduire la section 11.b avec le super-admin.

- [ ] Jeu de données créé

---

## 0 ter. Ce qui ne peut pas être testé sans action externe

Regroupe les réserves des lots qui **dépendent d'une action de Jean Philippe**. Tant qu'elles ne
sont pas levées, les tests correspondants sont **sans objet** — ne pas les compter comme échecs.

### A. Actions hors code (push) — bloquent toute la section 11.c

| # | Action | Ce qu'elle débloque |
|---|---|---|
| 0t.1 | **Clé APNs** pour le bundle iOS `org.cmfi.shephr` | bannières push sur iPhone |
| 0t.2 | **Compte de service Firebase** + `google-services.json` pour le package Android `com.cmfi.shephr` | bannières push sur Android |
| 0t.3 | Une fois `google-services.json` en place : renseigner `app.json` › `android.googleServicesFile` (laissé vide **volontairement** : pointer un fichier absent fait échouer `expo prebuild` et les builds EAS) | `expo prebuild` / build EAS |
| 0t.4 | Produire un **build de développement** (`expo-dev-client`) et l'installer sur un téléphone réel | tout le push |

> Ce sont des identifiants applicatifs **distincts** de CMFIPraise : les démarches de
> `cmfipraise-app/docs/push-notifications-plan.md` §2 sont à refaire intégralement.
> Sans elles : `getExpoPushTokenAsync` échoue, l'échec est rattrapé, l'app démarre normalement et
> **la modale in-app reste le chemin qui fait foi** (test 10.9).

### B. Arbitrages à rendre avant (ou pendant) la recette

| # | Point | Tranché par défaut | Conséquence si JP décide autrement |
|---|---|---|---|
| 0t.5 | Nom de la feuille détail du `.xlsx` : **« Déclarations »** (cadrage T9) ou **« Dons »** (§6.2 d'origine) | « Déclarations » | une constante, `SHEET_DETAIL` dans `DonationExportExcelWriter` — sinon le test 6.2 tombe à tort |
| 0t.6 | Tri de la file « À vérifier » : **du plus ancien au plus récent** | ancienneté croissante | une ligne dans `leader/verify.tsx` |
| 0t.7 | Geste **« Dévalider »** (VERIFIE → DECLARE) offert au trésorier | livré, sous confirmation | prévu par J-1 comme rattrapage, mais non nommé dans le cadrage du lot |
| 0t.8 | `LEADER` / `SECRETARIAT` peuvent-ils lancer un **rappel groupé Goals ministère-large** ? (Q3, jamais tranchée) | **non** — 403 sur tout périmètre géographique, ils gardent « Mes disciples » | une ligne : `GoalBulkReminderServiceImpl.hasGeographicAuthority` ; l'écran suit tout seul |
| 0t.9 | Le calendrier de saisie démarre la semaine le **lundi**, y compris en anglais | lundi | grille unique assumée |
| 0t.10 | La **note** est portée par la ligne de rubrique, pas par le versement | par ligne | le modèle J-1 n'a pas de note au niveau de la déclaration |
| 0t.11 | Le script de réparation pose aussi `donation_role = 'MEMBRE'` là où il est NULL (neutre en droits) | livré | retirer le 2ᵉ ordre du script si JP préfère ne toucher que `donation_unit_id` |

### C. Non livré — les tests correspondants ne peuvent pas passer

| # | Ce qui manque | Test concerné |
|---|---|---|
| 0t.12 | **Bouton d'export dans l'écran Trésorerie du mobile** : `buildExportUrl` existe mais n'est branché nulle part | toute la section 6 se déroule **par appel direct de l'API** (curl / Postman) avec le token d'un trésorier |
| 0t.13 | **La modale in-app n'a aucun bouton d'action** : `NotificationGate` ne sait pas ouvrir un écran. Seul le **tap sur une bannière push** conduit à l'écran concerné | test 11.4 |
| 0t.14 | Tuile **« Membres actifs »** de l'écran Trésorerie : aucun endpoint de comptage, elle affiche « — » | aucun — c'est un affichage volontairement vide |
| 0t.15 | La carte **« Devises »** de Réglages › back-office reste un **mock** (bouton Enregistrer qui ne fait qu'un toast) | ne pas la démontrer |
| 0t.16 | Le back-office propose toujours un **sélecteur de superviseur sur des comptes non-dirigeants** (`Utilisateurs.tsx`, `ResponsablesDrawer.tsx`) : il passe par `/api/church/admin/users`, hors de la garde J-5 | la garde J-5 (12.0b, 12.14) ne vaut que pour l'API `/me/discipleship` |
| 0t.17 | `shephr-app/web` lit encore `data.unassignedUnits` (hors périmètre, non modifié) : sa section « dirigeant requis » devient simplement **vide**, sans erreur | aucun — noté pour mémoire |

---
## 1. Point 1 — Le périmètre se crée au back-office 🔒 socle

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 1.1 | Back-office › Structure : créer Nation → Région → Ville → Assemblée | L'arbre se crée, les 4 niveaux apparaissent | ☐ | |
| 1.2 | Vérifier en base que l'assemblée existe dans `org_unit` **et** `org_node` | 1 ligne dans chaque, même `id` | ☐ | |
| 1.3 | Back-office › Abonnements : l'arbre org s'affiche avec « Activer ici » sur chaque nœud | Bouton présent aux 4 niveaux | ☐ | |
| 1.4 | Activer `DONATIONS` sur **Assemblée A1** | L'abonnement apparaît, badge « actif » sur A1 | ☐ | |

---

## 2. Point 2 — Inscription = rattachement à une assemblée 🔒 socle · 🧪 réparation

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 2.1 | Mobile : créer un compte (`/signup`) sans rattachement | Le compte est créé mais **enchaîne sur l'écran de rattachement** — aucun accès au reste | ☐ | |
| 2.2 | Demander le rattachement à A1, faire approuver par `dirigeant-a1` | Compte rattaché ; en base `goal_unit_id` **et** `donation_unit_id` = A1 | ☐ | |
| 2.3 | Variante : rejoindre A1 avec le **code d'adhésion** | Mêmes deux champs posés | ☐ | |
| 2.4 | Le nouveau compte déclare un don | ✅ succès (pas de `USER_NO_UNIT`) | ☐ | |
| 2.5 | Vérifier qu'aucun parcours d'invitation n'est proposé sur mobile | Aucun écran d'invitation | ☐ | |
| 2.6 | 🧪 Fabriquer l'anomalie : `UPDATE t_user SET donation_unit_id = NULL WHERE username = 'membre-a1';` puis jouer à la main `db/changes/donation/10-repair-user-donation-unit.sql` | Le premier ordre rapporte `UPDATE 1` et `membre-a1` retrouve `donation_unit_id = goal_unit_id` | ☐ | |
| 2.7 | 🧪 Rejouer le même script une seconde fois, sans rien modifier entre les deux | `UPDATE 0` sur les deux ordres — le script est rejouable sans effet | ☐ | |
| 2.8 | 🧪 Compter `t_user_donation_units` pour le compte réparé, avant puis après le script | Compte identique avant et après : le script ne touche jamais au périmètre géré | ☐ | |
| 2.9 | 🧪 `UPDATE t_user SET active = FALSE, donation_unit_id = NULL WHERE username = 'membre-a2';` puis rejouer le script | `membre-a2` garde `donation_unit_id` à NULL — un compte inactif n'est jamais réparé | ☐ | |
| 2.10 | 🧪 Redémarrer le backend, puis `SELECT filename FROM databasechangelog WHERE filename LIKE '%10-repair-user-donation-unit%';` | **0 ligne** — le script n'est pas enregistré au changelog, il n'est jamais joué automatiquement | ☐ | |
| 2.11 | 🧪 Avec le compte réparé au test 2.6, déclarer un don depuis le mobile | La déclaration réussit — plus de 422 `USER_NO_UNIT` | ☐ | |

---

## 3. Point 3 — Activation sur un nœud → toute la sous-branche 🔒 socle · 🧪 assemblées « node-only »

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 3.1 | Abonnement actif sur **A1** · se connecter avec `membre-a1` | L'onglet Dons est visible | ☐ | |
| 3.2 | Se connecter avec `membre-b1` (assemblée B1, non abonnée) | **Aucun** onglet Dons ; l'appel `/api/church/donations` renvoie 403 `MODULE_ACCESS_DENIED` | ☐ | |
| 3.3 | Back-office : suspendre l'abonnement de A1 · relancer l'app avec `membre-a1` | L'onglet Dons **disparaît** | ☐ | |
| 3.4 | Réactiver, puis déplacer l'abonnement au niveau **Ville-A** | `membre-a1` **et** `membre-a2` voient l'onglet ; `membre-b1` non | ☐ | |
| 3.5 | Déplacer l'abonnement au niveau **Région Nord** | Les trois membres (A1, A2, B1) voient l'onglet | ☐ | |
| 3.6 | Créer une **nouvelle assemblée A3** dans Ville-A (abonnement au niveau Ville) · y rattacher un membre | Le nouveau membre voit l'onglet **sans action supplémentaire** | ☐ | |
| 3.7 | Après chaque changement d'abonnement, noter le délai de prise d'effet | L'onglet change **au relancement / à la reconnexion**, pas à chaud — comportement connu et accepté | ☐ | |
| 3.8 | 🧪 Fabriquer une assemblée « node-only » : `POST /api/org/admin/nodes` avec `{type:'ASSEMBLY', parentId:<Ville-A>, name:'A-orpheline'}` (cet endpoint n'écrit **pas** `org_unit`), puis relancer la requête de contrôle du §0.2 | Elle renvoie exactement 1 ligne, « A-orpheline » — l'anomalie est détectée avant toute démonstration | ☐ | |
| 3.9 | 🧪 Relever le `joinCode` de « A-orpheline » et tenter de la rejoindre depuis le mobile | Le rattachement échoue (clé étrangère `t_user.donation_unit_id → org_unit`) : une assemblée node-only n'est pas exploitable, elle doit être recréée depuis le back-office | ☐ | |
| 3.10 | 🧪 `DELETE FROM org_node WHERE name = 'A-orpheline';` et relancer la requête de contrôle | 0 ligne — la base est revenue à l'état assaini | ☐ | |
| 3.11 | 🧪 Non-régression du repli : abonnement posé au niveau **Ville-A** seul, se reconnecter avec `membre-a1` (assemblée A1 normale) et appeler `GET /api/me/accessible-modules` | `DONATIONS` est présent — la remontée assemblée → ville fonctionne exactement comme avant | ☐ | |

---

## 4. Point 4 — Le trésorier 🧪 à vérifier

> Décision J-1/§0.4 : le trésorier est une **affectation à un nœud**, jamais un rang. Le rang
> pastoral ne confère plus **rien** dans le module Dons.

### 4.a — Nommer un trésorier (back-office)

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 4.1 | Back-office › Utilisateurs, connecté avec `secretariat` ou un SUPER_ADMIN : colonne d'actions d'une ligne | Un bouton **« Trésorier »** apparaît après « Engagements » | ☐ | |
| 4.2 | Se reconnecter avec un compte qui n'est ni SUPER_ADMIN ni SECRETARIAT · rouvrir Utilisateurs | Le bouton « Trésorier » n'apparaît sur **aucune** ligne | ☐ | |
| 4.3 | Ouvrir « Trésorier » sur `tresorier-a1` (jamais nommé) | « Cette personne n'est trésorière d'aucun nœud » | ☐ | |
| 4.4 | Déplier l'arbre proposé dans la modale | Les 4 niveaux (Nation, Région, Ville, Assemblée) portent une case à cocher ; la racine « Ministère » n'en a aucune | ☐ | |
| 4.5 | Cocher Assemblée A1 puis « Nommer trésorier » | Toast « Trésorier nommé » et la ligne « Assemblée de maison · A1 » apparaît dans « Affectations en cours » | ☐ | |
| 4.6 | Rouvrir la modale sur `tresorier-a1` et regarder A1 dans l'arbre | A1 est cochée, grisée, badge « Déjà trésorier ici » — impossible de la nommer deux fois | ☐ | |
| 4.7 | Sur `tresorier-ville`, cocher **Ville-A et Ville-B** en une seule fois, puis « Nommer trésorier » | Un seul toast, et **deux** lignes apparaissent dans « Affectations en cours » | ☐ | |
| 4.8 | Cliquer « Retirer » sur l'affectation Ville-B | Toast « Affectation retirée » et la ligne disparaît immédiatement, sans rechargement de page (F5) | ☐ | |
| 4.9 | Ouvrir « Trésorier » sur un compte du ministère X alors que le bandeau est sur « Tous les ministères » | L'arbre affiché est celui du **ministère X uniquement** | ☐ | |
| 4.10 | Ouvrir « Trésorier » sur un compte sans ministère (administrateur plateforme) | Message « Ce compte n'est rattaché à aucun ministère… » à la place de l'arbre, aucune case à cocher | ☐ | |

### 4.b — Le contrat d'API

| # | Appel | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 4.11 | `POST /api/church/admin/treasurers` `{"userId":"<tresorier-a1>","nodeId":"<A1>"}`, token `secretariat` | 201, corps avec `nodeType: "ASSEMBLY"`, `active: true`, `userFullName` et `nodeName` renseignés | ☐ | |
| 4.12 | Rejouer **exactement** le même POST, puis `GET ?userId=<tresorier-a1>` | 201 à nouveau, mais la liste ne contient qu'**une** affectation (nomination idempotente) | ☐ | |
| 4.13 | Même POST avec le token de `membre-a1` | **403** — nommer un trésorier est réservé au secrétariat | ☐ | |
| 4.14 | Nommer, sur un nœud du ministère de test, une personne d'un **autre ministère** | **422** `TREASURER_MINISTRY_MISMATCH` | ☐ | |
| 4.15 | `GET ?nodeId=<Ville-A>` après avoir nommé `tresorier-a1` sur A1 **et** `tresorier-ville` sur Ville-A | Une seule ligne, celle de `tresorier-ville` — le GET liste les **nominations** d'un nœud, pas ceux qui le couvrent depuis plus haut | ☐ | |
| 4.16 | `DELETE /api/church/admin/treasurers/{id}` puis `GET ?userId=<la personne>&includeInactive=true` | 204 ; l'affectation réapparaît avec `active: false` — le retrait **conserve la trace** | ☐ | |
| 4.17 | `GET /api/church/auth/me` avec le token de `tresorier-ville` | `treasurer: true` et `treasurerNodeIds` = **l'id de Ville-A uniquement** (le périmètre effectif en assemblées n'est pas exposé) | ☐ | |
| 4.18 | `GET /api/church/auth/me` avec le token de `dirigeant-a1` | `treasurer: false`, `treasurerNodeIds` vide — le rang pastoral n'ouvre rien | ☐ | |

### 4.c — Le périmètre et les droits

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 4.19 | `membre-a1` déclare 100 · `membre-a2` déclare 50 · `tresorier-a1` ouvre Trésorerie | Il voit **le don de A1 uniquement** (100) ; celui de A2 n'apparaît pas | ☐ | |
| 4.20 | `tresorier-ville` (Ville-A) ouvre Trésorerie | Il voit **A1 et A2** (150) | ☐ | |
| 4.21 | `tresorier-region` (Région Nord) ouvre Trésorerie | Il voit **A1, A2 et B1** | ☐ | |
| 4.22 | Créer une assemblée **A3** dans Ville-A · un membre y déclare | `tresorier-ville` la voit **automatiquement**, sans nouvelle affectation | ☐ | |
| 4.23 | `tresorier-a1` déclare son propre don | Il apparaît dans « Mes déclarations » **et** dans sa vue Trésorerie | ☐ | |
| 4.24 | `tresorier-a1` tente de **modifier** le don de `membre-a1` | **Refusé**. Le trésorier lit, il n'édite pas | ☐ | |
| 4.25 | `PATCH /api/church/donations/{id}` sur le don de `membre-a1`, token `secretariat`, puis token d'un compte `LEADER` | **403 dans les deux cas** — LEADER, SECRETARIAT et DIRIGEANT_COORDINATEUR ne réécrivent plus la déclaration d'un tiers ; seul un SUPER_ADMIN le peut | ☐ | |
| 4.26 | `GET /api/church/leader/units` avec le token de `dirigeant-a1` (dirigeant **non** trésorier) | **403** — la vue de trésorerie ne dérive plus du rang | ☐ | |
| 4.27 | Retirer l'affectation de `tresorier-a1`, puis **sans se reconnecter**, avec le jeton déjà en main : `GET /api/church/donations` puis `GET /api/church/leader/units` | La liste retombe à ses seuls dons personnels et `/leader/units` renvoie 403 — **tout de suite**, avec le même jeton (aucun claim JWT en jeu) | ☐ | |
| 4.28 | `membre-a1` appelle directement `/api/church/donations/stats/by-unit` | **403** | ☐ | |

### 4.d — L'onglet mobile

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 4.29 | `tresorier-a1` se connecte et regarde la barre d'onglets, en français puis en anglais | L'onglet s'appelle **« Trésorerie »** / « Treasury », icône de portefeuille — plus aucun onglet « Périmètre » | ☐ | |
| 4.30 | `dirigeant-a1` (dirigeant Goals non trésorier) ouvre l'accueil et défile jusqu'en bas | **Aucune** carte-raccourci « Trésorerie » | ☐ | |
| 4.31 | `dirigeant-a1` ouvre directement `/(tabs)/leader` puis `/(tabs)/leader/verify` (deep links) | Les deux écrans affichent « Cet espace est réservé aux trésoriers. Vous n'avez aucune affectation active. » — jamais des compteurs à zéro ni une liste vide | ☐ | |
| 4.32 | `tresorier-a1` ouvre Trésorerie (accueil) | Une carte **« À vérifier »** porte le nombre de déclarations en attente sur **tout** son périmètre, et ouvre la file | ☐ | |
| 4.33 | Sur l'écran Trésorerie, regarder la carte « Mes dons » en haut | Elle ne porte **aucun montant**, seulement le renvoi vers l'onglet « Mes dons » (l'ancienne carte affichait en réalité le total du périmètre) | ☐ | |
| 4.34 | Un membre de A1 déclare 100 GBP **le mois dernier**, personne ne déclare ce mois-ci · `tresorier-a1` ouvre Trésorerie | « Reçu ce mois » indique « Aucun don ce mois-ci. » et non 100 £ | ☐ | |
| 4.35 | `tresorier-ville` ouvre Trésorerie, on **arrête le backend** puis on tire pour rafraîchir | Bandeau orangé « Certaines données de trésorerie n'ont pas pu être chargées. » + « Réessayer » ; les anciens chiffres ne sont pas remplacés par des 0 | ☐ | |
| 4.36 | Retirer l'affectation de `tresorier-a1` pendant que l'app est ouverte, puis **relancer l'app** | L'onglet « Trésorerie » **et** le raccourci de l'accueil disparaissent ensemble, sans nouveau login | ☐ | |

---
## 5. Point 5 — Rubriques configurées au back-office 🧪 à vérifier

> Décision D0-5 : **une liste par ministère**, valable dans toutes ses assemblées.

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 5.1 | Back-office › Réglages › « Devises et catégories », **sans avoir choisi de ministère** dans le bandeau | « Choisissez un ministère pour voir sa liste de rubriques » et aucune liste — le back-office est cross-tenant, il ne devine pas | ☐ | |
| 5.2 | Choisir le ministère de test : la liste affichée vient **du serveur** | Les 6 rubriques du ministère, pas un mock ; elles survivent à un F5 | ☐ | |
| 5.3 | Ajouter « Action de grâce » en renseignant aussi « Libellé anglais » = « Thanksgiving » | La ligne créée affiche le libellé suivi du code technique `action_de_grace` en gris — le code est **dérivé** du libellé français, jamais saisi | ☐ | |
| 5.4 | Ajouter une **seconde** rubrique nommée exactement « Action de grâce » | Créée avec le code `action_de_grace_2` — aucune erreur d'unicité, aucun doublon de code | ☐ | |
| 5.5 | Crayon sur une rubrique existante : remplacer le libellé par « Action de grâces », enregistrer | Le libellé change, **le code reste** `action_de_grace` — un libellé se corrige, un code jamais | ☐ | |
| 5.6 | Mobile : ouvrir « Déclarer un don » | La nouvelle rubrique apparaît dans la grille | ☐ | |
| 5.7 | Déclarer un don sur « Action de grâce » | Enregistré, rubrique correcte au détail | ☐ | |
| 5.8 | Rouvrir l'écran des rubriques au back-office après cette déclaration | Le bouton corbeille de cette ligne a disparu, remplacé par la mention **« Utilisée »** ; la bascule actif/inactif reste disponible | ☐ | |
| 5.9 | Sur une rubrique **historique** (dons antérieurs à la migration, sans `category_id` avant reprise), tenter la suppression | Refusé « Rubrique utilisée » — l'ancienneté d'un don ne le rend pas invisible à la protection | ☐ | |
| 5.10 | Mobile : laisser « Déclarer un don » ouvert, **désactiver** au back-office la rubrique sélectionnée, revenir sur l'écran mobile (aller-retour d'onglet) | La rubrique disparaît de la grille **et** la sélection bascule d'elle-même sur la première restante — jamais d'envoi sur une rubrique retirée | ☐ | |
| 5.11 | Le don déjà déclaré sur cette rubrique désactivée | Reste visible avec son libellé dans la ventilation — **pas de trou dans l'historique** | ☐ | |
| 5.12 | Ouvrir « Modifier » sur ce même don | La correction du montant seul est possible, sans être forcé de changer de rubrique | ☐ | |
| 5.13 | Mobile : mode avion, puis rouvrir « Déclarer un don » | Les rubriques s'affichent quand même (cache local) — l'écran n'est jamais vide faute de réseau | ☐ | |
| 5.14 | Se déconnecter, se reconnecter avec un compte d'un **autre ministère**, ouvrir « Déclarer un don » | Seules les rubriques du nouveau ministère s'affichent, **dès le premier affichage** — aucun résidu du ministère précédent | ☐ | |
| 5.15 | Sur un don déclaré **avant** le chantier : `SELECT category, category_id FROM don_donation WHERE id = '<id>';` | `category` inchangée, `category_id` renseigné avec la rubrique du même code dans le ministère du don | ☐ | |
| 5.16 | Créer un **nouveau ministère** (onboarding back-office), y rattacher un compte, ouvrir ses rubriques | Les 6 rubriques d'origine (Dîme…Autre) sont déjà présentes — un ministère créé après la migration ne démarre jamais avec une liste vide | ☐ | |
| 5.17 | `POST` puis `PATCH /api/church/donations/categories/{id}` (`{"active":false}`) avec le token de `membre-a1` | **403** dans les deux cas — créer comme modifier une rubrique est un acte de gouvernance | ☐ | |
| 5.18 | `GET /api/church/donations/categories?ministryId=<ministère de test>` avec le token d'un compte d'un **autre** ministère | **403** — forcer le paramètre ne donne pas accès à la liste d'un autre ministère | ☐ | |
| 5.19 | Basculer l'app en anglais | Les rubriques s'affichent en anglais (`name_en`) | ☐ | |

---

## 6. Point 6 — Exports Excel et PDF 🧪 à vérifier

> ⚠️ **Il n'y a pas de bouton d'export dans le mobile** (0t.12). Toute cette section se déroule par
> appel direct de l'API, avec le token d'un trésorier :
> `GET /api/church/donations/export?format=csv|xlsx|pdf[&status=…][&from=…&to=…]`

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 6.1 | Export `format=xlsx` avec le token de `tresorier-ville` | Fichier `.xlsx` téléchargé, **ouvert sans avertissement** par Excel | ☐ | |
| 6.2 | Noms des onglets du classeur | Deux feuilles exactement : **« Déclarations »** et **« Synthèse »** (nommage T9 — cf. arbitrage 0t.5) | ☐ | |
| 6.3 | Dans « Déclarations », sélectionner la colonne **Montant** et lire la somme en bas de fenêtre Excel | Excel affiche une somme — les montants sont des **nombres**, pas du texte | ☐ | |
| 6.4 | Les accents (« Dîme », « Bâtiment ») dans le `.xlsx` | Corrects | ☐ | |
| 6.5 | Dans « Synthèse », faire défiler jusqu'aux blocs de totaux | **Cinq** blocs : par rubrique, par assemblée, par mois, **par statut**, et total général — chacun avec **une ligne par devise** | ☐ | |
| 6.6 | Déclarer 100 GBP et 50 EUR dans le périmètre, puis exporter en Excel **et** en PDF | GBP et EUR sur deux lignes de total distinctes dans les deux fichiers ; aucune ligne ne montre 150 | ☐ | |
| 6.7 | Export `format=pdf` : lire les trois lignes d'en-tête puis le bas de chaque page | Nom du ministère, « Périmètre : » suivi des **nœuds d'affectation** du compte (p. ex. « Ville-A »), « Période : » ; pied de page « Export des dons — généré le … UTC — page N » | ☐ | |
| 6.8 | Export `format=csv` : comparer l'en-tête à celui d'avant le chantier | `Date,Localite,Unite,Type,Membre,Categorie,Montant,Devise` **inchangé**, suivi de `,Statut,ValidePar,DateValidation,AutoValidee` ; la ligne `TOTAL` par devise est toujours là, complétée à 12 champs | ☐ | |
| 6.9 | Dans les trois formats, lire la colonne **Rubrique / Categorie** d'un don déclaré sur la dîme | « **Dîme** » — le libellé du référentiel, pas le code `dime` | ☐ | |
| 6.10 | Désactiver une rubrique au back-office, puis réexporter une période contenant un don sur cette rubrique | Le don reste présent, rubrique lisible — aucun trou, aucune cellule vide | ☐ | |
| 6.11 | `format=docx` | **400** — aucun fichier renvoyé | ☐ | |
| 6.12 | Exporter avec `?status=VERIFIE`, puis **sans** le paramètre, sur la même période | Le premier ne contient que des lignes `VERIFIE` ; le second contient aussi les `DECLARE`, et le bloc « Totaux par statut » donne les deux | ☐ | |
| 6.13 | `tresorier-a1` auto-valide sa propre déclaration, puis exporte : repérer sa ligne | `Statut = VERIFIE`, `ValidePar` = son nom, `DateValidation` renseignée (UTC), **`AutoValidee = Oui`** | ☐ | |
| 6.14 | Sur le même export, repérer une déclaration encore `DECLARE` | `Statut = DECLARE` et les trois colonnes ValidePar / DateValidation / AutoValidee **vides** — jamais « Non » | ☐ | |
| 6.15 | `tresorier-a1` valide la déclaration de `membre-a1`, puis exporte | `AutoValidee = Non` sur cette ligne (validateur ≠ donateur) | ☐ | |
| 6.16 | Périmètre de l'export de `tresorier-a1`, alors que des dons existent en A1 **et** en A2 | **Uniquement A1** — un export ne dépasse jamais le périmètre du trésorier | ☐ | |
| 6.17 | `membre-a1` appelle `/api/church/donations/export` (les trois formats) | **403** | ☐ | |
| 6.18 | Export sur une période **sans aucun don**, dans les trois formats | Fichier valide et vide (pas d'erreur, pas de fichier corrompu) | ☐ | |

---

## 7. Non-régression Goals — « Mes objectifs » ne disparaît jamais 🧪 à vérifier

**Le point le plus important de cette recette.** Le but quinquennal est central : activer les Dons ne
doit rien lui retirer.

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 7.1 | `membre-a1`, **module Dons désactivé** : ouvrir l'accueil | La tuile **« Mes objectifs »** est présente | ☐ | |
| 7.2 | Activer les Dons sur A1 · relancer l'app · ouvrir l'accueil et défiler de haut en bas | La tuile « Mes objectifs » est **toujours** présente, **au-dessus** de la carte des montants | ☐ | |
| 7.3 | Les deux tuiles cohabitent | « Mes objectifs » **et** « Déclarer un don » visibles ensemble, sans que l'une chasse l'autre | ☐ | |
| 7.4 | Ouvrir l'onglet Objectifs, saisir un engagement | Fonctionne à l'identique, module Dons activé ou non | ☐ | |
| 7.5 | `dirigeant-a1` (DIRIGEANT_UNITE Goals, module Dons **activé**) ouvre l'accueil | La tuile « Mes objectifs » est présente — elle ne dépend plus que des droits Goals, jamais de l'abonnement Dons | ☐ | |
| 7.6 | `dirigeant-a1` : vues Goals de son périmètre | Inchangées | ☐ | |
| 7.7 | Désactiver les Dons · relancer | Retour à l'état initial, aucun résidu | ☐ | |

---

## 8. Affichage des montants et déclaration 🧪 à vérifier

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 8.1 | `membre-a1` déclare **100 GBP**, puis ouvre l'accueil | Le bloc « Ce mois-ci » affiche **100 £** (l'endpoint de totaux est désormais ouvert au membre, scopé sur ses propres dons) | ☐ | |
| 8.2 | Il déclare aussi **50 EUR** · accueil | **Deux lignes distinctes**, « £100.00 » puis « €50.00 », chacune avec sa propre variation vs mois dernier — aucune ligne ne cumule deux devises | ☐ | |
| 8.3 | Compte n'ayant déclaré aucun don ce mois-ci (module activé) : accueil | « Aucun don déclaré ce mois-ci. » — ni « £0 », ni barre de progression, ni ligne « objectif » | ☐ | |
| 8.4 | Couper le backend et ouvrir l'accueil avec `membre-a1` | « Vos totaux n'ont pas pu être chargés. » — et **non** « Aucun don déclaré ce mois-ci » | ☐ | |
| 8.5 | L'accueil affiche-t-il un objectif annuel de 3 000 £ ? | **Non** — la valeur en dur et sa barre de progression ont disparu | ☐ | |
| 8.6 | Onglet « Déclarations », période « Tout », dons en GBP et EUR sur deux mois : lire la carte de total | Un total **par devise** (£100 et €50), jamais additionnés ni étiquetés d'une seule devise | ☐ | |
| 8.7 | Mêmes données : lire les **en-têtes de mois** | Chaque en-tête affiche ses sous-totaux séparés par « · » (ex. « £100.00 · €50.00 »), jamais une somme unique étiquetée GBP | ☐ | |
| 8.8 | Écran « Déclarer » : appuyer sur la ligne de date, revenir au mois précédent avec la flèche gauche, choisir le 3, valider | La ligne de date affiche « 3 <mois précédent> <année> » (badge « Aujourd'hui » disparu) et le don enregistré porte bien cette date | ☐ | |
| 8.9 | Dans le sélecteur, se placer sur le mois courant, appuyer sur un jour **postérieur** à aujourd'hui, puis sur la flèche droite | Les jours futurs sont grisés et ne réagissent pas ; la flèche droite est inactive au mois courant — impossible d'atteindre un mois futur | ☐ | |
| 8.10 | Ouverture de l'écran « Déclarer » | Le montant est **vide** (plus de « 40 » pré-rempli) ; le clavier ne s'ouvre pas tout seul | ☐ | |
| 8.11 | Déclarer 50 EUR et lire l'écran de confirmation (le reçu) | « 50 EUR », en-tête « Reçu » seul : aucune référence « CMCI-xxxx », aucune mention « CMCI UK », aucun « GBP » en dur | ☐ | |
| 8.12 | Montant `0` ou négatif | Refusé, message clair | ☐ | |
| 8.13 | Modifier la déclaration d'un autre membre | Refusé | ☐ | |
| 8.14 | `tresorier-a1` ouvre Trésorerie après un don de 100 GBP et un de 50 EUR dans son périmètre | « Reçu ce mois » affiche **deux lignes**, 100 £ et 50 €, jamais additionnées | ☐ | |
| 8.15 | `tresorier-a1` ouvre Trésorerie › Statistiques avec des dons en deux devises | Une rangée de pastilles de devise (« £ GBP », « € EUR ») apparaît ; graphique et répartition par rubrique ne montrent que la devise sélectionnée, étiquettes au bon symbole | ☐ | |
| 8.16 | `tresorier-a1` ouvre le détail de l'assemblée A1 après un don **en EUR uniquement** | Total, moyenne par membre et ligne du membre s'affichent en € — l'assemblée n'apparaît plus vide | ☐ | |
| 8.17 | Parcourir l'écran « Déclarer » puis le détail d'une déclaration | Aucun champ ni ligne « Moyen », « Espèces · enveloppe » ou « Référence » — le module est 100 % déclaratif (D0-10) | ☐ | |

---
## 8 bis. Déclaration multi-rubriques et validation 🧪 à vérifier

> Décision J-1 : la personne déclare, le trésorier **vérifie et valide**. Deux statuts seulement —
> `DÉCLARÉ` → `VÉRIFIÉ`. Pas d'« écart », pas de « rejeté ».

### 8 bis.a — L'acte de déclarer (mobile)

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 8b.1 | « Déclarer un don » : saisir 200 sur la première ligne, « Ajouter une rubrique », choisir Mission, saisir 100 | Le total affiché en haut passe de £200 à £300 **au fil de la frappe**, sans validation ni recalcul manuel | ☐ | |
| 8b.2 | Appuyer sur la croix de la ligne Mission, puis regarder la ligne restante | La ligne disparaît, le total revient à £200, et **aucune croix** n'est proposée sur la dernière ligne | ☐ | |
| 8b.3 | Chercher un sélecteur de devise **par ligne** | Il n'y en a pas : un seul sélecteur GBP/EUR/USD, au niveau de la déclaration, avec la mention « Une seule devise par déclaration » | ☐ | |
| 8b.4 | Appuyer sur la rubrique d'une ligne (pastille + libellé) | Une liste des rubriques du ministère s'ouvre, et le choix ne s'applique **qu'à cette ligne** | ☐ | |
| 8b.5 | Confirmer la déclaration du 3 août : 200 dîme + 100 mission · lire l'écran de confirmation | Reçu : total £300, date du 3 août, les deux rubriques avec leur montant — **une seule** déclaration, pas deux | ☐ | |
| 8b.6 | Onglet « Déclarations » : lire la ligne de cette déclaration | Pastille **« Déclaré »**, libellé des deux rubriques, total £300 — et non deux lignes distinctes | ☐ | |
| 8b.7 | Parcourir la barre de filtres de « Mes déclarations » | **Trois** puces exactement : Toutes, Déclaré, Vérifié — aucune « écart », aucune « rejeté » | ☐ | |
| 8b.8 | Ouvrir le détail de la déclaration encore « Déclaré » | Ventilation (rubrique, montant, note) puis total déclaré ; boutons **Modifier** et **Supprimer** présents, avec la phrase « … tant que le trésorier ne l'a pas vérifiée » | ☐ | |
| 8b.9 | Modifier : retirer Mission, porter la dîme à 250, **changer la date**, enregistrer | Le détail affiche une seule rubrique à £250, la nouvelle date, et le total suit — la date n'est plus verrouillée | ☐ | |
| 8b.10 | Faire vérifier la déclaration par `tresorier-a1`, puis rouvrir son détail côté `membre-a1` | Pastille « Vérifié », bloc « Vérifiée par » (nom + date), et **Modifier/Supprimer absents** au profit d'un bandeau verrouillé qui explique pourquoi | ☐ | |
| 8b.11 | Tenter d'atteindre l'écran de correction de cette déclaration vérifiée (lien direct, retour arrière) | Aucun formulaire : un bandeau verrouillé et un bouton Retour — l'échec est montré **avant** la saisie, pas après l'appel | ☐ | |
| 8b.12 | `tresorier-a1` déclare puis valide sa propre déclaration, et en ouvre le détail | La mention **« Auto-validée »** apparaît sous le nom du validateur | ☐ | |
| 8b.13 | Lire la note de bas de page de « Déclarer » et le bandeau du détail | **Aucune mention d'un délai de 24 h** nulle part — la règle affichée est « tant que le trésorier ne l'a pas vérifiée » | ☐ | |
| 8b.14 | Accueil › « Dons récents » : toucher un don issu d'une déclaration à deux rubriques | Le détail de la **déclaration complète** s'ouvre, avec ses deux rubriques — pas une ligne isolée | ☐ | |

### 8 bis.b — Le trésorier vérifie (mobile)

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 8b.15 | Trois membres déclarent à des dates différentes (3 août, 10 août, 2 septembre) · `tresorier-ville` ouvre « À vérifier » | Les trois apparaissent **de la plus ancienne à la plus récente** (3 août en tête) | ☐ | |
| 8b.16 | Regarder une ligne de la file **sans l'ouvrir** | Déclarant, date, assemblée, total et ventilation (une pastille par rubrique avec son montant) sont lisibles directement | ☐ | |
| 8b.17 | Ouvrir une déclaration depuis la file et parcourir l'écran de haut en bas | **Un seul** bouton d'action, « Valider ». Aucun champ « montant constaté », aucun motif d'écart, aucun bouton de rejet | ☐ | |
| 8b.18 | Appuyer « Valider » puis **annuler** la confirmation, revenir à la file | La déclaration est toujours là, au statut Déclaré — ne pas valider ne déclenche rien | ☐ | |
| 8b.19 | Valider pour de bon, puis revenir à la file (filtre « À vérifier ») | Elle a disparu **sans action de rafraîchissement**, et le compteur de la carte d'accueil a baissé d'une unité | ☐ | |
| 8b.20 | Basculer le filtre sur « Vérifiées » et rouvrir la déclaration validée | « Validée par <nom> le <date> » et un bouton **« Dévalider »** (cf. arbitrage 0t.7) | ☐ | |
| 8b.21 | Appuyer « Dévalider », confirmer, revenir au filtre « À vérifier » | Elle est revenue dans la file au statut Déclaré, et le membre peut de nouveau la corriger | ☐ | |
| 8b.22 | Le montant ne correspond pas : le trésorier **ne valide pas** | La déclaration reste `DÉCLARÉ`, un encart rappelle que c'est la personne qui corrige | ☐ | |
| 8b.23 | `tresorier-ville` appuie sur le filtre « Mes dons » de la file | Seules ses propres déclarations restent ; « Tout mon périmètre » les rétablit toutes | ☐ | |
| 8b.24 | Trésorerie › Statistiques : relever les chiffres avec « Toutes », puis choisir « Vérifiées » | Les trois blocs (courbe mensuelle, par rubrique, **par assemblée**) changent ensemble et la légende passe à « Totaux officiels : seules les déclarations vérifiées sont comptées » | ☐ | |
| 8b.25 | Statistiques, filtre « Toutes » (défaut) : comparer aux chiffres relevés avant le chantier | **Chiffres identiques** — sans filtre de statut, les vues rendent exactement ce qu'elles rendaient avant | ☐ | |
| 8b.26 | Statistiques d'un `tresorier-ville` : lire le bloc « Par assemblée » | Une ligne par assemblée de son périmètre (A1, A2…), dans la devise sélectionnée, jamais toutes devises additionnées | ☐ | |
| 8b.27 | `membre-a2` tente de valider la déclaration de `membre-a1` (API) | **403** | ☐ | |
| 8b.28 | `tresorier-b1` (trésorier de B1, Ville-B) appelle `POST /api/church/declarations/{id}/verify` sur une déclaration de A1 | **403** — être trésorier ne suffit pas, le **périmètre** doit couvrir l'unité | ☐ | |

### 8 bis.c — Le contrat serveur et la reprise d'historique

| # | Appel / vérification | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 8b.29 | `POST /api/church/declarations` `{donationDate, currency:"GBP", declaredTotal:300, lines:[{category:"dime",amount:200},{category:"mission",amount:100}]}` puis `SELECT * FROM don_donation WHERE declaration_id = <id>` | 201, et **exactement deux** lignes comptables (200 et 100), toutes deux avec `declaration_id` et `category_id` rattachés au référentiel du ministère | ☐ | |
| 8b.30 | `PATCH` la même déclaration avec une seule ligne `{id:<ligne dîme>, category:"dime", amount:250}` et `declaredTotal:250` | 200 ; la ligne « mission » **et sa ligne comptable** disparaissent ; il ne reste qu'un `don_donation` à 250, portant le **même id** qu'avant (actualisée, pas recréée) | ☐ | |
| 8b.31 | `PATCH` avec `{"declaredTotal":400}` seul, sans toucher aux lignes | **422** `DECLARED_TOTAL_MISMATCH` — le contrôle porte sur l'état **final**, pas sur le corps envoyé | ☐ | |
| 8b.32 | Forcer deux devises dans une même déclaration (devise de ligne divergente) | **422** `DECLARATION_SINGLE_CURRENCY` | ☐ | |
| 8b.33 | `tresorier-a1` valide puis appelle `POST /{id}/unverify` | Statut revenu à `DECLARE`, `verifiedById` / `verifiedAt` vidés, `editable = true` | ☐ | |
| 8b.34 | `tresorier-a1` auto-valide, puis `SELECT action, summary FROM audit_logs WHERE action LIKE 'DONATION_DECLARATION_%'` | Une ligne `DONATION_DECLARATION_VERIFIED` dont le `summary` contient « **AUTO-VALIDÉE (validateur = donateur)** » ; la réponse d'API porte `selfVerified: true` | ☐ | |
| 8b.35 | `tresorier-a1` appelle `GET /api/church/declarations` puis `GET /api/church/declarations?mine=true` | Le premier rend toutes les déclarations de son périmètre, le second **uniquement les siennes** — sans avoir eu à connaître son `userId` | ☐ | |
| 8b.36 | `membre-a1` supprime sa déclaration encore `DECLARE` (`DELETE`), puis rouvre « Déclarations » | 204, et les lignes correspondantes ont disparu — aucun don orphelin | ☐ | |
| 8b.37 | Appeler l'**ancien** endpoint `POST /api/church/donations` (toujours en service), puis `GET /api/church/declarations?mine=true` | Le don apparaît comme une déclaration **mono-ligne** au statut `DECLARE` — il entre bien dans la file de vérification | ☐ | |
| 8b.38 | `PATCH /api/church/donations/{id}` sur un don déclaré il y a **trois jours**, non vérifié | **Autorisé** — la fenêtre de 24 h n'existe plus, elle est remplacée par « tant que c'est DECLARE » | ☐ | |
| 8b.39 | Le faire valider, puis retenter le même `PATCH` | **422** `DECLARATION_VERIFIED` | ☐ | |
| 8b.40 | `PATCH /api/church/donations/{id}` sur une ligne appartenant à une déclaration **multi-rubriques** | **422** `DECLARATION_MULTI_LINE`, message renvoyant vers `/api/church/declarations/{id}` — l'invariant total = somme des lignes n'est jamais cassé par l'ancien chemin | ☐ | |
| 8b.41 | `GET /donations/stats/summary` (puis `/donations`) sans `status`, puis avec `?status=VERIFIE` | Sans filtre : les totaux d'avant le chantier (tout ce qui a été déclaré). Avec : seuls les versements validés — les totaux « officiels » | ☐ | |
| 8b.42 | Sur la base **PostgreSQL** contenant déjà des dons, après le démarrage qui joue `13-don-declaration.sql` : `SELECT COUNT(*) FROM don_donation WHERE declaration_id IS NULL;` et `SELECT COUNT(*) FROM don_declaration WHERE status <> 'DECLARE';` | Les deux renvoient **0** : chaque don historique est rattaché à une déclaration mono-ligne, et aucune n'a été inventée « vérifiée » | ☐ | |
| 8b.43 | Après cette migration, ouvrir « Déclarations » avec un compte ayant des dons antérieurs | Ils sont **toujours visibles à l'identique**, et chacun apparaît comme une déclaration mono-ligne `DECLARE` | ☐ | |

---

## 9. Sécurité — le gating front ne remplace pas la garde serveur 🔒 socle

Chaque test se fait **en appelant l'API directement** (curl / Postman) avec le token du compte.

| # | Appel | Compte | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|---|
| 9.1 | `GET /api/church/donations` | `membre-b1` (non abonné) | 403 `MODULE_ACCESS_DENIED` | ☐ | |
| 9.2 | `POST /api/church/declarations` | `membre-b1` | 403 | ☐ | |
| 9.3 | `GET /api/church/donations` | `membre-a1` | 200, **ses dons uniquement** | ☐ | |
| 9.4 | `GET /api/church/donations?userId=<membre-a2>` | `membre-a1` | Aucun don d'autrui, même en forçant le filtre | ☐ | |
| 9.5 | `GET /api/church/donations/{id}` d'un don d'autrui | `membre-a1` | 403 | ☐ | |
| 9.6 | `GET /api/church/donations/stats/by-unit` | `dirigeant-a1` (non trésorier) | 403 | ☐ | |
| 9.7 | `GET /api/me/accessible-modules` | `membre-a1` / `membre-b1` | `DONATIONS` présent / absent | ☐ | |
| 9.8 | Token d'un compte dont l'abonnement vient d'être suspendu | — | 403 dès l'appel suivant (pas de cache d'autorisation) | ☐ | |

---

## 10. Non-régression générale 🔒 socle

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 10.1 | Espace ministère **web** | Tableau de bord / Dons / Exports **restent masqués** — aucun changement | ☐ | |
| 10.2 | Onglet **Suivi pastoral** (Member Care) | Inchangé | ☐ | |
| 10.3 | Structure, Membres, Hiérarchie, Demandes | Inchangés, hors les ajouts explicitement testés en §12 | ☐ | |
| 10.4 | Suppression de compte (RGPD) d'un membre ayant déclaré des dons | Fonctionne, pas de contrainte FK bloquante | ☐ | |
| 10.5 | Basculer l'app en **anglais** et parcourir : Déclarer (dont le calendrier), Déclarations et leur détail, Trésorerie / Statistiques / détail d'assemblée, file « À vérifier » et fiche de validation, Structure › Assemblées, « Mon superviseur », Relancer (Goals et Dons), Profil › Notifications | Aucune chaîne française résiduelle, aucune clé brute affichée (par ex. « treasury.verify ») | ☐ | |
| 10.6 | En anglais, regarder les **noms de mois** de l'accueil et des en-têtes de « Déclarations » | ⚠️ **Défaut connu, hors lot** : ils restent en **français** (`utils/format.monthLabel` porte des libellés en dur). Le calendrier de saisie, lui, est traduit | ☐ | |
| 10.7 | Lancer un export `.xlsx` puis `.pdf` et regarder les journaux du backend pendant le téléchargement | Le fichier arrive complet et **aucune** trace `AccessDeniedException` / « response is already committed » (l'export n'est plus streamé) | ☐ | |
| 10.8 | Lancer l'application **avant** que la clé APNs, le compte Firebase et `google-services.json` ne soient en place | L'app démarre normalement, l'accueil s'affiche, les modales in-app fonctionnent — aucun plantage, aucune alerte d'erreur | ☐ | |
| 10.9 | Lancer l'application sur le **web** (`npm run web`) ou sur simulateur, puis ouvrir Profil › Notifications | « Indisponible sur cet appareil », aucune boîte de permission demandée | ☐ | |
| 10.10 | `npx tsc --noEmit` + `npm run lint` dans `mobile/` | Propres (0 erreur ; seuls des avertissements `exhaustive-deps` / imports inutilisés déjà présents) | ☐ | |
| 10.11 | `mvn test` dans `cmfipraise-backend` (JDK 17) | **BUILD SUCCESS** — au 14/09 : `Tests run: 1374, Failures: 0, Errors: 0` | ☐ | |

---
## 11. Notifications 🧪 à vérifier

> Détail : `docs/notifications.md`. Trois blocs : le **résumé** au trésorier (in-app), la **relance**
> des non-déclarants, et le **push** (bannière hors application). Le push suppose les actions
> externes du §0 ter A : sans elles, 11.c est sans objet — mais 11.a et 11.b doivent passer.

### 11.a — Le résumé quotidien au(x) trésorier(s)

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 11.1 | Laisser 2 déclarations au statut `DECLARE` dans A1, puis déclencher le résumé (job à **7 h 10** heure de Paris, une fois par jour) | `tresorier-ville` reçoit **une seule** modale, titrée « Ville-A », dont le message commence par « 2 déclarations à vérifier » | ☐ | |
| 11.2 | 20 membres déclarent le même jour | **Toujours une seule** notification, pas 20 | ☐ | |
| 11.3 | Un don en GBP et un en EUR dans le même périmètre, puis déclencher le résumé | Le message affiche **deux montants séparés** (« … £, … € »), jamais une somme unique mêlant les devises | ☐ | |
| 11.4 | Nommer un 2ᵉ trésorier sur Ville-A, laisser une déclaration en attente, déclencher le résumé | **Deux** lignes `t_user_notification` de source `DONATION_DIGEST`, même `ref_entity_id` (Ville-A), deux `user_id` — chacun voit sa modale | ☐ | |
| 11.5 | Le trésorier valide tout, puis le résumé du lendemain passe | **Aucune** notification écrite : une file vide ne produit pas de modale « 0 déclaration » | ☐ | |
| 11.6 | Forcer un second passage du job dans la même journée | Aucune notification supplémentaire (fenêtre anti-spam de 20 h), et aucune erreur dans les journaux | ☐ | |
| 11.7 | Suspendre l'abonnement `DONATIONS` du ministère, laisser des déclarations en attente, déclencher le résumé | **Aucun** résumé écrit pour les trésoriers de ce ministère (RG-06) | ☐ | |
| 11.8 | `DONATIONS_DIGEST_ENABLED=false` puis redémarrer | Plus aucun résumé n'est écrit, **mais** le bouton « Relancer » continue de fonctionner — le coupe-circuit ne vise que l'automatisme | ☐ | |
| 11.9 | Ouvrir la modale du résumé et chercher un bouton d'action | 🔨 **à livrer** : il n'y en a pas — `NotificationGate` ne sait pas ouvrir un écran (0t.13). Seul le tap sur une **bannière push** conduit à la file (test 11.32) | ☐ | |

### 11.b — La relance des non-déclarants

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 11.10 | `tresorier-ville` ouvre l'onglet Trésorerie et défile jusqu'en bas | Le bloc **« Relancer »** est présent, avec « Ville-A — 2 assemblées » | ☐ | |
| 11.11 | `membre-a1` (non trésorier) ouvre l'onglet Dons et défile | Le bloc « Relancer » **ne s'affiche pas du tout** | ☐ | |
| 11.12 | `tresorier-ville` › « Relancer » sur Ville-A, après que `membre-a1` seul a déclaré ce mois-ci | Le retour affiche « n personnes relancées », « 0 déjà relancée », « 1 avait déjà déclaré » et la période « du 1ᵉʳ du mois au jour même » | ☐ | |
| 11.13 | Saisir un message personnalisé (« Rendez-vous dimanche. ») avant de relancer, puis ouvrir l'app avec un compte relancé | La modale affiche **exactement** ce texte, sans le message par défaut | ☐ | |
| 11.14 | Relancer une deuxième fois le même périmètre dans l'heure | Aucune erreur, « **0 personne relancée** », le même nombre en « déjà relancées », et aucune ligne `DONATION_REMINDER` supplémentaire en base | ☐ | |
| 11.15 | Relancer un périmètre où personne ne se trouve hors du trésorier lui-même | « 0 personne relancée » : le trésorier **ne se relance jamais lui-même**, même s'il n'a rien déclaré | ☐ | |
| 11.16 | Passer un compte relancé en anglais (`t_user.language = 'EN'`) **avant** l'envoi, puis relancer sans message personnalisé | Sa modale est en anglais, celle d'un compte resté en français est en français | ☐ | |
| 11.17 | `GET /api/church/donations/reminders/scopes` avec le token de `membre-a1` | **403** — la liste des périmètres relançables est réservée au trésorier | ☐ | |
| 11.18 | `POST /donations/reminders/bulk` avec `scopeId` = Région Nord, token de `tresorier-b1` (trésorier de B1) | **403** — un nœud n'est relançable que s'il est **entièrement** couvert par sa trésorerie | ☐ | |
| 11.19 | `POST /donations/reminders/bulk` avec le token de `membre-a1` | **403** — relancer est un acte de trésorier | ☐ | |

### 11.c — Le push Expo (suppose §0 ter A)

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 11.20 | Téléphone réel, build de développement, installation neuve : se connecter et entrer dans l'app | Une modale « Ne rien manquer » s'affiche **une fois entré dans l'app** — jamais sur l'écran de connexion, et jamais la boîte système en premier | ☐ | |
| 11.21 | Répondre « Plus tard », tuer l'app, la relancer, se reconnecter | L'invitation **ne revient jamais** — « Plus tard » vaut réponse, pas report | ☐ | |
| 11.22 | Réinstaller, répondre « Activer », accepter la boîte système, puis Profil › Notifications | Les **trois** interrupteurs — Rappels, Informations, Mises à jour — sont verts et manipulables, sans bandeau d'activation | ☐ | |
| 11.23 | Réinstaller, « Activer » puis **refuser** la boîte système, ouvrir Profil › Notifications | Les trois interrupteurs sont gris et désactivés, avec un bandeau « Activer les notifications » au-dessus | ☐ | |
| 11.24 | Android : Réglages du téléphone › shephr › Notifications | **Exactement trois** catégories : « Rappels », « Informations », « Mises à jour de l'application » — aucune « Nouvelles vidéos », rien dans « Autres » | ☐ | |
| 11.25 | Après activation : `SELECT user_id, target_app, pref_rappels, pref_infos, pref_maj FROM push_devices WHERE expo_token LIKE 'Exponent%';` | **Une seule** ligne pour ce téléphone : `target_app = 'Shephr'`, `user_id` = le compte connecté, `pref_rappels = true` | ☐ | |
| 11.26 | Se déconnecter depuis le Profil, relire la même requête | **0 ligne** — l'appareil est désenregistré, il ne reçoit plus les relances du compte parti | ☐ | |
| 11.27 | Se reconnecter avec un **autre** compte sur le même téléphone, relire la requête | Une ligne, nouveau `user_id`, même `expo_token` — pas de doublon | ☐ | |
| 11.28 | Simuler une version antérieure : `POST /api/push/devices` **sans** champ `prefRappels`, puis lire `pref_rappels` | 204, et `pref_rappels = true` — l'omission vaut abonné, elle ne désabonne pas en silence | ☐ | |
| 11.29 | Rejouer le même POST sur le même jeton avec `"prefRappels": false`, puis lire les quatre colonnes | `pref_rappels = false`, les trois autres restent `true` — couper les rappels ne coupe que les rappels | ☐ | |
| 11.30 | Back-office : ouvrir une notification `INFO` active et demander l'aperçu du push (nombre d'appareils ciblés), avec au moins deux appareils dont un sans compte | Le nombre est **le même qu'avant le chantier** : le nouveau critère « utilisateurs », non renseigné par le back-office, ne restreint rien | ☐ | |
| 11.31 | `tresorier-ville` relance les non-déclarants, téléphone d'un membre relancé **écran éteint, app fermée** : taper la bannière | L'app s'ouvre sur la modale de relance, puis sur l'onglet « Mes dons » — **une seule fois**, pas deux | ☐ | |
| 11.32 | Résumé quotidien reçu par `tresorier-a1`, **app fermée** : taper la bannière | L'app s'ouvre sur la modale du résumé, puis sur la **file « À vérifier »** | ☐ | |
| 11.33 | App seulement en **arrière-plan** (pas tuée) : recevoir une relance et taper la bannière | La modale apparaît sans relancer l'app — la file des non-lues est rechargée à ce moment-là | ☐ | |
| 11.34 | Après avoir tapé une bannière, tuer l'app et la relancer deux fois | La notification déjà ouverte **ne se rouvre pas** à chaque démarrage | ☐ | |
| 11.35 | `UPDATE push_devices SET pref_rappels = false` sur son propre appareil, se faire relancer, rouvrir l'app | **Aucune bannière**, mais la modale de relance est bien là à l'ouverture — l'interrupteur coupe la sonnerie, pas le message | ☐ | |
| 11.36 | Refuser **définitivement** les notifications (iOS : « Ne pas autoriser » deux fois), se faire relancer, rouvrir l'app | Aucune bannière, la modale est là, et Profil › Notifications propose « Ouvrir les réglages du téléphone » | ☐ | |
| 11.37 | Accorder la permission depuis les réglages du téléphone, revenir dans l'app (écran Notifications déjà ouvert) | Les interrupteurs s'allument et deviennent manipulables **sans quitter l'écran** | ☐ | |

---

## 12. Goals — hiérarchie et rappels 🧪 à vérifier

> Détail : `docs/goals-hierarchie-et-rappels.md`. **Section critique** : elle vérifie que la
> hiérarchie est une chaîne de **dirigeants** (J-5) et que l'écran n'affiche plus que celle-ci (J-4).

**Jeu de données additionnel** : `dirigeant-ville-A` (DIRIGEANT de Ville-A) ·
`dirigeant-b1` (DIRIGEANT_UNITE de l'assemblée B1, **Ville-B**) · `membre-b1` (simple fidèle de B1,
porteur d'un `supervisor_id` historique pointant vers `dirigeant-ville-A`).

| # | Étape | Résultat attendu | ✅ | Constat |
|---|---|---|---|---|
| 12.0 | `membre-b1` (simple fidèle) ouvre Hiérarchie | **Aucun** raccourci « Mon superviseur » | ☐ | |
| 12.0b | `membre-b1` appelle directement `PUT /api/church/leaders/me/supervisor` (API) | **403** — la garde existe désormais côté serveur, pas seulement dans l'écran | ☐ | |
| 12.1 | `dirigeant-b1` déclare `dirigeant-ville-A` comme superviseur | Déclaration acceptée — c'est un dirigeant, c'est le cas prévu (J-5) | ☐ | |
| 12.1b | `dirigeant-ville-A` ouvre Hiérarchie | `dirigeant-b1` apparaît comme **nœud enfant**, avec l'assemblée B1 et ses membres — **c'est voulu** | ☐ | |
| 12.1c | Un `supervisor_id` posé historiquement sur un simple fidèle d'une autre ville | N'ouvre **plus rien** : son assemblée n'entre pas dans le périmètre du superviseur | ☐ | |
| 12.2 | `dirigeant-ville-A` ouvre **Hiérarchie** | L'écran montre **uniquement sa chaîne de dirigeants**. Aucune assemblée de Ville-A n'y apparaît au titre du leadership géographique *(J-4)*, et `membre-b1` n'y figure pas — il n'est pas dirigeant *(J-5)* | ☐ | |
| 12.3 | Il ouvre **Structure** | Ses assemblées géographiques sont là, avec le label « dirigeant requis » sur celles sans responsable *(fonction déménagée depuis Hiérarchie — ne doit pas être perdue)* | ☐ | |
| 12.4 | Reprendre 12.1c : `dirigeant-ville-A` consulte les engagements nominatifs de l'assemblée de ce fidèle | **403** — un lien posé sur un simple fidèle ne porte aucun périmètre (J-5) | ☐ | |
| 12.5 | Agrégats « Mon périmètre » de `dirigeant-ville-A` | Ville-A + les assemblées de ses **dirigeants** subordonnés. Aucune assemblée entrée par un lien posé sur un simple fidèle | ☐ | |
| 12.6 | Module Dons activé · `dirigeant-ville-A` est trésorier de Ville-A | Il ne voit **aucun** don de B1 | ☐ | |
| 12.7 | **Vue « chaîne » d'un simple fidèle** : `membre-a1` ouvre Hiérarchie alors que son `supervisor_id` pointe vers un dirigeant d'une **autre** ville | La chaîne affichée est : dirigeant de son assemblée A1 → ses supérieurs → lui. Le dirigeant de l'autre ville n'y figure pas | ☐ | |
| 12.8 | **Rappel groupé** : `dirigeant-a1` › Relancer › « Mon assemblée » | Seuls les non-soumis de A1 sont relancés | ☐ | |
| 12.9 | `dirigeant-ville-A` › Relancer › « Ma ville », puis comparer à la liste des membres de A1 + A2 | Exactement les non-soumis de A1 et A2 — aucune personne entrée par un lien de supervision posé sur un simple fidèle (J-5) | ☐ | |
| 12.10 | Relancer › « **Mes disciples** » | Uniquement les personnes qui l'ont déclaré — **option distincte**, jamais fusionnée avec la géographie | ☐ | |
| 12.11 | Une personne ayant **déjà soumis** | N'est jamais relancée | ☐ | |
| 12.12 | Relancer deux fois de suite | Anti-spam 24 h par personne ; les autres passent | ☐ | |
| 12.13 | Le rappel unitaire existant (`POST /goals/member/{id}/reminders`) | Fonctionne toujours — pas de régression | ☐ | |
| 12.14 | `membre-b1` appelle `GET /api/church/leaders/me/supervisor/candidates?q=dir` | **403** — la recherche de superviseur est fermée aux non-dirigeants, comme la déclaration | ☐ | |
| 12.15 | `dirigeant-b1` appelle `PUT /api/church/leaders/me/supervisor` en désignant `membre-a1` (simple fidèle) | **422** `SUPERVISOR_NOT_A_LEADER` — seul un dirigeant peut être **désigné** | ☐ | |
| 12.16 | `dirigeant-ville-A` › « Mon superviseur » › Chercher, avec un fragment de nom commun à un dirigeant et à un simple fidèle | **Seul le dirigeant** apparaît dans la liste des candidats | ☐ | |
| 12.17 | `dirigeant-ville-A` ouvre Hiérarchie › onglet « Assemblées » | **Aucune** assemblée « dirigeant requis » n'y figure — l'écran ne liste que les assemblées des dirigeants de sa chaîne | ☐ | |
| 12.18 | Créer une assemblée **A4** dans Ville-A sans dirigeant, puis `dirigeant-ville-A` ouvre **Structure › Assemblées** | A4 porte la pastille « **Dirigeant requis** », et un rappel **compté** s'affiche en tête de l'onglet | ☐ | |
| 12.19 | Affecter un dirigeant à A4, puis tirer pour rafraîchir Structure | La pastille « Dirigeant requis » disparaît de A4 | ☐ | |
| 12.20 | `membre-b1` (simple fidèle porteur d'un `supervisor_id` historique) ouvre Structure › Assemblées | **Aucune** pastille « Dirigeant requis » — un simple fidèle n'a aucun périmètre à surveiller | ☐ | |
| 12.21 | `dirigeant-ville-A` appelle `GET /api/church/leaders/units/unassigned` | 200 avec les seules assemblées de **son** périmètre sans dirigeant ; celles des autres villes n'y sont pas | ☐ | |
| 12.22 | Un fidèle rattaché à une assemblée **sans dirigeant** ouvre Hiérarchie | La chaîne se réduit à lui seul — aucun maillon inventé, aucune erreur | ☐ | |
| 12.23 | `dirigeant-a1` ouvre « Mes objectifs » | Une carte **« Relancer »** est présente, au-dessus de ses objectifs personnels | ☐ | |
| 12.24 | Il ouvre « Relancer » sans rien sélectionner | Deux sections distinctes — « Mon périmètre » et « Mon accompagnement » — et **aucun bouton d'envoi** tant qu'aucune option n'est choisie | ☐ | |
| 12.25 | Il sélectionne « Assemblée A1 » (3 membres, 1 ayant déjà soumis) | L'aperçu annonce « 2 personnes seront relancées, sur 3 dans ce périmètre » **avant** tout envoi | ☐ | |
| 12.26 | Il envoie **sans** saisir de message | Les destinataires reçoivent le message par défaut, contenant la date limite au format jj/mm/aaaa | ☐ | |
| 12.27 | Il relance le même périmètre avec le message « Plus que 3 jours » | Les personnes non encore relancées reçoivent **exactement** ce texte, sans préfixe ni reformulation | ☐ | |
| 12.28 | Écran de compte rendu après un envoi | Trois compteurs distincts (rappels envoyés / déjà relancées / ont déjà soumis) **plus** la liste nominative des destinataires | ☐ | |
| 12.29 | Il sélectionne une assemblée dont **tous** les membres ont soumis | « Personne à relancer ici : tout le monde a soumis » et le bouton d'envoi est désactivé | ☐ | |
| 12.30 | `dirigeant-a1` figure lui-même dans A1 et n'a pas soumis ; il relance « Mon assemblée » | Il **ne se relance pas lui-même** : aucune notification, et il n'est compté dans aucun des trois compteurs | ☐ | |
| 12.31 | `dirigeant-a1` relance un membre depuis sa **fiche** (rappel unitaire), puis relance « Mon assemblée » dans l'heure | Ce membre est compté en « déjà relancée » et ne reçoit pas un second rappel — les deux chemins partagent la même fenêtre de 24 h | ☐ | |
| 12.32 | Un compte `SECRETARIAT` (ou `LEADER`) ouvre « Relancer » | **Aucune** option géographique : seule « Mes disciples » apparaît *(arbitrage 0t.8)* | ☐ | |
| 12.33 | Ce compte appelle `POST /goals/reminders/bulk` `{"scope":"CITY","scopeId":"<Ville-A>"}` | **403** — la relance de masse ministère-large n'est pas autorisée *(arbitrage 0t.8)* | ☐ | |
| 12.34 | Ce même compte envoie `{"scope":"DISCIPLES"}` | **Accepté** : les personnes qui l'ont déclaré superviseur et n'ont pas soumis sont relancées | ☐ | |
| 12.35 | `dirigeant-a1` appelle `{"scope":"ASSEMBLY","scopeId":"<Assemblée B1>"}` (hors périmètre) | **403**, et aucune notification créée en base | ☐ | |
| 12.36 | Un dirigeant rattaché à **deux** villes appelle `{"scope":"CITY"}` **sans** `scopeId` | **422** `SCOPE_ID_REQUIRED` — le serveur ne choisit pas la ville à sa place | ☐ | |
| 12.37 | `dirigeant-ville-A` relance « Mes disciples » juste après « Ma ville » | Les deux envois restent distincts : aucune option ne cumule géographie et discipulat, et un disciple hors de sa ville n'apparaît que dans le second | ☐ | |
| 12.38 | Un fidèle relancé rouvre l'app | Il voit la modale de rappel in-app, titrée « Rappel — <nom du But> » | ☐ | |

---

## 13. Verdict

- [ ] **Tous les tests 🔒 socle passent** → le mécanisme d'abonnement est démontrable
- [ ] **Section 7 intégralement verte** → le but quinquennal n'a subi aucune régression
- [ ] **Section 4 verte** → le trésorier est une affectation, pas un rang, et le rang pastoral n'ouvre plus rien
- [ ] **Section 5 verte** → les rubriques sont paramétrées au back-office et le mobile les lit
- [ ] **Section 8 verte** → les montants affichés sont vrais (par devise) et la déclaration correspond à l'acte réel
- [ ] **Section 8 bis verte** → la déclaration est multi-rubriques et le trésorier valide, en deux statuts
- [ ] **Section 6 verte** → un trésorier repart avec un `.xlsx` et un `.pdf` exploitables
- [ ] **Sections 11.a et 11.b vertes** → le trésorier est informé et peut relancer, **sans** dépendre du push
- [ ] **Section 11.c verte** → le push fonctionne de bout en bout *(suppose §0 ter A levé)*
- [ ] **Sections 12.2, 12.3 et 12.17 à 12.21 vertes** → la Hiérarchie n'affiche plus que le discipulat, et « dirigeant requis » a bien déménagé vers Structure (J-4)
- [ ] **Sections 12.0b, 12.4, 12.14 et 12.15 vertes** → seul un dirigeant pose un lien de supervision, et lui seul porte un périmètre (J-5)

**Bon pour présentation client** : ☐ oui ☐ non

Réserves :

| # | Réserve | Bloquante ? |
|---|---|---|
| | | |
