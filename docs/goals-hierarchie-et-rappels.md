# Goals — Hiérarchie, leadership géographique et rappels

**Date** : 14/09/2026 · **Cadrage** : JP 14/09/2026 · **Mise à jour** : 14/09/2026 (après les lots G1 · G2 · G3)
**Périmètre** : `cmfipraise-backend` (`org/leaders/`, `org/access/`, `goals/reminder/`), `shephr-app/mobile`

> Deux sujets distincts mais liés, parce qu'ils reposent sur la même question : **qu'est-ce qui
> définit « les gens sous mon leadership » ?**
> 1. La hiérarchie mélange aujourd'hui deux notions qui doivent rester séparées.
> 2. Un dirigeant doit pouvoir relancer les personnes de son périmètre — encore faut-il que
>    « son périmètre » veuille dire quelque chose de précis.

---

## 1. Le mélange constaté

### 1.1 Deux notions, une seule colonne

Il existe dans Shephr **deux formes de leadership**, et elles s'écrivent aujourd'hui dans le
**même champ** `t_user.supervisor_id` :

| | Leadership **géographique** | Leadership **hiérarchique** (discipulat) |
|---|---|---|
| Quoi | « Je dirige la ville de Lyon » | « X est mon faiseur de disciple » |
| Porté par | `goalRole` + `goalCityId` / `goalZoneId` / `goalCountryIds` / `goalUnitId` | `supervisorId` |
| Qui le décide | le back-office / un dirigeant habilité | **la personne elle-même**, en libre-service |
| Écran | Structure, Membres | « Mon faiseur de disciple » (`app/superviseur.tsx`) |
| Depuis | Chantier B | RDG 28/07 |

Le commentaire de `MyDiscipleshipServiceImpl` l'assume explicitement :
> « Le lien reste le `supervisorId` de l'organigramme (Lot 3.5) : une déclaration personnelle et
> une affectation d'administrateur écrivent le même champ. »

C'est de là que vient tout le reste.

### 1.2 Trois conséquences, par ordre de gravité

**(a) Affichage — l'arbre mélange les deux.**
`LeaderHierarchyServiceImpl.buildTrees` descend **uniquement** par `supervisorId`
(`findAllBySupervisorIdIn`). Une personne de Ville-B qui déclare le dirigeant de Ville-A comme
faiseur de disciple devient un **nœud enfant** de ce dirigeant dans l'organigramme, et son assemblée
de Ville-B apparaît dans la liste des assemblées de l'arbre (`assignedUnitIds` → `toNode`).
C'est le symptôme que vous avez vu.

**(b) Périmètre de données — le lien ouvre l'accès.**
`AccessControlServiceImpl.getVisibleUnitIds:161-164` :
```java
for (User sub : subtreeUsers(user)) {
    result.addAll(assignedUnitIds(sub, module));
}
```
Les unités de **tous les subordonnés récursifs par `supervisorId`** entrent dans le périmètre du
dirigeant. L'assemblée de Ville-B devient donc **une assemblée visible** par le dirigeant de Ville-A :
engagements nominatifs (`GoalAccessGuard.coversAssembly`), liste des membres, et — le module Dons
activé — les dons.

Même chose sur la visibilité nominative, `AccessControlServiceImpl.canSeeUser:468` :
```java
if (subtreeUserIds(actor).contains(target.getId())) return true;
```

**(c) Sens de l'écriture — c'est un tiers qui décide.**
`declareSupervisor` est en **libre-service** : n'importe qui choisit son faiseur de disciple parmi
tout le ministère (`MyDiscipleshipServiceImpl.declareSupervisor`, seuls garde-fous : même ministère
et anti-cycle). Autrement dit : **une personne peut, seule, faire entrer son assemblée dans le
périmètre de données d'un dirigeant qui ne l'a jamais demandé** — et le dirigeant n'en est même pas
informé.

Ce n'est plus un défaut d'affichage. C'est une **extension de périmètre décidée par un tiers**.

### 1.3 La règle à poser *(voie longue — écartée au profit du §1.4)*

