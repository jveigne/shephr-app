# Module Dons — reste à faire après l'implémentation du 14/09

**Date** : 14/09/2026 · **Contexte** : les 15 lots du chantier Dons sont livrés et compilent
(mobile `tsc` + `lint` propres, back-office `tsc` propre, backend 1 374 tests verts).
Ce document liste ce qui n'a **pas** été fait, et pourquoi.

> Les points 1 et 2 changent ce qu'on peut **montrer**. Le point 3 est une question de **droits**.
> Les points 4 et 5 sont cosmétiques mais visibles à l'écran.

---

## 1. Le trésorier ne peut pas exporter depuis l'application ⛔ bloque la démo

**Constat** — le backend fait bien `csv`, `xlsx` et `pdf`, et le mobile sait construire l'URL :
`mobile/services/statsApi.ts:115` expose `buildExportUrl(...)`. Mais **elle n'est appelée nulle
part** : il n'existe aucun bouton d'export dans l'écran Trésorerie.

**Pourquoi ce n'est pas fait** — le lot T9 (exports) ne possédait que
`backend/donation/export/**` et `pom.xml`. L'écran appartenait au lot T8, qui ne savait pas que
l'export arrivait. Cloisonnement des fichiers pour éviter les collisions : la conséquence est ce
trou entre les deux.

**À faire** — un bouton « Exporter » dans `mobile/app/(tabs)/leader/index.tsx` (ou dans la
sous-vue statistiques), avec le choix du format et de la période, appelant `buildExportUrl` puis
`Linking.openURL` / partage de fichier. Clés i18n fr + en.

**En attendant** — l'export se démontre depuis Postman ou curl. Acceptable pour valider un point
technique, **pas devant un client**.

---

## 2. La modale in-app du résumé trésorier n'ouvre aucun écran

**Constat** — le résumé quotidien (« 12 déclarations à vérifier ») s'affiche bien à l'ouverture de
l'app via `mobile/components/NotificationGate.tsx`, mais le bouton ne fait que marquer la
notification comme lue. **Seul le tap sur une bannière push** fait le deep link vers la file
« À vérifier ».

**Conséquence** — sans push (voir §6), le trésorier voit qu'il a du travail et doit naviguer
lui-même jusqu'à l'onglet Trésorerie.

**À faire** — dans `NotificationGate`, router selon la `source` de la `UserNotification` :
`DONATION_DIGEST` → file « À vérifier », `GOAL_REMINDER` → écran des engagements,
`DONATION_REMINDER` → écran « Déclarer ». La donnée est déjà dans la réponse serveur, il n'y a
qu'à l'exploiter côté client.

---

## 3. `canManageUser` lit encore le sous-arbre complet 🔐 question de droits

**Constat** — la décision **J-5** a fermé la **lecture** : `getVisibleUnitIds` et `canSeeUser` ne
retiennent plus que les managers dans le sous-arbre de personnes. Mais
`AccessControlServiceImpl.canManageUser:532` (et son test `subtreeUserIds(actor)` ligne 552)
utilise toujours le sous-arbre **complet**.

**Ce que ça laisse ouvert** — un dirigeant peut encore **administrer** (éditer, promouvoir) un
simple fidèle qui porte un `supervisor_id` historique vers lui, y compris hors de sa ville.
Il ne voit plus ses données, mais il peut agir sur son compte.

**Pourquoi ce n'est pas fait** — le lot G2 ne nommait que `getVisibleUnitIds` et `canSeeUser`.
Étendre le filtre à l'administration des comptes est une décision, pas une correction mécanique :
c'est une deuxième porte, et elle mérite d'être tranchée sciemment.

**Second chemin, à traiter en même temps** — le back-office propose toujours un **sélecteur de
superviseur sur des comptes non-dirigeants** (`shephr-webapp/src/pages/Utilisateurs.tsx` et
`src/components/ResponsablesDrawer.tsx`). Il passe par `/api/church/admin/users`, donc **il
contourne la garde J-5** posée sur `declareSupervisor`. Tant qu'il est là, on peut continuer de
créer les liens que J-5 interdit.

