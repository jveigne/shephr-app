# Plan de test — Module Member Care (Suivi pastoral) — Front web + Mobile

> **But** : valider point par point le **frontend** Member Care.
> **Partie A — Web** (`shephr-app/web`, page « Suivi pastoral ») : §0 → §8.
> **Partie B — Mobile** (`shephr-app/mobile`, onglet « Care ») : §9 → §13.
> **Backend** : déjà livré en prod — on ne le teste pas, on s'appuie dessus.
> **Référence fonctionnelle** : `cmfipraise-backend/docs/shephr/Shephr_UseCases_complet_V1.1.md` (UC-MCR-01 → 11).
> Date : 2026-06-27.

---

## 0. Ce qui est testable côté front web (et ce qui ne l'est pas)

La page web `pages/MemberCare.tsx` implémente **2 onglets** : **Suivi** et **Redevabilité**.
Tous les écrans tapent l'API `/api/church/member-care/**` (gatée `@RequiresModule("MEMBER_CARE")`).

| UC | Intitulé | Dans l'UI web ? | Où / comment |
|----|----------|------------------|--------------|
| UC-MCR-01 | Créer une fiche | ✅ | Onglet Suivi → « Ajouter une personne » |
| UC-MCR-02 | Mettre à jour le statut | ✅ | Détail fiche → « Changer le statut » |
| UC-MCR-03 | Liste de suivi (filtres, recherche) | ✅ | Onglet Suivi |
| UC-MCR-04 | Fiche détaillée + timeline | ✅ | Clic sur une ligne |
| UC-MCR-05 | Rappel auto (cron + email) | ❌ | Backend cron — non testable au front |
| UC-MCR-06 | Vue d'ensemble redevabilité | ✅ | Onglet Redevabilité |
| UC-MCR-07 | Relancer un dirigeant en retard | ✅ | Onglet Redevabilité → « Relancer » |
| UC-MCR-08 | Lier une fiche à un compte | ❌ | Endpoint `POST /records/{id}/link` existe, **pas d'UI** → curl |
| UC-MCR-09 | Config référentiel statuts | ❌ | Endpoints `statuses` POST/PATCH, **pas d'UI** → curl |
| UC-MCR-10 | Config cadence/échéance | ❌ | Endpoints `config`, **pas d'UI** → curl |
| UC-MCR-11 | Export CSV | ❌ | Endpoint `GET /export`, **pas de bouton** dans l'UI → curl |

> ⚠️ Ne perds pas de temps à chercher dans l'UI : **lien de compte, config statuts/cadence et export ne sont pas branchés au front web** (différés — cf. plan Lot 8.2). Ils se testent au curl (§7) ou plus tard.

---

## 1. Prérequis (à faire **une seule fois** avant de commencer)

### 1.1 Pointer le front local sur le backend de prod
Le backend de prod (dev Railway) est :
```
https://cmfipraise-backend-dev.up.railway.app
```
En `npm run dev`, le client axios a `baseURL = ''` et Vite proxifie `/api` vers `localhost:8080`.
Pour taper la **prod** sans souci de CORS, **modifie temporairement la cible du proxy** dans `vite.config.ts` :