> **Le discipulat ne confère aucun périmètre.** Il se déclare, il s'affiche, il ne donne accès à
> rien. Le périmètre de données vient **exclusivement** du rôle et du rattachement géographique.

Concrètement :

1. **Séparer les deux liens en base.** `supervisor_id` garde le sens **organisationnel** (posé par
   le back-office) ; le discipulat déclaré part dans sa propre colonne — par exemple
   `discipler_id` — ou dans une table dédiée. Migration : les liens créés par `declareSupervisor`
   depuis le 28/07 basculent côté discipulat ; ceux posés par `reassign` restent.
   ⚠️ Les deux chemins écrivant la même colonne depuis 6 semaines, **il faut décider comment
   départager l'historique** (voir §4, question ouverte).
2. **`getVisibleUnitIds` et `canSeeUser` cessent de lire le discipulat.** Le périmètre devient :
   rôle + rattachement géographique (`goalUnitId`, `goalCityId(s)`, `goalZoneId(s)`,
   `goalCountryIds`) + sous-arbre de **nœuds** via `OrgNodeTree.subtreeIdsOfType` — la même
   mécanique que celle proposée pour le trésorier.
3. **La hiérarchie s'affiche en deux branches distinctes**, jamais fondues :
   - « **Mon périmètre** » — l'arbre géographique : nation → région → ville → assemblée → fidèles ;
   - « **Mon discipulat** » — qui m'accompagne, et qui m'a déclaré. Sans chiffres, sans accès.
4. **L'écran « Mon faiseur de disciple » ne change pas** côté utilisateur — il devient simplement
   sans effet sur les droits.

### 1.4 La décision du 14/09 — la voie simple (J-4)

> **« Dans la hiérarchie, on affiche uniquement les personnes qui m'ont déclaré superviseur, sans
> ajouter les assemblées qui sont sous mon leadership géographique. »**

C'est plus simple que la séparation en deux colonnes proposée au §1.3, **et c'est suffisant** :
il n'y a **ni nouvelle colonne, ni migration de données, ni arbitrage sur l'historique**.
`supervisor_id` garde un seul sens — le discipulat — et l'écran cesse de fondre deux choses.

**Ce que ça donne :**

| Écran | Contenu | Source |
|---|---|---|
| **Hiérarchie** | Uniquement le discipulat : qui m'a déclaré, et récursivement leurs propres disciples. Avec leur assemblée en information | `supervisorId` seul |
| **Structure** | L'arbre géographique : nation → région → ville → assemblée | `org_node` |
| **Membres** | Les fidèles de mon périmètre géographique | rôle + rattachement |

Concrètement, dans `LeaderHierarchyServiceImpl` : `buildTrees` est déjà **exclusivement** fondé sur
`supervisorId` — il n'y a donc rien à retirer de la descente. Ce qui doit disparaître de cet écran,
c'est **`unassignedUnits`** (§`LeaderHierarchyServiceImpl:244`), la seule partie qui injecte du
géographique (`accessControl.getAllVisibleUnitIds(actor)`).

⚠️ **Une fonction à ne pas perdre au passage** : `unassignedUnits` produit le label
« **dirigeant requis** » sur les assemblées du périmètre qui n'ont pas de responsable (RG-DS-10).
C'est utile et ça ne doit pas disparaître — **elle déménage vers l'écran Structure**, où elle est
d'ailleurs à sa place.

### 1.5 Ce que la voie simple ne règle pas — et la question qui reste

La décision J-4 règle **l'affichage**. Elle ne touche pas au **périmètre de données** (§1.2b) :
`AccessControlServiceImpl.getVisibleUnitIds:161` continue d'ajouter les unités de tous les
subordonnés récursifs par `supervisorId`.

**Et il y a un effet pervers à le laisser en l'état** : une fois les assemblées géographiques
retirées de l'écran Hiérarchie, le fait qu'une assemblée lointaine soit dans le périmètre de
données du dirigeant devient **invisible**. Elle n'apparaît plus dans aucun arbre, mais ses chiffres
continuent d'entrer dans ses agrégats Goals et — module Dons activé — dans ses totaux. Le mélange
cesse d'être visible sans cesser d'exister.

