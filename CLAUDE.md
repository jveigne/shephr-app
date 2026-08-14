# CLAUDE.md — shephr-app

## Vue d'ensemble

Monorepo des **applications d'un ministère** : c'est la surface utilisée par les fidèles et les dirigeants d'un ministère donné, par opposition au back-office plateforme (`shephr-webapp`).

```
shephr-app/
├── web/       « Espace ministère » — React 18 + Vite (SPA, déployée sur Vercel)
├── mobile/    Application Expo / React Native (iOS · Android · web Expo)
└── docs/      goals-test-plan.md
```

Les deux surfaces consomment le **même backend** `cmfipraise-backend` (Spring Boot 3.2 / Java 17) et **le même modèle de rôles**. Elles ne partagent aucun code : chaque dossier a son `package.json`, son `node_modules`, son i18n et sa copie des types API. Toute évolution de contrat doit donc être portée **des deux côtés** (voir « Points d'attention » n°1).

### Les trois dépôts de l'écosystème

| Dépôt | Rôle | Audience |
|---|---|---|
| `cmfipraise-backend` | API REST multi-tenant par `Ministry` | — |
| **`shephr-app`** (ici) | espace ministère (web) + app mobile | dirigeants & membres **d'un** ministère |
| `shephr-webapp` | back-office JExcellence, cross-tenant | `SUPER_ADMIN` plateforme uniquement |

### Répartition des rôles entre surfaces

| | mobile | web (`Espace ministère`) | `shephr-webapp` |
|---|---|---|---|
| Simple membre (`MEMBRE` + rattaché) | ✅ usage principal | ⚠ espace minimal « Mes objectifs » (`MemberShell`) | ❌ |
| Dirigeant (`DIRIGEANT_UNITE`→`DIRIGEANT_COORDINATEUR`) | ✅ | ✅ pilotage & administration de son périmètre | ❌ |
| `LEADER` / `SECRETARIAT` (ministère-large) | ✅ | ✅ (lecture large ; `SECRETARIAT` crée nation/région/ville) | ❌ |
| `superAdmin` | ✅ | ✅ | ✅ |

---

## Modèle de rôles (commun aux deux surfaces)

```ts
type ModuleRole =
  | 'MEMBRE'                  // 0
  | 'DIRIGEANT_UNITE'         // 1 — assemblée de maison
  | 'DIRIGEANT'               // 2 — ville (ex-« team leader »)
  | 'DIRIGEANT_SENIOR'        // 3 — région / état
  | 'DIRIGEANT_COORDINATEUR'  // 4 — nation
  | 'LEADER' | 'SECRETARIAT'  // 5 — ministère-large (VIEWERS, pas managers)
```

- ⚠ **`DIRIGEANT_LEADER` n'existe plus** (renommé `DIRIGEANT_SENIOR` au Lot 3.5) et `DIRIGEANT_UNITE` a été ajouté. Le `CLAUDE.md` du backend est encore partiellement sur l'ancienne nomenclature — **la vérité est `com.excellence.back.auth.ModuleRole`**.
- Un compte porte **un rôle par module** (`donationRole`, `goalRole`, potentiellement différents) + un booléen transverse **`superAdmin`**.
- **`managerRank(me)`** = rang max parmi les rôles **manager** uniquement ; `LEADER`/`SECRETARIAT` valent **0** en autorité (ils voient tout, n'administrent rien). Cette fonction est le miroir exact de `managerRank` côté backend — la modifier sans le backend crée des 403 silencieux.
- Helpers de gating (dans `authApi.ts` des deux surfaces) : `isLeaderRole`, `hasGoalsAccess`, `hasMemberGoals`/`hasMemberSpace`, `hasMinistryAccess` (web), `canManageStructure`, `canManageZones`, `canManageUnits`, `canManageUsers`, `isSecretariat`, `isCityLeader`, `isAssemblyLeaderOnly`, `assignableRoles`/`assignableLeaderRoles`.

### Vocabulaire structurel (« Chantier B »)

Arbre à 4 niveaux — identifiants techniques inchangés, libellés métier nouveaux :

| Technique | Métier | Backend |
|---|---|---|
| `COUNTRY` | **Nation** | `org_country` |
| `ZONE` | **Région** ou **État** | `org_zone` |
| `LOCALITY` | **Ville** | `org_locality` |
| `UNIT` | **Assemblée de maison** | `org_unit` (`ASSEMBLY` uniquement) |

Le niveau `TEAM` est supprimé, le type d'unité `CENTER` aussi.

### Deux gating orthogonaux

1. **Rôle** (`ModuleRole` + périmètre géographique) — qui voit/écrit quoi.
2. **Abonnement au module** — `GET /api/me/accessible-modules` renvoie les codes accessibles (`DONATIONS`, `GOALS`, `MEMBER_CARE`…). Un module non couvert est **invisible** (RG-06), pas juste désactivé. Côté backend, l'accès est aussi refusé par `@RequiresModule` (403 `MODULE_ACCESS_DENIED`).

Un utilisateur peut donc avoir le rôle requis **et** se voir refuser l'accès faute d'abonnement.

---

## Authentification (commune)

```
POST /api/church/auth/login      { identifier, password } → { token, user }
POST /api/church/auth/register   inscription libre (compte non rattaché) → enchaîne sur /join
GET  /api/church/auth/me         → MeResponse (rôles, périmètre, langue, noms résolus)
DELETE /api/church/auth/me       suppression RGPD → { mode: 'DELETED' | 'ANONYMIZED' }
GET  /api/cmfipraise/auth/invitation/{token}            + POST .../accept
GET  /api/cmfipraise/auth/invitation/code/{shortCode}   + POST .../code/accept
GET  /api/me/accessible-modules  → { moduleCodes: [] }
```

⚠ **Identités séparées par application (JP 30/07)** : Shephr s'authentifie sur son **propre identifiant** (`t_user.username`), **jamais** sur l'email. Les écrans affichent « Email » — c'est un libellé, pas un contrat : la saisie part dans `identifier`. Deux comptes distincts peuvent porter la même chaîne, un par application.
*(À ne pas confondre avec `shephr-webapp`, qui se connecte lui sur `/api/cmfipraise/auth/login` par email.)*

Le `MeResponse` porte le périmètre **par IDs** (`goalUnitId`, `goalCityId`/`goalCityIds`, `goalZoneId`/`goalZoneIds`, `goalCountryIds`, `coordinatedCountryIds`) **et par noms déjà résolus** (`unitNames`, `cityNames`, `zoneNames`, `countryNames`) pour l'affichage — préférer les noms résolus plutôt que de re-requêter la structure.

---

## `web/` — Espace ministère

### Stack
React 18 · Vite 5 (`@vitejs/plugin-react`) · TS **strict** · react-query 5 · react-router 6 · **axios** · react-i18next · `react-simple-maps` + `d3-geo` (carte des nations). Aucune librairie UI : primitives maison (`components/ui.tsx`) + `theme/styles.css`.

### Structure

```
web/src/
├── App.tsx              Routes + QueryClient (staleTime 30 s, retry 1, pas de refetch on focus)
├── AppShell.tsx         Espace dirigeant — garde `canAccessWeb` (= hasMinistryAccess)
├── MemberShell.tsx      Espace membre minimal — garde `canAccessMemberSpace`
├── config/features.ts   Flags de livraison { donations: false, goals: true }
├── components/          ui.tsx (Button…TopBar, Picker, Table, Modal, Drawer), charts.tsx,
│                        NationsMap, GoalTimeline, YearPicker, GeoPicker, CountryDialPicker,
│                        SupervisorCard, Sidebar, Toast, Icon/icons, LangSwitch
├── hooks/useAuth.tsx    AuthProvider (token, me, login/register/establishSession/refreshMe/logout)
├── i18n/                index.ts + locales/{fr,en}.json (37 sections)
├── pages/               voir routes ci-dessous
├── services/            apiClient (axios + interceptors) + 1 module par domaine
└── utils/               format, download, isoNumeric
```

### Routes et gardes

| Zone | Routes | Garde |
|---|---|---|
| **Publique** | `/` (landing), `/login`, `/signup`, `/activate`, `/invitation/:token`, `/delete-account` (+`/supprimer-compte`), `/privacy` (+`/confidentialite`) | aucune |
| **Onboarding** | `/join` | authentifié, **hors shell** (compte sans rattachement) |
| **`MemberShell`** | `/my-goals`, `/member-settings`, `/member-contact` | `goalRole === 'MEMBRE'` **et** `goalUnitId` |
| **`AppShell`** | `/dashboard`, `/donations`, `/goals`, `/member-care`, `/users`, `/structure/{ministeres,pays,zones,localites,unites}`, `/hierarchy`, `/requests`, `/exports`, `/settings`, `/contact` | `hasMinistryAccess` = `superAdmin` ou tout rôle module > `MEMBRE` |

`/delete-account` et `/privacy` sont **exigées par Google Play** — ne pas les supprimer ni les mettre derrière une garde.

### Feature flags (`config/features.ts`)

```ts
export const FEATURES = { donations: false, goals: true } as const;
```

Flags de **livraison client**, pas de configuration produit — leur historique est documenté en tête du fichier (« Member Care only » JP 2026-06-27, puis mise en avant des Goals JP 2026-07-10). Ils pilotent : les routes (`App.tsx`), les entrées de menu (`Sidebar.tsx`) et la page d'accueil `HOME`. Réactiver un pan = repasser le flag à `true` (rien d'autre à toucher).

### Services

| Fichier | Domaine |
|---|---|
| `apiClient.ts` | axios, `baseURL = VITE_API_BASE_URL ?? ''`, injection du Bearer, **interception globale des 401** |
| `authApi.ts` | auth, invitations, helpers de rôles, `getAccessibleModules` |
| `adminApi.ts` | utilisateurs (`/api/church/admin/users`) + structure org (`/countries`, `/zones`, `/localities`, `/units`, `/continents`, `/ministries`) |
| `goalsApi.ts` | module Goals (584 lignes) — pledges, progress, faith, agrégats, timeline, drill, deadlines, rappels |
| `memberCareApi.ts` | suivi pastoral (`/api/church/member-care`) |
| `donationApi.ts`, `statsApi.ts` | dons + statistiques (masqués par `FEATURES.donations`) |
| `joinRequestsApi.ts`, `structureRequestsApi.ts` | demandes de rattachement / de création de structure |
| `leadersApi.ts` | organigramme, superviseur, discipulat |
| `contactApi.ts` | `GET /api/app/contact` (coordonnées de support pilotées par le back-office) |

**Gestion de session** : sur 401 d'un appel authentifié, `apiClient` purge le token et délègue à `setSessionExpiredHandler` (posé par `AuthProvider`) qui vide le cache react-query et navigue en SPA vers `/login?next=…`. Les endpoints de `CREDENTIAL_ENDPOINTS` (`/auth/login`, `/auth/register`, `/auth/invitation`) sont exclus : un 401 y signifie « identifiants refusés », pas « session expirée ». Ne pas ajouter `/auth/me` à cette liste.

**Changement d'utilisateur** : `establishSession` et `logout` appellent `queryClient.clear()` — le cache est scopé au périmètre du compte, une fuite ferait voir à un dirigeant de zone les données d'un coordinateur.

---

## `mobile/` — application Expo

### Stack
Expo SDK 54 · React Native 0.81 · React 19 · **expo-router** (routing par fichiers, `typedRoutes`) · axios · AsyncStorage · react-i18next · react-native-svg · reanimated. Fonts Google : **Fraunces** (serif, titres/montants), **Inter** (corps), **JetBrains Mono** (codes/références).

### Structure

```
mobile/
├── app/                        expo-router
│   ├── _layout.tsx             Stack racine + providers (Language, Auth) + fonts + splash
│   ├── index.tsx               Redirection /(tabs)/home ↔ /(auth)/login
│   ├── (auth)/                 login · signup · activate (code court) · join (rattachement)
│   ├── (tabs)/                 home · donations · goals/ · leader/ · care/ · profile
│   ├── declare.tsx             modale de déclaration de don
│   ├── donation/[id].tsx, donation/edit/[id].tsx
│   ├── structure.tsx, membres.tsx, hierarchie.tsx, superviseur.tsx, invite.tsx
├── components/                 UI atomiques + NotificationGate + GoalAggregates…
├── contexts/                   AuthContext (token, me, modules) · LanguageContext
├── constants/                  categories, goalCategories, dialCodes, contact, features(⚠ inutilisé)
├── hooks/useGoalsData.ts       agrégat pledges + progress par catégorie (`GoalLine`)
├── services/                   apiClient + 16 modules API
├── theme/                      colors.ts (moss/parchment/earth/ink) + typography.ts + radii
├── utils/                      format, dialogs, demandes, i18n/ (fr + en, 32 sections)
└── docs/architecture.md        ⚠ partiellement obsolète (voir Points d'attention n°6)
```

### Onglets et visibilité (`app/(tabs)/_layout.tsx`)

| Onglet | Condition (`href: … ? path : null`) |
|---|---|
| `home`, `profile` | toujours |
| `donations` | `hasDonations` (abonnement `DONATIONS` — RG-06) |
| `goals` | `hasGoals` (dirigeant+ Goals) **ou** `hasMemberGoals(me)` (membre rattaché) |
| `leader` (« Périmètre ») | `hasDonations && isLeader` |
| `care` (suivi pastoral) | `isLeader && hasMemberCare` |
| `demandes` | **commenté** dans le code |

Un onglet masqué se fait avec `href: null`, pas en retirant le `<Tabs.Screen>`.

### NotificationGate

Monté au-dessus des tabs : une seule modale à la fois, dans l'ordre (1) campagnes serveur `APP_UPDATE`/`INFO`/`PROMO` (snooze 3 jours, re-check au premier plan), puis (2) rappels personnels non lus. Endpoints `/api/notifications` et `/api/church/me/notifications`.

### URL de l'API (piège classique)

`app.json` › `extra.API_URL` pointe **la production Railway**. `services/apiClient.resolveApiUrl()` ne bascule sur l'IP du poste de dev (dérivée du `hostUri` Metro, port 8080) **que si** la valeur configurée contient `localhost`. Donc, en l'état, `expo start` tape la **prod**, y compris sur simulateur. Pour développer contre un backend local : passer `extra.API_URL` à `http://localhost:8080` (et ne pas committer ce changement).

---

## Build & run

```bash
# --- Espace ministère (web) ---
cd web && npm install
npm run dev            # http://localhost:5173 (proxy /api → localhost:8080)
npm run build          # tsc -b && vite build
npm run lint
npx tsc --noEmit       # typecheck seul

# --- Mobile ---
cd mobile && yarn install     # packageManager: yarn 1.22
npx expo start                # + i / a / w
npm run android | ios | web
npm run lint                  # expo lint
npx tsc --noEmit

# --- Backend attendu en local ---
cd ../cmfipraise-backend
mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=local"   # JDK 17 obligatoire
```

Variables : `VITE_API_BASE_URL` pour `web/` (⚠ nom différent de `VITE_API_URL` dans `shephr-webapp`) ; `extra.API_URL` d'`app.json` pour le mobile. Aucun `.env` n'est versionné.

**Aucun test automatisé** dans ce dépôt. La vérification minimale avant de conclure : `npx tsc --noEmit` dans la surface touchée (propre des deux côtés au 2026-08-14) + `npm run lint`. Les plans de test sont **manuels** : `docs/goals-test-plan.md`, `web/MEMBER_CARE_TEST_PLAN.md`.

---

## Conventions

- **i18n obligatoire** : aucune chaîne visible en dur. Toute clé ajoutée l'est dans `fr.json` **et** `en.json` de la surface concernée (`web/src/i18n/locales/`, `mobile/utils/i18n/locales/`). Les deux arbres sont **indépendants** — une clé web n'existe pas côté mobile.
- **Langue** : `me.language` (`'FR'|'EN'`) n'est appliquée **que si** l'utilisateur n'a pas encore choisi explicitement dans l'app (`applyUserLanguage` web / `applyAccountLanguage` mobile). Ne pas écraser un choix explicite.
- **Données serveur** : react-query côté web (`useQuery`/`useMutation` + `invalidateQueries`). Côté mobile, pas de react-query : `useState` + `useFocusEffect` (cf. `hooks/useGoalsData.ts`) — suivre le pattern local plutôt que d'introduire une seconde approche.
- **Types API = miroirs des DTO backend**, annotés `Mirrors com.excellence.back.…`. Garder le commentaire à jour en même temps que le champ.
- **Erreurs axios** : message utile dans `err.response.data.message` (helper `errMsg` dans les pages). Les 422 métier portent un code à traiter explicitement (`USERNAME_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS`, `USER_LEADS_ORPHAN_NODES`, `SUPER_ADMIN_SELF_DELETE`).
- **Style web** : tokens CSS de `theme/styles.css` (`var(--green-800)`, `var(--ink-500)`, `var(--font-serif)`…) en `style={{}}` inline ou classes existantes ; pas de framework utilitaire.
- **Style mobile** : `StyleSheet.create` + tokens de `theme/` (`colors.moss`, `colors.parchment`, `radii.md`, `fonts.sans`). La palette est **identique** à celle du web et de `shephr-webapp` — ne pas introduire de couleur en dur.
- **Commentaires** : le code porte beaucoup de commentaires de **décision** (« RDG 25/07 », « JP 31/07 », « Lot 3.5 », « Chantier B », « RG-06 »). Ils sont la mémoire produit du projet : les conserver et en ajouter au même format lorsqu'une règle métier est encodée.

---

## Règles métier de référence (Goals)

- **RG-08** — engagement effectif d'un niveau = `MAX(agrégat des enfants, meilleure foi du niveau)` ; la source affichée est `AGGREGATE` ou `FAITH`.
- **RG-11** — un `progress` reste éditable/supprimable **24 h**, par son créateur seulement.
- **Verrouillage** — après `submit`, les pledges passent `locked = true` ; le déverrouillage est réservé aux niveaux autorisés (`/units/{id}/unlock`, `/member/{id}/unlock`).
- **Annualisation** — un `Goal` expose `currentYear`, `openYears` (droit d'écriture) et `visibleYears` (affichage) ; toutes les vues acceptent `?year=` (helper `yq()`).
- **Anti-spam** — un rappel à un dirigeant non soumis est bloqué 24 h côté backend.
- **Server-driven** — `editable` / `editableUntil` sur `PledgeResponse` : ne pas recalculer la fenêtre d'édition côté client, l'afficher.

---

## Points d'attention

1. **`authApi.ts` est dupliqué entre `web/` et `mobile/`, et les deux copies ont divergé.** Exemple concret : `canManageStructure` vaut `COORDINATEUR ou SENIOR` côté web, mais `tout manager (rang ≥ DIRIGEANT_UNITE)` côté mobile. Avant de « corriger » l'une, vérifier laquelle correspond au backend (`requireCanManage*`) — et porter le changement des deux côtés en le notant.

2. **`mobile/constants/features.ts` n'est importé nulle part** — c'est du code mort. Le masquage des Dons sur mobile vient en réalité du serveur (`hasDonations` ← `/api/me/accessible-modules`). Ne pas s'appuyer sur ce fichier ; côté web au contraire, `config/features.ts` est bien actif.

3. **`web/src/pages/Goals.tsx` fait ~2800 lignes** (23 sous-composants dans un seul fichier : formulaires, blocs d'agrégat, drill nation→région→ville→assemblée, carte, deadlines). Toute intervention doit rester **locale** au sous-composant concerné ; ne pas entreprendre de découpage opportuniste sans demande explicite.

4. **Le mobile tape la production par défaut** (`app.json` › `extra.API_URL`). Voir « URL de l'API » ci-dessus avant tout test local.

5. **Aucune interception de 401 côté mobile** (contrairement au web) : un token expiré produit des erreurs par appel, sans redirection automatique vers le login.

6. **`mobile/docs/architecture.md` est daté** : il décrit l'app à l'époque « module donation » (tabs, endpoints, « web companion à décider »). Les tabs Goals / Care, l'organigramme, les demandes et l'onboarding n'y figurent pas. Utiliser le présent fichier comme référence ; corriger ce doc si on y touche.

7. **`web/MEMBER-CARE-RESTE-A-FAIRE-20260629-1713.md`** liste un reste-à-faire précis (suppression de fiche, etc.) **et** un hors-périmètre explicitement décidé (config de fréquence, export CSV) — vérifier avant d'implémenter une fonctionnalité Member Care « manquante » : elle peut avoir été refusée.

8. **Les endpoints org existent sous deux préfixes** côté backend : `/api/church/admin/**` (utilisé ici) et `/api/org/admin/**` (utilisé par `shephr-webapp`). Même contrôleur, mêmes contrats. Ne pas « unifier » un frontend sans regarder l'autre.

9. **Lectures ouvertes, écritures gardées** : les endpoints de structure sont lisibles par tout membre du ministère ; seules les écritures sont contrôlées (le backend renvoie 403). Le gating front sert à ne pas afficher de boutons inutiles — il ne remplace pas la garde serveur, et ne doit pas être « assoupli » pour contourner un 403.

10. **`web/src/services/authApi.ts` conserve un type legacy `UserRole = 'MEMBER'|'LEADER'|'ADMIN'`** (et `LeaderLevel`) hérité de l'ancien modèle. Son commentaire dit « still used by adminApi/Users page » — c'est faux aujourd'hui : plus aucune référence dans `web/src`. Code mort, à ne pas réutiliser.