**À décider** : applique-t-on J-5 à l'administration des comptes, oui ou non ?
Si oui, deux gestes courts : le filtre manager dans `canManageUser`, et le sélecteur du
back-office restreint aux dirigeants.

---

## 4. Noms de mois en français en dur

`mobile/utils/format.ts:27` — `monthLabel(monthIndex, long)` renvoie des libellés **français quelle
que soit la langue de l'app**. Visible sur l'accueil (en-tête de date) et dans les titres de mois de
« Mes dons ».

Le lot T1 a introduit `common.monthsLong` en i18n pour le nouveau sélecteur de date, mais n'a pas pu
toucher `utils/format.ts` (hors de ses fichiers). Il faut basculer `monthLabel` sur les clés i18n et
vérifier tous ses appelants.

---

## 5. Détails d'affichage

- **Tuile « Membres actifs »** de l'écran Trésorerie : affiche « — ». La donnée n'est pas câblée.
- **Carte « Devises »** dans Réglages du back-office (`shephr-webapp/src/pages/Settings.tsx`) : elle
  tourne encore sur le **mock**. Seules les *catégories* de cet écran ont été branchées sur l'API par
  le lot T5. **Ne pas la démontrer.**

---

## 6. Hors code — action Jean Philippe ✅ **fait le 16/09/2026**

Les identifiants applicatifs Shephr sont en place :

- ✅ **clé APNs** — `JX3AB67N9W` (équipe `Q9QK5S76RP`), **réutilisée** de CMFIPraise plutôt que
  dupliquée : une clé vaut pour toutes les apps d'une équipe et Apple en limite le nombre à deux.
- ✅ **compte de service Firebase** + `google-services.json` — projet `shephr-5072d`, FCM V1 actif,
  clé téléversée sur EAS et assignée au package `com.cmfi.shephr`.
- ✅ `android.googleServicesFile` renseigné dans `mobile/app.json`.
- ⬜ **build de développement** sur un téléphone réel — le seul point restant.

> **Deux correctifs faits au passage le 16/09 :**
>
> 1. `mobile/app.json` › `extra.API_URL` était commité sur `http://localhost:8080` (commit
>    `574cd10`, qui avait écrasé l'URL Railway). **Tout build produit depuis `HEAD` aurait pointé
>    localhost.** Remis sur `https://cmfipraise-prod-production.up.railway.app`.
> 2. Le `.gitignore` ne protégeait **ni** `google-services.json`, **ni** `*.p8`, **ni**
>    `*.keystore` — à la racine comme dans `mobile/`. Corrigé avant de déposer le moindre fichier.
>    La clé de compte de service vit dans `~/.config/shephr/`, hors du dépôt.

⚠️ **Et un manque de fond, découvert en auditant les chemins d'envoi** : le lot N4c
(« brancher les notifications sur le push ») était annoncé fait, mais `RelaiPushNotification`
n'était **appelé nulle part**. Sans ce raccordement, les clés ci-dessus n'auraient fait sonner que
les notifications parties du back-office. Corrigé — détail dans `docs/notifications.md` §4.

---

## Ordre suggéré

| # | Point | Effort | Effet |
|---|---|---|---|
| 1 | Bouton d'export | court | débloque la démo de l'export |
| 2 | Deep link de la modale | court | rend le résumé actionnable sans push |
| 4 | Noms de mois i18n | court | nécessaire si démo en anglais |
| 5 | Tuile « Membres actifs » | court | cosmétique |
| 3 | `canManageUser` + sélecteur back-office | **décision d'abord** | ferme la deuxième porte de J-5 |
| 6 | Clés Apple / Google | hors code | à lancer tôt, le délai n'est pas maîtrisé |

Voir aussi `dons-journal-implementation.md` (compte rendu par lot et réserves complètes) et
`donations-recette.md` §0 ter (ce qui ne peut pas être testé sans action externe, et les cinq
arbitrages en attente).