**La correction est plus simple que la séparation du §1.3** : retirer la boucle
`for (User sub : subtreeUsers(user))` de `getVisibleUnitIds`, et le test
`subtreeUserIds(actor).contains(target.getId())` de `canSeeUser:468`.

**Rien de légitime n'est perdu** — vérifié rôle par rôle :

| Rôle | Périmètre après retrait | Perdu ? |
|---|---|---|
| `DIRIGEANT_UNITE` | son assemblée (`goalUnitId` + `goalUnitIds`) | rien |
| `DIRIGEANT` (ville) | toutes les assemblées de sa/ses ville(s) via `subtreeIdsOfType` | rien |
| `DIRIGEANT_SENIOR` | toutes les assemblées de sa/ses région(s) | rien |
| `DIRIGEANT_COORDINATEUR` | toutes les assemblées de sa/ses nation(s) | rien |
| `LEADER` / `SECRETARIAT` | ministère entier (branche séparée, inchangée) | rien |

Chaque rôle garde **exactement son périmètre géographique**. Le seul cas qui change : un
`DIRIGEANT_UNITE` qui a planté une autre assemblée et qui en accompagne le dirigeant perdrait
l'accès aux données de celle-ci. Le cas échéant, le back-office le lui rend **explicitement** — en
lui rattachant l'assemblée (`goalUnitIds`) ou en lui donnant le rôle de ville. Ce qui est
exactement votre règle n°1 : *« à l'entrée, je suis le back-office et je crée le périmètre »*.

> **Question ouverte, une seule** : le discipulat donne-t-il accès aux **données** de ses disciples,
> oui ou non ?
> **Recommandation : non.** Un lien déclaré unilatéralement par un tiers ne devrait pas étendre ce
> qu'une personne peut lire. Si un dirigeant doit voir une assemblée, cela se décide au back-office.
>
> À noter : répondre « non » **n'empêche pas** d'envoyer un rappel à ses disciples (§3.1,
> `scope: DISCIPLES`). Envoyer un message n'est pas lire des données — on peut accompagner
> quelqu'un sans consulter ses engagements.

### 1.5 bis. La décision du 14/09 (J-5) — la hiérarchie est une chaîne de DIRIGEANTS

> **« Un membre simple ne peut pas déclarer un superviseur. C'est un dirigeant d'unité ou au-dessus
> qui déclare le superviseur. Ainsi le dirigeant déclaré superviseur voit l'assemblée et les
> membres en dessous. »**

**Cette règle est déjà écrite — dans l'interface mobile.** `app/hierarchie.tsx:158-161` :

```
/* Déclaration de SON superviseur (JP 30/07) : réservée aux DIRIGEANTS […].
   Un membre ne la voit pas : son rattachement à une assemblée détermine
   implicitement son dirigeant. */
{canManageUsers(me) && ( … lien vers /superviseur … )}
```

Le raccourci vers l'écran « faiseur de disciple » est donc **déjà fermé aux simples fidèles**, et
c'est son unique point d'entrée. Ce qui manque, c'est la **garde côté serveur** :
`MyDiscipleshipServiceImpl.declareSupervisor` ne vérifie aucun rôle — l'API reste ouverte.

**D'où viennent alors les `supervisor_id` des simples fidèles ?** De l'**invitation** :
`AdminUserServiceImpl:537-538` — si l'invitant ne désigne personne, **il devient lui-même le
superviseur de l'invité**. Et du back-office (sélecteur de superviseur dans `Users.tsx:801` et
`ResponsablesDrawer.tsx`). Pas d'une déclaration personnelle.

> ℹ️ Cela nuance le §1.2c : au niveau de l'**API** la déclaration est bien en libre-service, mais
> dans les **écrans livrés** un simple fidèle n'y a jamais eu accès. Le risque décrit reste réel
> (l'API est ouverte, et un invitant d'une autre ville devient superviseur par défaut), mais il ne
> provient pas du parcours « faiseur de disciple ».