```ts
proxy: {
  '/api': {
    target: 'https://cmfipraise-backend-dev.up.railway.app', // ⟵ prod au lieu de localhost:8080
    changeOrigin: true,
  },
},
```
Puis :
```bash
cd shephr-app/web
npm install      # si pas déjà fait
npm run dev      # http://localhost:5173
```
> 🔁 **Pense à remettre `http://localhost:8080`** après les tests.
> (Alternative sans toucher au proxy : `VITE_API_BASE_URL=https://cmfipraise-backend-dev.up.railway.app npm run dev` — mais l'appel devient direct et **exige que le CORS prod autorise `localhost:5173`**. Le proxy ci-dessus évite ce problème.)

- [ ] **P1** — Le front se lance, la page `/login` s'affiche.

### 1.2 Disposer d'un compte de test correct
Le compte doit cumuler **3 conditions**, sinon le module est invisible/inutilisable :

1. **Accès ministère** : rôle ≠ MEMBRE (sinon « accès refusé » au login — `hasMinistryAccess`).
2. **Module MEMBER_CARE activé** pour son ministère (abonnement actif). Sinon l'entrée de menu « Suivi pastoral » **n'apparaît pas** (RG-06).
3. **Au moins une unité dans son périmètre** (rôle DIRIGEANT ou +). Sinon la liste déroulante « Unité » du formulaire de création est **vide** → impossible de créer une fiche.

Profils recommandés :
- **DIRIGEANT** d'une unité (acteur principal MCR-01→04) — pour la saisie.
- **DIRIGEANT_LEADER / COORDINATEUR / SUPER_ADMIN** — pour tester la Redevabilité (UC-MCR-06/07) et le **lecture seule** (UC-MCR-04 A1).

- [ ] **P2** — Login OK, on arrive sur le dashboard.

### 1.3 Vérifier que MEMBER_CARE est bien activé
Avant de chercher des bugs UI, confirme l'activation du module (sinon tout est « normalement » masqué) :
```bash
TOKEN="<colle ton JWT — voir §1.4>"
curl -s https://cmfipraise-backend-dev.up.railway.app/api/me/accessible-modules \
  -H "Authorization: Bearer $TOKEN"
# Attendu : la liste contient "MEMBER_CARE"
```
- [ ] **P3** — `MEMBER_CARE` figure dans la réponse.
  - Si **absent** → c'est un problème d'abonnement, pas un bug front. Faire activer l'abonnement `MEMBER_CARE` pour le ministère (SUPER_ADMIN, `/admin/subscriptions`) avant de continuer.

### 1.4 Récupérer le JWT (pour les vérifs curl)
Une fois loggé dans le front : DevTools → Application → Local Storage → clé `shephr.admin.token`. C'est le `Bearer`.

---

## 2. Onglet **Suivi** — Liste, création, détail, statut

### T1 — Accès & affichage de la liste (UC-MCR-03)
**Préconditions** : P1–P3 OK, compte DIRIGEANT.
**Étapes** :
1. Dans la barre latérale, section « Pilotage », clique **« Suivi pastoral »** (visible seulement si MEMBER_CARE actif).
2. L'onglet **« Suivi »** est actif par défaut.

**Attendu** :
- [ ] **T1.1** — L'entrée de menu « Suivi pastoral » est présente.
- [ ] **T1.2** — Le tableau liste les fiches : colonnes **Nom · Statut (pastille couleur) · Téléphone · Email · Mise à jour**.
- [ ] **T1.3** — Si aucune fiche : tableau vide (pas d'erreur). *(Note : l'empty state riche « Aucune personne suivie » du UC-MCR-03/A1 n'est pas implémenté tel quel — le tableau est simplement vide.)*
- [ ] **T1.4** — Aucune erreur réseau 4xx/5xx dans l'onglet Network (hors 401 si token expiré).

### T2 — Créer une fiche (UC-MCR-01)
**Étapes** :
1. Clique **« Ajouter une personne »** (en haut à droite).
2. Le modal « Ajouter une personne suivie » s'ouvre.
3. Choisis une **Unité** (liste alimentée par ton périmètre), saisis **Prénom** + **Nom**.
4. (Optionnel) Téléphone, Email, **Statut initial**, Note.
5. Clique **« Créer la fiche »**.

**Attendu** :
- [ ] **T2.1** — Le bouton « Créer la fiche » est **désactivé** tant que Unité + Prénom + Nom ne sont pas remplis (champs minimaux MCR-01/A3).
- [ ] **T2.2** — À la validation : toast **« Fiche créée »**, modal fermé, la fiche apparaît dans la liste.
- [ ] **T2.3** — La pastille de statut affiche le statut initial choisi (ou « — » si aucun).
- [ ] **T2.4** — La liste déroulante « Statut initial » ne propose que les statuts **actifs**.
- [ ] **T2.5** *(403 attendu)* — Si tu choisis une unité hors de ton périmètre (cas peu probable via l'UI, le select ne montre que ton périmètre) le back renvoie 403 → toast « Échec ». *(Plutôt à vérifier au curl, §7.)*

### T3 — Fiche détaillée + timeline (UC-MCR-04)
**Étapes** :
1. Clique sur une **ligne** du tableau.
2. Le modal détail s'ouvre.

**Attendu** :
- [ ] **T3.1** — En-tête : Prénom Nom + pastille du statut courant.
- [ ] **T3.2** — Corps : 📞 téléphone, ✉️ email, note (s'ils existent).
- [ ] **T3.3** — Section **« Cheminement »** : timeline des changements de statut, triée par date, format `date — ancien → nouveau · note`.
- [ ] **T3.4** — Fiche neuve : la timeline contient l'entrée initiale `null → Nouveau` (ou « Aucun changement enregistré. » si créée sans statut).
- [ ] **T3.5** — Le bloc **« Changer le statut »** n'apparaît que si `canEdit = true` (voir T8 pour le lecture seule superviseur).

### T4 — Mettre à jour le statut (UC-MCR-02)
**Préconditions** : fiche ouverte, `canEdit = true`.
**Étapes** :
1. Dans « Changer le statut », sélectionne un **nouveau statut** (ex. Nouveau → En danger).
2. (Optionnel) Saisis une note de contexte.
3. Clique **OK**.

**Attendu** :
- [ ] **T4.1** — Toast **« Statut mis à jour »**.
- [ ] **T4.2** — La pastille (en-tête + ligne de liste) reflète le nouveau statut.
- [ ] **T4.3** — Une **nouvelle entrée** apparaît dans le Cheminement : `ancien → nouveau` + date + note.
- [ ] **T4.4** *(statut inchangé — MCR-02/A1)* — Resélectionner le **même** statut : vérifier qu'aucune entrée d'historique en double n'est créée. *(Comportement porté par le back ; observer la timeline après l'action.)*
- [ ] **T4.5** — Le bouton OK est désactivé tant qu'aucun statut n'est sélectionné.

### T5 — Filtres & recherche (UC-MCR-03)
**Étapes** : utilise les 3 filtres en tête de l'onglet Suivi.

**Attendu** :
- [ ] **T5.1** — Filtre **Unité** : « Toutes » + une option par unité du périmètre ; sélection → la liste se restreint à l'unité.
- [ ] **T5.2** — Filtre **Statut** : « Tous » + statuts du référentiel ; sélection → seules les fiches de ce statut.
- [ ] **T5.3** — **Recherche** (placeholder « Nom… ») : filtre par nom.
- [ ] **T5.4** — Combinaison des 3 filtres cohérente (résultats = intersection).
- [ ] **T5.5** — Vider les filtres réaffiche tout.

---

## 3. Onglet **Redevabilité** — Vue d'ensemble & relance

### T6 — Vue d'ensemble (UC-MCR-06)
**Préconditions** : compte superviseur (LEADER/COORDINATEUR/SUPER_ADMIN) avec plusieurs unités, OU DIRIGEANT (verra sa/ses unité(s)).
**Étapes** : clique l'onglet **« Redevabilité »**.

**Attendu** :
- [ ] **T6.1** — Tableau : colonnes **Unité · Fiches · Dernière mise à jour · État**.
- [ ] **T6.2** — État par unité : **Vide** (0 fiche, badge gris) / **À jour** (badge vert) / **En retard** (badge rouge), selon la cadence.
- [ ] **T6.3** — « Dernière mise à jour » affiche une date lisible (ou « — »).
- [ ] **T6.4** — Périmètre vide : message **« Aucune unité dans votre périmètre. »**.
- [ ] **T6.5** — Les unités listées correspondent bien au **périmètre du rôle** (un DIRIGEANT ne voit que la/les sienne(s) ; un superviseur voit son sous-arbre).

> ℹ️ Le code couleur orange « échéance proche » et les indicateurs globaux en tête (X à jour / Y en retard, total « En danger ») du UC-MCR-06 ne sont **pas** dans cette version : seuls Vide/À jour/En retard sont rendus. À noter comme écart, pas comme bug bloquant.

### T7 — Relancer un dirigeant en retard (UC-MCR-07)
**Préconditions** : au moins une unité **En retard** dans l'onglet Redevabilité.
**Étapes** :
1. Sur une ligne **En retard**, clique **« Relancer »** (le bouton n'apparaît que sur les lignes en retard).
2. Observe.

**Attendu** :
- [ ] **T7.1** — Toast **« Rappel envoyé »**.
- [ ] **T7.2** — Le bouton est désactivé pendant l'envoi (anti double-clic).
- [ ] **T7.3** — Une unité **À jour** ou **Vide** n'affiche **pas** de bouton « Relancer ».
- [ ] **T7.4** *(anti-spam MCR-07/A1)* — Relancer 2× le même jour la même unité : le back doit empêcher le doublon → toast d'erreur **« Rappel impossible »** au 2e essai. *(Comportement back ; à confirmer.)*

---

## 4. Permissions & lecture seule

### T8 — Superviseur en lecture seule (UC-MCR-04 / A1, RG-MCR-08)
**Préconditions** : se connecter avec un compte **superviseur** (LEADER) qui supervise des unités sans en être le DIRIGEANT.
**Étapes** : ouvrir une fiche d'une unité supervisée.

**Attendu** :
- [ ] **T8.1** — La fiche s'ouvre, identité + timeline visibles.
- [ ] **T8.2** — Le bloc **« Changer le statut » est ABSENT** (`canEdit = false`).
- [ ] **T8.3** — Côté API, un `PATCH /records/{id}/status` forcé renvoie 403 (à vérifier au curl §7).

---

## 5. Internationalisation & robustesse

### T9 — FR / EN
**Étapes** : bascule la langue (boutons FR/EN en bas de la sidebar).
- [ ] **T9.1** — Tous les libellés Member Care basculent (titre, onglets, colonnes, boutons, modals).
- [ ] **T9.2** — Aucune clé brute affichée (ex. `memberCare.xxx`).

### T10 — Robustesse
- [ ] **T10.1** — Token expiré → redirection `/login` (intercepteur 401).
- [ ] **T10.2** — Couper le réseau pendant une création → toast **« Échec »** avec message, pas de crash.
- [ ] **T10.3** — Recharger la page sur `/member-care` directement (deep-link) → la page se recharge correctement (pas de 404 SPA).
- [ ] **T10.4** — Après création/MAJ statut, les onglets Suivi **et** Redevabilité sont rafraîchis (invalidation react-query).

---

## 6. Écarts connus / hors périmètre front (à ne pas signaler comme bugs)

- Empty state riche UC-MCR-03/A1 (« Aucune personne suivie » + CTA) → tableau simplement vide.
- Bandeau d'alerte « échéance dépassée » UC-MCR-03/A2 → non implémenté côté liste.
- Indicateurs globaux + code couleur orange UC-MCR-06 → seuls Vide/À jour/En retard.
- Détection de doublon UC-MCR-01/A1 (« Une fiche similaire existe déjà ») → non implémenté côté UI.
- UC-MCR-08 (lier compte), UC-MCR-09/10 (config statuts/cadence), UC-MCR-11 (export) → **endpoints back présents, aucune UI web** (différés, plan Lot 8.2).
- UC-MCR-05 (rappels cron + email) → backend planifié, non observable au front.

---

## 7. Tests des endpoints back-only (curl) — optionnel

Si tu veux couvrir les UC sans UI ou les cas 403, voici les appels directs.
`BASE=https://cmfipraise-backend-dev.up.railway.app/api/church/member-care` · `TOKEN=<JWT>`

```bash
BASE=https://cmfipraise-backend-dev.up.railway.app/api/church/member-care
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# Référentiel de statuts (UC-MCR-09 lecture)
curl -s $H $BASE/statuses | jq

# Export CSV (UC-MCR-11) — tracé en audit côté back
curl -s $H "$BASE/export" -o member-care.csv && head member-care.csv

# Config cadence (UC-MCR-10)
curl -s $H $BASE/config | jq

# Lier une fiche à un compte (UC-MCR-08)
curl -s -X POST $H $BASE/records/<RECORD_ID>/link -d '{"linkedUserId":"<USER_ID>"}' | jq

# 403 attendu : changer le statut d'une fiche hors périmètre (UC-MCR-04 lecture seule)
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH $H \
  $BASE/records/<RECORD_ID>/status -d '{"statusId":"<STATUS_ID>"}'
# Attendu : 403

# 403 attendu : appel sans abonnement MEMBER_CARE → MODULE_ACCESS_DENIED
```

- [ ] **C1** — `statuses` renvoie le référentiel par défaut (Nouveau, En intégration, Engagé, En danger, Rétrograde).
- [ ] **C2** — `export` renvoie un CSV des fiches du périmètre.
- [ ] **C3** — `config` renvoie la cadence (WEEKLY/MONTHLY/QUARTERLY).
- [ ] **C4** — Le PATCH statut hors périmètre renvoie **403**.

---

## 8. Journal de bugs (à remplir au fil de l'eau)

| # | Test | Sévérité | Description | Statut |
|---|------|----------|-------------|--------|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

---

### Ordre de passage conseillé (Web)
1. §1 Prérequis (P1→P3) — **bloquant**, ne rien faire d'autre avant que P3 soit vert.
2. T1 → T5 (cœur Suivi, DIRIGEANT).
3. T6 → T7 (Redevabilité, superviseur).
4. T8 (lecture seule).
5. T9 → T10 (i18n / robustesse).
6. §7 curl (optionnel, pour les UC sans UI).

---
---

# PARTIE B — MOBILE (`shephr-app/mobile`, onglet « Care »)

> App **Expo / React Native**, navigation `expo-router`. Écrans Member Care sous `app/(tabs)/care/` :
> `index.tsx` (liste + redevabilité), `new.tsx` (création), `record/[id].tsx` (détail + timeline + statut + suppression).
> Le mobile reprend les mêmes UC que le web, avec **2 différences notables** : il permet la **suppression d'une fiche** (corbeille, absente du web) et n'a **pas** d'export/curl intégré.

## 9. Ce qui est testable côté mobile

| UC | Intitulé | Dans l'app mobile ? | Où |
|----|----------|---------------------|-----|
| UC-MCR-01 | Créer une fiche | ✅ | Onglet Care → bouton « + Nouvelle fiche » → écran `new` |
| UC-MCR-02 | Mettre à jour le statut | ✅ | Détail fiche → « Changer le statut » (chips) |
| UC-MCR-03 | Liste de suivi (filtres, recherche) | ✅ | Onglet Care → segment « Suivi » |
| UC-MCR-04 | Fiche détaillée + timeline | ✅ | Tap sur une ligne |
| UC-MCR-06 | Vue d'ensemble redevabilité | ✅ | Onglet Care → segment « Redevabilité » |
| UC-MCR-07 | Relancer un dirigeant | ✅ | Segment Redevabilité → icône cloche sur une unité en retard |
| Suppression de fiche | — | ✅ *(mobile only)* | Détail fiche → icône corbeille (si `canEdit`) |
| UC-MCR-05/08/09/10/11 | Rappels cron, lien compte, config, export | ❌ | Hors app mobile (cf. §6) |

## 10. Prérequis Mobile

### 10.1 Backend ciblé — **déjà la prod par défaut**
`app.json → extra.API_URL = https://cmfipraise-backend-dev.up.railway.app`.
`services/apiClient.ts` retient cette URL telle quelle (elle ne contient pas « localhost »).
> ✅ **Aucune bidouille de proxy** : sur **simulateur iOS** ou **Expo web**, l'app tape directement la prod.
> ⚠️ Sur **appareil physique via Expo Go**, l'app garde aussi l'URL de prod (pas le Mac local) — donc OK pour tester la prod.

```bash
cd shephr-app/mobile
npm install        # si pas déjà fait
npm start          # = expo start  → puis 'i' (iOS sim), 'w' (web), ou QR code Expo Go
```
- [ ] **MP1** — L'app démarre, l'écran de login s'affiche.

### 10.2 Compte de test — gating plus strict que le web
L'onglet **« Care » n'apparaît que si `isLeader && hasMemberCare`** (cf. `app/(tabs)/_layout.tsx`) :
- **`isLeader`** : rôle ≠ MEMBRE (un simple membre ne verra **jamais** l'onglet, même module activé).
- **`hasMemberCare`** : `MEMBER_CARE` présent dans `/api/me/accessible-modules`.

- [ ] **MP2** — Login avec un compte **DIRIGEANT (ou +)** d'un ministère où MEMBER_CARE est actif.
- [ ] **MP3** — L'onglet **« Care »** (icône cœur) est présent dans la barre du bas.
  - Si **absent** : soit le rôle est MEMBRE, soit l'abonnement MEMBER_CARE n'est pas actif → vérifier (cf. P3 du web, même curl).

---

## 11. Tests Mobile — segment « Suivi »

### MT1 — Liste de suivi (UC-MCR-03)
**Étapes** : ouvrir l'onglet **Care** → segment **« Suivi »** (actif par défaut).
**Attendu** :
- [ ] **MT1.1** — Liste des fiches en cartes : **pastille couleur** + Nom Prénom + sous-ligne « statut · téléphone ».
- [ ] **MT1.2** — Barre de **recherche** (loupe) en haut.
- [ ] **MT1.3** — Rangée de **chips de filtre** : « Tous » + un chip par statut actif.
- [ ] **MT1.4** — Bouton **« + Nouvelle fiche »**.
- [ ] **MT1.5** — Liste vide → carte d'empty state (icône + texte « aucune fiche »).
- [ ] **MT1.6** — **Pull-to-refresh** : tirer vers le bas recharge la liste + la redevabilité.

### MT2 — Filtres & recherche (UC-MCR-03)
- [ ] **MT2.1** — Tap sur un chip statut → la liste se restreint à ce statut ; re-tap → revient à « Tous ».
- [ ] **MT2.2** — Saisie dans la recherche → filtre par nom (rechargement à chaque frappe).
- [ ] **MT2.3** — Chip « Tous » désélectionne le filtre statut.

### MT3 — Créer une fiche (UC-MCR-01)
**Étapes** : « + Nouvelle fiche » → écran `new`.
**Attendu** :
- [ ] **MT3.1** — Si le périmètre a **plusieurs unités** : un bloc « Unité » avec chips de sélection. Si **une seule unité** : elle est **présélectionnée** et le bloc est masqué.
- [ ] **MT3.2** — Champs **Prénom** + **Nom** (requis), Téléphone, Email, **Statut** (chips), Note (multiligne).
- [ ] **MT3.3** — Valider sans unité → alerte « choisir une unité ».
- [ ] **MT3.4** — Valider sans prénom/nom → alerte « nom requis ».
- [ ] **MT3.5** — Création OK → **redirige directement vers la fiche créée** (`record/[id]`), pas vers la liste.
- [ ] **MT3.6** — La croix (×) en haut ferme l'écran sans créer.

### MT4 — Fiche détaillée + timeline (UC-MCR-04)
**Étapes** : tap sur une fiche dans la liste.
**Attendu** :
- [ ] **MT4.1** — En-tête : Prénom Nom + **pastille statut** (couleur du référentiel).
- [ ] **MT4.2** — Carte infos : 📞 Téléphone, ✉️ Email, 📅 Première rencontre, Note (« non renseigné » si vide).
- [ ] **MT4.3** — Section **« Cheminement / Historique »** : timeline triée **du plus récent au plus ancien**, format `ancien → nouveau`, date longue, note.
- [ ] **MT4.4** — Fiche neuve : timeline avec l'entrée initiale (`→ statut initial`) ou message « aucun historique ».
- [ ] **MT4.5** — Le bloc « Changer le statut » **et** l'icône corbeille n'apparaissent **que si `canEdit = true`**.

### MT5 — Changer le statut (UC-MCR-02)
**Préconditions** : fiche ouverte, `canEdit = true`.
**Étapes** :
1. Dans « Changer le statut », tap un **chip de statut différent** de l'actuel.
2. Un champ **note** + un bouton **« Enregistrer »** apparaissent (seulement quand le statut choisi ≠ statut courant).
3. (Optionnel) saisir une note, puis Enregistrer.

**Attendu** :
- [ ] **MT5.1** — Tant que le chip sélectionné = statut courant, **ni champ note ni bouton** ne s'affichent (pas de MAJ inutile — couvre MCR-02/A1).
- [ ] **MT5.2** — Après enregistrement : la fiche se recharge, pastille à jour, **nouvelle entrée** en tête de timeline avec la note.
- [ ] **MT5.3** — Le champ note se vide après enregistrement.

### MT6 — Supprimer une fiche *(mobile only)*
**Préconditions** : fiche ouverte, `canEdit = true`.
**Étapes** : tap l'**icône corbeille** (haut droite) → dialogue de confirmation → confirmer.
**Attendu** :
- [ ] **MT6.1** — Un **dialogue de confirmation** (style destructif) s'affiche avant suppression.
- [ ] **MT6.2** — Annuler → rien ne se passe.
- [ ] **MT6.3** — Confirmer → retour à la liste, la fiche a disparu (soft-delete back).
- [ ] **MT6.4** — La corbeille est **absente** si `canEdit = false` (superviseur lecture seule).

---

## 12. Tests Mobile — segment « Redevabilité »

### MT7 — Vue d'ensemble (UC-MCR-06)
**Étapes** : onglet Care → segment **« Redevabilité »**.
**Attendu** :
- [ ] **MT7.1** — Une carte par unité : nom, « X fiches · mis à jour <date / jamais> », **badge d'état**.
- [ ] **MT7.2** — Badge : **Vide** (gris, 0 fiche) / **À jour** (vert) / **En retard** (terracotta/rouge).
- [ ] **MT7.3** — Périmètre vide → carte d'empty state (« aucune unité »).
- [ ] **MT7.4** — Le périmètre listé correspond au rôle (DIRIGEANT = sa/ses unités ; superviseur = son sous-arbre).

### MT8 — Relancer un dirigeant (UC-MCR-07)
**Préconditions** : ≥1 unité **En retard**.
**Étapes** : sur une carte « En retard », tap l'**icône cloche** → confirmer le dialogue.
**Attendu** :
- [ ] **MT8.1** — L'icône cloche n'apparaît **que** sur les unités en retard (pas sur À jour / Vide).
- [ ] **MT8.2** — Dialogue de confirmation mentionnant l'unité.
- [ ] **MT8.3** — Confirmer → notification **« Rappel envoyé »**.
- [ ] **MT8.4** *(anti-spam MCR-07/A1)* — Relancer 2× le même jour → message d'erreur back (« Rappel impossible »).

---

## 13. Mobile — Permissions, i18n, robustesse

### MT9 — Superviseur lecture seule (UC-MCR-04/A1)
**Préconditions** : compte superviseur (LEADER) sur une unité dont il n'est pas DIRIGEANT.
- [ ] **MT9.1** — Fiche ouvrable, infos + timeline visibles.
- [ ] **MT9.2** — **Pas** de bloc « Changer le statut », **pas** d'icône corbeille (`canEdit = false`).

### MT10 — i18n & robustesse
- [ ] **MT10.1** — Basculer la langue du compte (FR/EN) → libellés Care traduits, aucune clé brute (`care.xxx`).
- [ ] **MT10.2** — Couper le réseau pendant une création → notification d'échec, pas de crash.
- [ ] **MT10.3** — Revenir sur l'onglet Care (focus) recharge automatiquement les données (`useFocusEffect`).
- [ ] **MT10.4** — Token expiré → comportement de déconnexion attendu (retour login).

### Écarts mobile connus (ne pas signaler comme bugs)
- Pas d'édition des champs identité/contact après création (seul le **statut** est modifiable) — comme le web.
- Pas de lien compte / config / export dans l'app (cf. §6).
- Indicateurs globaux d'en-tête et code couleur « échéance proche » du UC-MCR-06 non rendus (seuls Vide/À jour/En retard).

### Ordre de passage conseillé (Mobile)
1. §10 Prérequis (MP1→MP3) — **bloquant** (surtout MP3 : onglet visible).
2. MT1 → MT6 (Suivi, DIRIGEANT — dont la suppression mobile).
3. MT7 → MT8 (Redevabilité, superviseur).
4. MT9 (lecture seule).
5. MT10 (i18n / robustesse).

> 💡 Le **journal de bugs (§8)** et les **vérifs curl (§7)** s'appliquent aux deux plateformes (même backend prod).
