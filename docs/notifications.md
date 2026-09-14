# Notifications Shephr — état des lieux et plan

**Date** : 14/09/2026 · **Cadrage** : JP 14/09/2026 · **Mise à jour** : 14/09/2026 (après les lots N1 · N2 · N3 · N4a · N4b · N4c)
**Référence externe** : `cmfipraise-app/docs/notifications.md`, `…/push-notifications-plan.md`,
`…/push-notifications-mise-en-service.md` (l'implémentation de référence, en production)

**Besoins exprimés** :
1. Le **trésorier est informé** quand quelqu'un déclare un don — *si possible par groupe*.
2. Le **trésorier relance** les personnes pour qu'elles déclarent dîmes et offrandes.
3. Dans **Goals**, un dirigeant relance les personnes de son périmètre pour les engagements
   (traité dans `goals-hierarchie-et-rappels.md` §2-3).

---

## 1. Ce qui existe déjà — et c'est beaucoup

Le backend est **partagé** entre CMFIPraise et Shephr. Tout ce qui a été construit pour CMFIPraise
est donc physiquement disponible ici.

### 1.1 Trois mécanismes distincts

| Mécanisme | Table | Ciblage | Utilisé par Shephr ? |
|---|---|---|---|
| **Campagnes in-app** (`AppNotification`) — INFO / PROMO / APP_UPDATE | `t_app_notification` | application, pays, ministère, version | ✅ oui, via `NotificationGate` |
| **Notifications personnelles** (`UserNotification`) | `t_user_notification` | **un destinataire par ligne**, `readAt` = lu/non-lu | ✅ oui, via `NotificationGate` |
| **Push Expo** (iOS + Android) | `push_devices` | application, pays, ministère, version, **liste d'utilisateurs** (N4a) + **4** catégories | ⚠️ **oui depuis N4b** — mais aucune bannière ne part sans les identifiants Apple/Google |

### 1.2 `UserNotification` — la brique directement réutilisable

```java
userId · title · message · source · refEntityId · createdById · createdAt · readAt
```

Trois `source` existent déjà : `GOAL_REMINDER`, `JOIN_REQUEST`, `LEADERSHIP_VACANCY`.
Le couple `source` + `refEntityId` sert de **journal anti-spam** — c'est exactement ce qui borne le
rappel Goals à un envoi par personne et par 24 h
(`GoalReminderServiceImpl:86`, `existsByRefEntityIdAndSourceAndCreatedAtAfter`).

Côté mobile, `components/NotificationGate.tsx` est **déjà monté au-dessus des onglets** : il empile
les non-lues, en affiche une à la fois, « OK » marque lu, « Plus tard » les fait revenir à la
prochaine session. **Ajouter une notification Shephr ne demande aucun travail d'UI** : il suffit
d'écrire une ligne `UserNotification` côté serveur.

### 1.3 Le push Expo — construit, mais pas branché sur Shephr

> **État au 14/09 au soir** : les deux manques décrits ci-dessous ont été comblés (lots **N4a** et
> **N4b**). Le constat est conservé parce qu'il explique la forme de la solution. Ce qui reste
> bloquant n'est plus du code : ce sont les démarches Apple et Google (§4, « Actions hors code »).

L'infrastructure est complète et en production côté CMFIPraise : `push/` fait **2 300 lignes**
(client Expo par lots, relève des accusés de réception, purge des jetons morts, envoi manuel depuis
le back-office, verrou anti-doublon). `TargetApp.Shephr` **existe déjà dans l'énumération**.

Deux manques, tous les deux réels :

- **`shephr-app/mobile` n'a aucune dépendance push.** Pas d'`expo-notifications`, pas
  d'enregistrement d'appareil, pas de canaux Android, pas d'écran de réglages. Tout est à faire
  (le plan de `cmfipraise-app` §7-10 donne le mode d'emploi exact).
- **`DiffusionPush` ne sait pas cibler une liste de personnes.** Ses critères sont
  `application / pays / ministères / versionMinimale` — de la diffusion de masse. Or ici on veut
  viser *les trois trésoriers de cette ville*. Le dépôt sait déjà faire
  `findAllByUserId(UUID)` : il manque le critère `utilisateurs` dans `DiffusionPush` et la clause
  correspondante dans le sélecteur `PushSendServiceImpl.cibles`.

---

## 2. Ce qu'il faut construire

### 2.1 Deux niveaux, à ne pas confondre

| Niveau | Ce que la personne voit | Coût |
|---|---|---|
| **N1 — in-app** | Une modale **à la prochaine ouverture de l'app** | **faible** : une ligne `UserNotification`, l'UI existe |
| **N2 — push** | Une bannière **immédiate, app fermée** | **élevé** : mobile complet + ciblage par utilisateur |

**Décision J-3 (14/09) : les deux, maintenant.** Le push entre dans le lot. À construire dans cet
ordre malgré tout — l'in-app d'abord, le push ensuite : le push **transporte** une notification qui
existe déjà en base, il ne la remplace pas. Une relance doit rester lisible à l'ouverture de l'app
par quelqu'un qui a refusé les notifications système, ou dont le jeton est mort.

### 2.2 N1-a — Le trésorier est informé d'une déclaration

**Le piège à éviter** : une notification par déclaration. Une assemblée de 60 personnes un dimanche
de dîmes, c'est 60 modales. Le trésorier coupe les notifications, et on a perdu.

**Le regroupement proposé** (« par groupe » au sens : par lot, pas une par don) :

- un **résumé quotidien**, généré par un job, par trésorier et par périmètre :
  *« 12 déclarations à vérifier — 2 340 £ depuis hier »* ;
- `source = DONATION_DIGEST`, `refEntityId` = le nœud du trésorier → l'anti-spam existant garantit
  **un résumé par jour et par trésorier**, sans écrire une ligne de plus ;
- la modale ouvre directement l'onglet Trésorerie.

**Décision J-2 (14/09)** : **un résumé des dons, adressé à TOUS les trésoriers du nœud.** Les deux
lectures de « par groupe » sont donc retenues ensemble — les dons sont regroupés dans un résumé, et
ce résumé part à l'ensemble des trésoriers affectés au nœud, pas à un seul.

Le résumé porte sur les déclarations **en attente de validation** (`status = DECLARE`) — c'est ce
qui en fait une file de travail et non une simple information.

### 2.3 N1-b — Le trésorier relance les personnes

`POST /api/church/donations/reminders/bulk`

```jsonc
{ "scope": "NODE", "scopeId": "<un nœud de mon périmètre>", "message": "…" }
```

Symétrique du rappel groupé Goals (`goals-hierarchie-et-rappels.md` §3.1), et **volontairement
construit sur le même modèle** — mêmes règles, mêmes retours, un seul comportement à expliquer :

- destinataires = personnes du périmètre du trésorier **n'ayant rien déclaré** sur la période ;
- anti-spam 24 h par personne (`source = DONATION_REMINDER`), les déjà-relancés sont **sautés** ;
- réponse : `{ envoyés, déjàRelancés, déjàDéclarés }` ;
- garde : `TreasuryAccessService.isTreasurer` + le nœud demandé doit être dans son périmètre.

### 2.4 N2 — Le push (décision J-3 : dans le lot)

1. **Mobile** : `expo-notifications`, enregistrement de l'appareil au login
   (`POST /api/push/devices` existe), 3 canaux Android, écran de réglages par catégorie,
   deep link au tap. Le plan de `cmfipraise-app` §7-10 est directement transposable.
2. **Backend** : ajouter `List<UUID> utilisateurs` à `DiffusionPush` + la clause dans
   `PushSendServiceImpl.cibles`. C'est **le seul vrai manque** côté serveur.
3. **Catégories** : les trois existantes (`VIDEOS / INFOS / MAJ`) ne conviennent pas à Shephr.
   ⚠️ Le commentaire de `CategoriePush` est explicite : *« Trois et pas plus […] un push d'une
   catégorie sans interrupteur ne serait plus coupable — c'est exactement ce qui fait
   désinstaller. »* Ajouter `RAPPELS` suppose donc **une colonne `pref_rappels` et un interrupteur
   dans l'écran de réglages**, pas seulement une valeur d'énumération.

---

## 3. Synthèse — état réel au 14/09 au soir

> « Fait » = **écrit, compilé, testé automatiquement** ; pas **éprouvé à la main**. La recette
> manuelle est la section 11 de `docs/donations-recette.md`.

| # | Besoin | État | Reste |
|---|---|---|---|
| 1 | Notification personnelle in-app (modèle + API + UI mobile) | ✅ **complet** (préexistant) | — |
| 2 | Anti-spam par source et par entité | ✅ **complet** | une sonde **par destinataire** a dû être ajoutée : la sonde existante ne regarde pas le destinataire, et le résumé écrit pour le premier trésorier aurait fait passer les autres pour déjà servis |
| 3 | Trésorier informé d'une déclaration (résumé groupé) | ✅ **fait** (N1/T10) : job quotidien 7 h 10 Paris, verrou consultatif PostgreSQL, coupe-circuit `donations.digest.enabled`, `source = DONATION_DIGEST`, un résumé **par nœud** adressé à **tous** ses trésoriers, montants **par devise** | la modale **n'ouvre aucun écran** (voir ci-dessous) |
| 4 | Trésorier relance les non-déclarants | ✅ **fait** (N2/T11) : `POST /api/church/donations/reminders/bulk` + `GET .../reminders/scopes`, anti-spam 24 h par personne, retour `{envoyes, dejaRelances, dejaDeclares, scopeName, from, to, envoyesA}` · déclencheur mobile `components/RelanceNonDeclarants.tsx`, **branché dans l'écran Trésorerie au lot de consolidation** | période figée au mois courant, non exposée à l'écran |
| 5 | Dirigeant Goals relance son périmètre (groupé) | ✅ **fait** (N3/G3) : `POST /api/church/goals/reminders/bulk` + écran `goals/remind.tsx` | Q3 (`LEADER`/`SECRETARIAT`) tranchée **par le refus**, à confirmer |
| 6 | Push Expo sur Shephr | ⚠️ **écrit, non éprouvable** (N4a·N4b·N4c) | **démarches Apple / Google** — sans elles, aucune bannière ne part |

### Ce qui reste ouvert

1. **La modale in-app n'a aucun bouton d'action.** `NotificationGate` ne sait pas ouvrir un écran :
   il affiche, « OK » marque lu. Le besoin « la modale ouvre directement l'onglet Trésorerie » n'est
   donc **pas couvert** (recette 11.9). Il faudrait un champ d'action sur `UserNotification` (ou
   dériver la cible de `source`) et un bouton dans la modale. En revanche, **le tap sur une bannière
   push conduit bien à l'écran** : le routage existe (`components/push/routagePush.ts`).
2. **Divergence de nommage entre les deux relances.** Dons rend `envoyes / dejaRelances /
   dejaDeclares / envoyesA` ; Goals rend `sent / alreadyReminded / alreadySubmitted / sentToNames`
   (+ `targeted`, `scope`, `scopeId`). Les deux contrats disent la même chose dans deux langues ;
   l'unification est un renommage mécanique d'un seul côté, avec son miroir mobile.
3. **Le garde-fou « liste vide »** est porté par `RelaiPushNotification`, **pas** par
   `DiffusionPush` : un lot futur qui construirait un `DiffusionPush` à la main avec une liste de
   destinataires calculée puis trouvée vide **diffuserait à tout le parc**, sans erreur nulle part.
   Les appelants doivent passer par le relais.
4. **Langue figée à l'envoi** : le résumé est écrit dans la langue du destinataire au moment de
   l'envoi (`t_user.language`). Qui change de langue ensuite relit ses anciennes notifications dans
   l'ancienne.
5. **Volume** : l'audience d'une relance est chargée d'un coup et les notifications écrites une par
   une, sans plafond. Sans conséquence à l'échelle d'un ministère pilote ; un trésorier de **nation**
   relançant des milliers de personnes mériterait une écriture par lots.
6. **Un `SUPER_ADMIN` est trésorier « par nature »** sans être nommé nulle part :
   `GET /donations/reminders/scopes` lui rend une liste **vide** et le bloc « Relancer » ne s'affiche
   pas chez lui. Il peut toujours relancer un nœud dont il connaît l'identifiant.
7. **Aucun interrupteur « Nouvelles vidéos » côté Shephr** : `prefVideos` est absent de la charge
   utile et vaut donc `true` au serveur. Sans conséquence tant qu'aucune diffusion
   `CategoriePush.VIDEOS` ne vise `TargetApp.Shephr` — le jour où l'une le ferait, elle partirait
   **sans interrupteur pour la couper**, ce que la règle de `CategoriePush` interdit.

---

## 4. Lots de travail — état réel

| Lot | Contenu | État | Réserve |
|---|---|---|---|
| **N1** (= T10) | Résumé quotidien au(x) trésorier(s) | ✅ **fait** | testé par `DonationNotificationIntegrationTest` ; le verrou consultatif PostgreSQL n'est pas exercé (H2), comme pour les quatre jobs existants |
| **N2** (= T11) | Relance groupée des non-déclarants par le trésorier | ✅ **fait** | le composant mobile est branché dans l'écran Trésorerie ; la période reste le mois courant |
| **N3** (= G3) | Relance groupée Goals par périmètre géographique **ou** discipulat | ✅ **fait** | Q3 à confirmer (`goals-hierarchie-et-rappels.md` §4) |
| **N4a** | Backend : `List<UUID> utilisateurs` dans `DiffusionPush` + clause dans `PushSendServiceImpl.cibles` (requêtes par lots de 500) + catégorie `RAPPELS` (colonne `pref_rappels`, canal Android, interrupteur, champ DTO) | ✅ **fait** | `LOT_UTILISATEURS = 500` est un garde-fou, jamais exercé sur une vraie base |
| **N4b** | Mobile : `expo-notifications`, enregistrement au login (`targetApp: "Shephr"`), **3** canaux Android (`rappels`, `infos`, `mises-a-jour`), écran de réglages, modale d'activation, deep link au tap | ⚠️ **fait, non éprouvable** | **bloqué par les démarches Apple / Google** ; Expo Go ne délivre plus le push distant sur Android (SDK 53) : build de développement obligatoire |
| **N4c** | Brancher N1/N2/N3 sur le push : `RelaiPushNotification` (envoi différé à `afterCommit`, garde-fou liste vide) + routage du tap par `source` | ⚠️ **fait, non éprouvable** | la destination du tap est déduite de la `source` (`DONATION_DIGEST` / `DONATION_REMINDER` / `GOAL_REMINDER`) : une source nommée autrement ouvrirait la modale mais aucun écran |

**Divergence assumée avec CMFIPraise** : la **déconnexion supprime l'appareil** côté serveur au lieu
de le repasser en `userId = null`. Shephr n'a pas de mode visiteur — un appareil déconnecté n'est
destinataire de rien. Conséquence : le `DELETE` part avec le jeton capturé **juste avant** `logout()` ;
si l'appel échoue (réseau coupé), la ligne survit jusqu'à la prochaine connexion, qui la réécrit.

### Actions hors code — à faire par Jean Philippe

Le push suppose des démarches Apple et Google qui ne peuvent pas être automatisées :

1. **Clé APNs** pour le bundle iOS `org.cmfi.shephr`.
2. **Compte de service Firebase** et **`google-services.json`** pour le package Android `com.cmfi.shephr`.
3. Une fois le fichier en place, renseigner `app.json` › `android.googleServicesFile`
   (laissé vide **volontairement** : pointer un fichier absent fait échouer `expo prebuild` et EAS).
4. Produire un **build de développement** et l'installer sur un téléphone réel.

`cmfipraise-app/docs/push-notifications-plan.md` §2 en donne la liste exacte, déjà parcourue pour
CMFIPraise — **à refaire pour l'app Shephr**, qui est un identifiant applicatif distinct.

Tant que ce n'est pas fait : `getExpoPushTokenAsync` échoue, l'échec est rattrapé, **l'application
démarre normalement et la file in-app fonctionne à l'identique** — mais aucune bannière ne part.