#### Ce que la règle J-5 donne

| | Avant | Après J-5 |
|---|---|---|
| Qui déclare un superviseur | tout le monde (API) | **`DIRIGEANT_UNITE` et au-dessus, uniquement** |
| Superviseur d'un simple fidèle | l'invitant, par défaut | **aucun** — son assemblée détermine son dirigeant |
| Hiérarchie | arbre de personnes, tous rôles | **chaîne de dirigeants** |
| Périmètre du superviseur | les unités de tous ses subordonnés | les assemblées de ses **dirigeants** subordonnés — **ce qui est voulu** |

#### Et le périmètre se corrige alors par un FILTRE, pas par une migration

C'est le gain majeur de cette formulation. Au lieu de retirer la boucle `subtreeUsers` de
`getVisibleUnitIds` (§1.5), il suffit de **n'y retenir que les managers** :

```java
for (User sub : subtreeUsers(user)) {
    if (!isManager(sub)) continue;          // ← J-5
    result.addAll(assignedUnitIds(sub, module));
}
```

Vérifié rôle par rôle, **rien de légitime n'est perdu** :

| Rôle | Ce qu'il garde | Par quoi |
|---|---|---|
| `DIRIGEANT_UNITE` | son assemblée | il est lui-même dans `subtreeUsers` (la racine) et il est manager |
| `DIRIGEANT` (ville) | ses dirigeants d'assemblée + toutes les assemblées de sa ville | filtre + `subtreeIdsOfType(cityId, ASSEMBLY)` |
| `DIRIGEANT_SENIOR` | idem au niveau région | filtre + sous-arbre de zone |
| `DIRIGEANT_COORDINATEUR` | idem au niveau nation | filtre + sous-arbre de nation |
| `LEADER` / `SECRETARIAT` | le ministère | branche séparée, inchangée |

**Aucune migration, aucune purge de données, aucun arbitrage sur l'historique** : les
`supervisor_id` posés sur des simples fidèles cessent simplement d'avoir un effet, sans qu'on ait
à les effacer.

#### Les trois gestes

1. **Garde serveur** dans `MyDiscipleshipServiceImpl.declareSupervisor` (et `searchCandidates`) :
   l'acteur doit être manager, et le superviseur désigné aussi. ~5 lignes.
2. **Filtre manager** dans `AccessControlServiceImpl.getVisibleUnitIds` (ci-dessus) — et le même
   dans `canSeeUser:468`.
3. **Vue « chaîne » d'un simple fidèle** (`buildChain`, mode `CHAIN`) : elle remonte aujourd'hui
   son `supervisorId`, qui n'a plus de sens pour lui. Elle doit partir de **son assemblée** →
   son dirigeant → au-dessus. C'est exactement ce qu'annonce le commentaire de JP 30/07 :
   *« son rattachement à une assemblée détermine implicitement son dirigeant »*.

À noter : **rien à retirer côté écran**. Un simple fidèle n'a jamais vu l'écran « faiseur de
disciple » — la question « faut-il le lui enlever ? » ne se pose pas.

### 1.6 Ce que ça corrige au passage

## 2. Les rappels — ce qui existe

**Il existe déjà un rappel Goals, mais il est unitaire.**

`POST /api/church/goals/member/{memberId}/reminders` (`GoalReminderController:36`) :

| Aspect | État |
|---|---|
| Une notification in-app à **une** personne | ✅ |
| Anti-spam **24 h par personne** (`existsByRefEntityIdAndSourceAndCreatedAtAfter`) | ✅ |
| Refus si la personne a **déjà soumis** (`MEMBER_ALREADY_SUBMITTED`) | ✅ |
| Message personnalisable, sinon message par défaut avec la date limite | ✅ |
| Garde : « si vous voyez ce que la personne a déclaré, vous pouvez la relancer » (`assertCanSeeMemberDetail`) | ✅ mais ⚠️ passe aujourd'hui par le discipulat (§1.2b) |
| **Rappel groupé** (« tous ceux qui n'ont pas soumis dans mon périmètre ») | ❌ **n'existe pas** |

Aujourd'hui, un dirigeant d'assemblée de 40 fidèles dont 25 n'ont pas soumis doit faire **25 gestes**.
C'est la raison pour laquelle la fonction n'est pas utilisée.

## 3. Les rappels — ce qu'il faut construire

### 3.1 Rappel groupé, à périmètre choisi explicitement

`POST /api/church/goals/reminders/bulk`

```jsonc
{
  "scope": "ASSEMBLY" | "CITY" | "ZONE" | "COUNTRY" | "DISCIPLES",
  "scopeId": "<uuid, optionnel : un nœud précis de mon périmètre>",
  "message": "…"          // optionnel, sinon message par défaut
}
```

**Le choix du périmètre est explicite, et c'est le point important** : `DISCIPLES` (mon discipulat)
et les périmètres géographiques sont **deux options séparées dans l'écran**, jamais additionnées
silencieusement. C'est la traduction directe de la règle du §1.3 — on ne mélange pas, mais on laisse
le dirigeant viser ce qu'il veut viser.

Règles :
- destinataires = personnes du périmètre **qui n'ont pas soumis** pour l'année courante
  (`GoalSubmissionStatus`, déjà en place) ;
- l'anti-spam 24 h par personne s'applique **individuellement** : les personnes déjà relancées sont
  simplement **sautées**, l'envoi ne casse pas ;
- réponse : `{ envoyés: 18, déjàRelancés: 5, déjàSoumis: 17 }` — le dirigeant voit ce qui s'est passé ;
- garde : le périmètre demandé doit être **inclus dans le périmètre géographique de l'acteur**
  (après correction du §1.3, donc sans le discipulat).

### 3.2 Qui peut relancer

| Profil | Peut relancer |
|---|---|
| `DIRIGEANT_UNITE` | les fidèles de son assemblée |
| `DIRIGEANT` (ville) | toutes les assemblées de sa ville |
| `DIRIGEANT_SENIOR` (région) | toutes les assemblées de sa région |
| `DIRIGEANT_COORDINATEUR` (nation) | toutes les assemblées de sa nation |
| Toute personne | ses **disciples** (`scope: DISCIPLES`) — y compris un simple membre qui accompagne quelqu'un |
| `LEADER` / `SECRETARIAT` | ministère-large, lecture seule → **à trancher** : relancer est-il un acte de gouvernance ? |

---

## 4. Questions ouvertes (à trancher avant implémentation)

| # | Question | Pourquoi ça bloque |
|---|---|---|
| ~~Q1~~ | ~~Comment départager l'historique de `supervisor_id` ?~~ | **Sans objet depuis J-4** : on ne sépare plus les colonnes, `supervisor_id` garde un seul sens. Aucune migration. |
| ~~Q2~~ | ~~Le discipulat donne-t-il accès aux données ?~~ | **Tranché par J-5** : le lien n'existe plus qu'entre dirigeants, et il porte alors légitimement le périmètre. Un simple fidèle n'en pose plus, et ceux déjà posés cessent d'avoir un effet. Aucune mesure préalable nécessaire. |
| Q3 | `LEADER` / `SECRETARIAT` peuvent-ils envoyer un rappel groupé ministère-large ? | **Toujours ouverte.** Le lot G3 a tranché **par le refus** en attendant : 403 sur tout périmètre géographique, ils gardent « Mes disciples ». Si JP décide l'inverse, c'est une ligne — `GoalBulkReminderServiceImpl.hasGeographicAuthority` — et l'écran suit tout seul, puisqu'il n'affiche que ce que renvoie `GET /goals/reminders/scopes`. |

```sql
-- Q2 : combien de rattachements « superviseur » sortent du périmètre géographique du superviseur ?
SELECT s.id AS superviseur, s.full_name, COUNT(*) AS subordonnes_hors_ville
  FROM t_user u
  JOIN t_user s ON s.id = u.supervisor_id
  JOIN org_node ua ON ua.id = u.goal_unit_id       -- assemblée du subordonné
  JOIN org_node uc ON uc.id = ua.parent_id         -- sa ville
 WHERE s.goal_city_id IS NOT NULL
   AND uc.id <> s.goal_city_id
 GROUP BY s.id, s.full_name
 ORDER BY 3 DESC;
```

---

## 5. Lots de travail — état réel au 14/09 au soir

> « Fait » signifie **écrit, compilé, testé automatiquement** — pas **éprouvé à la main**.
> La recette manuelle est la section 12 de `docs/donations-recette.md`.

| Lot | Contenu | État | Ce qui reste |
|---|---|---|---|
| **G1** | **Hiérarchie = discipulat seul** (J-4) : `unassignedUnits` retiré de la réponse Hiérarchie (DTO, service, type mobile) et remplacé par `GET /api/church/leaders/units/unassigned`, consommé par l'écran **Structure** (pastille « Dirigeant requis » + rappel compté) | ✅ **fait** | recette 12.2, 12.3, 12.17 à 12.21 |
| **G2** | **Chaîne de dirigeants** (J-5) : garde serveur sur `declareSupervisor` **et** `searchCandidates` (403 `UNAUTHORIZED_ACCESS`, 422 `SUPERVISOR_NOT_A_LEADER`), filtre manager dans `getVisibleUnitIds`, sous-arbre filtré `managerSubtreeUserIds` dans `canSeeUser`, vue « chaîne » du fidèle reconstruite depuis **son assemblée** | ✅ **fait** — aucune migration de données | recette 12.0b, 12.4, 12.7, 12.14 à 12.16, 12.22 |
| **G3** | Rappel groupé `POST /api/church/goals/reminders/bulk` (+ `GET /goals/reminders/scopes` pour l'aperçu) et écran mobile `goals/remind.tsx` — deux sections **jamais fondues**, aperçu avant envoi, compte rendu à trois compteurs | ✅ **fait** | recette 12.8 à 12.13 et 12.23 à 12.38 · **Q3 à confirmer** |

### Ce qui reste ouvert après ces lots

1. **Q3 (ci-dessus)** — refus provisoire pour `LEADER` / `SECRETARIAT` sur les périmètres géographiques.
2. **`AccessControlServiceImpl.canManageUser` n'a pas été filtré** : il utilise toujours le sous-arbre
   **complet**. Un dirigeant peut donc encore **administrer** (éditer, promouvoir) un simple fidèle
   portant un `supervisor_id` historique vers lui, même hors de sa ville. Non traité volontairement —
   le lot ne nommait que `getVisibleUnitIds` et `canSeeUser`, et y toucher déborde sur l'administration
   des comptes. **À trancher si la recette le remonte.**
3. **Le back-office reste un chemin ouvert** : `Utilisateurs.tsx` et `ResponsablesDrawer.tsx` proposent
   toujours un sélecteur de superviseur sur des comptes non-dirigeants. Ils passent par
   `/api/church/admin/users`, hors de la garde J-5. Fermer aussi ce chemin est un geste distinct, à cadrer.
4. **Les `supervisor_id` posés sur de simples fidèles restent en base** (aucune migration, conformément
   à J-5). Ils sont **inertes** pour le périmètre et l'affichage, mais une requête SQL directe les verra
   toujours — ne pas s'en étonner en recette.
5. **`shephr-app/web` (hors périmètre) lit encore `data.unassignedUnits`** dans `Hierarchy.tsx`. Pas de
   casse : son `fetchLeaderHierarchy` normalise en `[]`, la section « dirigeant requis » de l'espace
   ministère web devient simplement vide. À porter côté web quand ce périmètre rouvrira.
6. **Aucun push sur le rappel groupé Goals** en propre : il crée des `UserNotification`, donc des
   modales in-app. La bannière hors application dépend du lot N4 (`notifications.md`) et de ses
   démarches Apple / Google.
7. **L'aperçu ne retranche pas les personnes déjà relancées** dans les 24 h : « 5 à relancer » peut
   donner « 2 envoyés, 3 déjà relancées ». Volontaire (l'aperçu dit qui est en retard, le compte rendu
   dit ce qui s'est passé), mais l'écart surprend.
