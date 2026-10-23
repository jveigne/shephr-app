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
| Simple membre (`MEMBRE` + rattaché) | ✅ usage principal | ⚠ espace minimal « Mes objectifs » + « Mes actions » (`MemberShell` ; « Mes actions » = vue dédiée, les actions de **son assemblée seule** : compteur, programmés, réalisés, Déclarer / Programmer — D-EVT-14) | ❌ |
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
- Helpers de gating (dans `authApi.ts` des deux surfaces) : `isLeaderRole`, `hasGoalsAccess`, `hasMemberGoals`/`hasMemberSpace`, `hasMinistryAccess` (web), `canManageStructure`, `canManageZones`, `canManageUnits`, `canManageUsers`, `isSecretariat`, `isCityLeader`, `isAssemblyLeaderOnly`, `assignableRoles`/`assignableLeaderRoles`, `isAttachedAccount` (Documents : `superAdmin`, rôle module > `MEMBRE` ou `goalUnitId` — même définition que `hasMinistryAccess || hasMemberSpace`).

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
2. **Abonnement au module** — `GET /api/me/accessible-modules` renvoie les codes accessibles (`DONATIONS`, `GOALS`, `MEMBER_CARE`, `ASSEMBLY`, `STUDY`, `EVENTS`, `DOCUMENTS`…). Un module non couvert est **invisible** (RG-06), pas juste désactivé. Côté backend, l'accès est aussi refusé par `@RequiresModule` (403 `MODULE_ACCESS_DENIED`).

Un utilisateur peut donc avoir le rôle requis **et** se voir refuser l'accès faute d'abonnement.

⚠ L'**abonnement payant** (facturation Stripe, Points d'attention n°16) n'est **pas** ce gating : payer n'ouvre aucun module (D-ABO-01, JP 23/10). L'accès reste la couverture `sub_subscription` activée à la main par le SUPER_ADMIN.

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
POST /api/auth/oauth/google | /apple   connexion Google / Apple — mobile seulement
```

**Google / Apple (mobile)** : `components/auth/SocialSignInButtons.tsx` (écran `(auth)/login`) + `services/socialSignIn.ts` / `socialAuthApi.ts`. Depuis D-ABO-14 (JP 23/10, lot ABO8, renverse la décision 2 du 15/10), la connexion fédérée est **ouverte à tous les comptes**, rôles compris (superAdmin, dirigeants, LEADER, SECRETARIAT, trésoriers) : `PrivilegedAccountPolicy` est supprimée côté backend et `PRIVILEGED_ACCOUNT_REQUIRES_PASSWORD` n'est plus levé (traduction conservée dans `mobile/utils/socialAuthErrors.ts`). Les boutons ne dépendent que de la plateforme et des fournisseurs, jamais du rôle. Le **web** (espace ministère) et `shephr-webapp` restent au mot de passe (aucun bouton Google / Apple).

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
├── config/features.ts   Flags de livraison { donations: false, goals: true, assembly: true, events: true, study: true }
├── config/links.ts      Domaine des liens universels (`VITE_SHARE_BASE_URL`, P1 Documents) ; config/stores.ts liens stores (P2)
├── components/          ui.tsx (Button…TopBar, Picker, Table, Modal, Drawer), charts.tsx,
│                        NationsMap, GoalTimeline, YearPicker, GeoPicker, CountryDialPicker,
│                        SupervisorCard, Sidebar, Toast, Icon/icons, LangSwitch,
│                        Event{Declare,Detail,Form,PeriodFilter,StatsDrill}, EventsTable (module EVENTS),
│                        MySubscriptionsLink (« Mes abonnements » des deux shells, si le compte paie un abonnement)
├── hooks/useAuth.tsx    AuthProvider (token, me, login/register/establishSession/refreshMe/logout)
├── i18n/                index.ts + locales/{fr,en}.json (37 sections)
├── pages/               voir routes ci-dessous (dont Study.tsx — module STUDY ; Billing.tsx — offres, retour Stripe, mes abonnements)
├── services/            apiClient (axios + interceptors) + 1 module par domaine
└── utils/               format, download, isoNumeric, meetingReport (texte du CR, §5.4),
                         events (dates locales, périodes, libellés de type, messages d'erreur EVENTS),
                         documents (visitorId, plateforme, journal du lecteur public)
web/api/document-page.ts Fonction Vercel : `/d/{slug}` avec balises OpenGraph (D-DOC-10), réécrite par vercel.json avant la règle SPA
web/public/.well-known/  apple-app-site-association + assetlinks.json (liens universels `/d/*` ; `/e/*` à n'ajouter **qu'avec** la route mobile `app/e/*`, sinon iOS ouvre l'app sur « route introuvable »)
```

### Routes et gardes

| Zone | Routes | Garde |
|---|---|---|
| **Publique** | `/` (landing), `/login`, `/signup`, `/activate`, `/invitation/:token`, `/delete-account` (+`/supprimer-compte`), `/privacy` (+`/confidentialite`), `/d/:slug` (lecteur public d'un document partagé, `pages/DocumentReader.tsx`, chargé en `lazy` — aperçu seul, D-DOC-05), `/abonnements` (offres payantes, `pages/Billing.tsx` — Points d'attention n°16) | aucune |
| **Facturation** (hors shell) | `/abonnements/retour?ref=`, `/abonnements/mes-abonnements` | authentifié, **tout compte**, rattaché ou non (D-ABO-05/07) ; sans session → `/login?next=` |
| **Onboarding** | `/join` | authentifié, **hors shell** (compte sans rattachement) |
| **`MemberShell`** | `/my-goals`, `/my-assembly` (`FEATURES.assembly` + abonnement `ASSEMBLY`), `/my-actions` (`FEATURES.events` + abonnement `EVENTS` ; vue membre dédiée `pages/MyActions.tsx`, distincte de `/events` — D-EVT-14), `/my-study` (`FEATURES.study` + abonnement `STUDY`, `pages/Study.tsx` — D-ETU-31), `/member-settings`, `/member-contact` | `goalRole === 'MEMBRE'` **et** `goalUnitId` |
| **`AppShell`** | `/dashboard`, `/donations`, `/goals`, `/assembly`, `/study` (`FEATURES.study` + abonnement `STUDY`, D-ETU-31), `/events`, `/member-care`, `/users`, `/structure/{ministeres,pays,zones,localites,unites}`, `/hierarchy`, `/requests`, `/exports`, `/settings`, `/contact` | `hasMinistryAccess` = `superAdmin` ou tout rôle module > `MEMBRE` |

`/delete-account` et `/privacy` sont **exigées par Google Play** — ne pas les supprimer ni les mettre derrière une garde. `/d/:slug` est la cible des **liens universels** des Documents (voir Points d'attention n°14) : publique elle aussi, jamais derrière une garde. `/abonnements` aussi (lien du pied de page de la landing).

### Feature flags (`config/features.ts`)

```ts
export const FEATURES = { donations: false, goals: true, assembly: true, events: true, study: true } as const;
```

Flags de **livraison client**, pas de configuration produit — leur historique est documenté en tête du fichier (« Member Care only » JP 2026-06-27, puis mise en avant des Goals JP 2026-07-10, puis Évènements lot E8 du 14/10, puis Étude `study` lot ETU9 du 23/10). Ils pilotent : les routes (`App.tsx`), les entrées de menu (`Sidebar.tsx`, `MemberShell.tsx`) et la page d'accueil `HOME`. Réactiver un pan = repasser le flag à `true` (rien d'autre à toucher). `assembly`, `events` et `study` sont **en plus** gatés par l'abonnement (`accessible-modules`, RG-06) : flag à `true` ne suffit pas à afficher le menu.

### Services

| Fichier | Domaine |
|---|---|
| `apiClient.ts` | axios, `baseURL = VITE_API_BASE_URL ?? ''`, injection du Bearer, **interception globale des 401** |
| `authApi.ts` | auth, invitations, helpers de rôles, `getAccessibleModules` |
| `adminApi.ts` | utilisateurs (`/api/church/admin/users`) + structure org (`/countries`, `/zones`, `/localities`, `/units`, `/continents`, `/ministries`) |
| `goalsApi.ts` | module Goals (584 lignes) — pledges, progress, faith, agrégats, timeline, drill, deadlines, rappels |
| `memberCareApi.ts` | suivi pastoral (`/api/church/member-care`) — fiches adressées par **`userId`** du membre (refonte 23/09) |
| `assemblyApi.ts` | Vie d'assemblée (`/api/church/assembly`, module `ASSEMBLY`) — assemblées, roster, réunions/CR, modules d'enseignement, avancement ; **Étude** (`/study/**`, module `STUDY` depuis l'avenant 03 — D-ETU-28, plan 21/10 : catalogue, séances, résultats, copies papier, ajustements, avancement — pas de pilotage ni de réponse sur le web, D-ETU-14) |
| `documentsApi.ts` | Documents (module `DOCUMENTS`) — lecture **publique** par lien (`/api/public/documents/{slug}`, `/preview`, `/events`) pour le lecteur `/d/:slug`. Miroirs de `DocumentDtos`. Pas d'espace Documents sur le web (D-DOC-14) |
| `eventsApi.ts` | Évènements & recensement (`/api/church/events`, module `EVENTS`) — types, `/me/scopes`, déclarer/programmer (idempotent sur `clientId`), « Mes actions », agenda, détail, clôture, « à vérifier », statistiques. Miroirs de `EventDtos` |
| `billingApi.ts` | Abonnements payants (`/api/public/billing/offers`, `/api/church/billing/**` : aperçu de code, caisse, abonnements, portail Stripe, factures + PDF). Miroirs du contrat §10 (`BillingDtos`). Ne touche jamais `accessible-modules` (D-ABO-01) |
| `donationApi.ts`, `statsApi.ts` | dons + statistiques (masqués par `FEATURES.donations`) |
| `joinRequestsApi.ts`, `structureRequestsApi.ts` | demandes de rattachement / de création de structure |
| `leadersApi.ts` | organigramme, superviseur, discipulat |
| `contactApi.ts` | `GET /api/app/contact` (coordonnées de support pilotées par le back-office) |

**Gestion de session** : sur 401 d'un appel authentifié, `apiClient` purge le token et délègue à `setSessionExpiredHandler` (posé par `AuthProvider`) qui vide le cache react-query et navigue en SPA vers `/login?next=…`. Les endpoints de `CREDENTIAL_ENDPOINTS` (`/auth/login`, `/auth/register`, `/auth/invitation`) sont exclus : un 401 y signifie « identifiants refusés », pas « session expirée ». Ne pas ajouter `/auth/me` à cette liste.

**Changement d'utilisateur** : `establishSession` et `logout` appellent `queryClient.clear()` — le cache est scopé au périmètre du compte, une fuite ferait voir à un dirigeant de zone les données d'un coordinateur.

---

## `mobile/` — application Expo

### Stack
Expo SDK 57 · React Native 0.86 · React 19.2 · **expo-router** (routing par fichiers, `typedRoutes`) · axios · AsyncStorage · react-i18next · react-native-svg · reanimated. Fonts Google : **Fraunces** (serif, titres/montants), **Inter** (corps), **JetBrains Mono** (codes/références).

### Structure

```
mobile/
├── app/                        expo-router
│   ├── _layout.tsx             Stack racine + providers (Language, Auth) + fonts + splash
│   ├── index.tsx               Redirection /(tabs)/home ↔ /(auth)/login
│   ├── (auth)/                 login · signup · activate (code court) · join (rattachement)
│   ├── (tabs)/                 home · donations · goals/ · leader/ · assembly/ · events/ · care/ · profile
│   ├── declare.tsx             modale de déclaration de don
│   ├── donation/[id].tsx, donation/edit/[id].tsx
│   ├── events/                 declare (modale) · mine (« Mes actions ») · plan (modale) · [id] (détail)
│   ├── d/[slug].tsx            lecteur d'un document partagé (lien universel `/d/{slug}?r=`, module DOCUMENTS)
│   ├── documents/index.tsx     espace Documents (tuile d'accueil `hasDocuments`, pas un onglet — D-DOC-14)
│   ├── billing/index.tsx       « Mes factures » (consultation + téléchargement seuls, D-ABO-13), depuis `profile` si `GET /billing/subscriptions` est non vide
│   ├── study/                  Étude de l'assemblée (tuile « Le Message de Bertoua ») : index · session/[id] (3 temps) · results/[id] · progress
│   ├── structure.tsx, membres.tsx, hierarchie.tsx, superviseur.tsx, invite.tsx
├── components/                 UI atomiques + NotificationGate + GoalAggregates + EventQueueSync, Event{Agenda,Form,Row,PeriodPicker,StatsDrill}… + StudyQuestionList (questions d'étude : saisie, correction, ajustement)
│                               + documents/PdfReader (react-native-pdf, chargé seulement si le module natif est présent ; `.web.tsx` pour Expo web)
├── contexts/                   AuthContext (token, me, modules, hasMemberCare, hasAssembly, hasStudy, hasEvents, hasDocuments) · LanguageContext
├── constants/                  categories, goalCategories, dialCodes, contact, links (`SHARE_DOMAIN`, P1 Documents), features(⚠ inutilisé)
├── hooks/                      useGoalsData (agrégat pledges + progress, `GoalLine`) · useDonationCategories ·
│                               useEventCatalog (types + nœuds de saisie EVENTS, mémoire + AsyncStorage)
├── services/                   apiClient + modules API (dont eventsApi) + eventQueue (file hors-ligne EVENTS)
│                               + sessionCache (dernier profil connu, lancement hors ligne)
│                               + documentsApi + documentReadCache (relecture hors ligne des documents)
│                               + returnTarget (retour après connexion sur un lien universel, générique `/d/*` · `/e/*`)
│                               + studyDraft (brouillon hors ligne d'une copie d'étude + dernière séance reçue)
│                               + billingApi (mes abonnements / factures, PDF → cache + expo-sharing ; aucun achat, D-ABO-13)
├── theme/                      colors.ts (moss/parchment/earth/ink) + typography.ts + radii
├── utils/                      format, dialogs, demandes, meetingReport (texte du CR), events, eventErrors, i18n/ (fr + en)
└── docs/architecture.md        ⚠ partiellement obsolète (voir Points d'attention n°6)
```

### Onglets et visibilité (`app/(tabs)/_layout.tsx`)

| Onglet | Condition (`href: … ? path : null`) |
|---|---|
| `home`, `profile` | toujours |
| `donations` | `hasDonations` (abonnement `DONATIONS` — RG-06) |
| `goals` | `hasGoals` (dirigeant+ Goals) **ou** `hasMemberGoals(me)` (membre rattaché) |
| `leader` (« Trésorerie ») | `hasDonations && isTreasurer` (jamais `isLeader`) |
| `assembly` (Vie d'assemblée) | `isLeader && hasAssembly` (abonnement `ASSEMBLY`) |
| `events` (Évènements) | `canDeclareEvents(me) && hasEvents` (abonnement `EVENTS`) — contenu selon le rôle (D-EVT-14, JP 14/10) : agenda + statistiques si `isLeader` (dirigeants, LEADER/SECRETARIAT, superAdmin) ; sinon `EventMemberView`, la vue de son assemblée (spec §6.1), la même que `app/events/mine` |
| `care` (suivi pastoral) | `isLeader && hasMemberCare` |
| `demandes` | **commenté** dans le code |

Les **Documents** ne sont **pas** un onglet (D-DOC-14) : tuile de `home` si `hasDocuments` (abonnement `DOCUMENTS`) **et** `isAttachedAccount(me)`, vers `app/documents`.
De même, l'**Étude de l'assemblée** n'est pas un onglet : tuile « Le Message de Bertoua » de `home` si `hasStudy && isAttachedAccount(me)` (abonnement `STUDY`, D-ETU-28 — remplace D-ETU-05), vers `app/study`, pastille « En cours » si `/study/me` porte une séance ouverte.

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

**Aucun test automatisé** dans ce dépôt. La vérification minimale avant de conclure : `npx tsc --noEmit` dans la surface touchée (propre des deux côtés au 2026-08-14) + `npm run lint`.

- ⚠ **`web/` : `npm run lint` ne s'exécute pas** (`sh: eslint: command not found`, code 127) — `eslint` n'est pas dans `web/package.json` et il n'y a aucune config ESLint. Constaté au 14/10 ; seuls `tsc` et `npm run build` vérifient le web.
- **`mobile/` : `tsc` s'appuie sur `.expo/types/router.d.ts`** (non versionné, généré par `expo start` avec `typedRoutes`). Après l'ajout d'une route (ex. `app/events/*`, `app/(tabs)/events`), un fichier périmé fait échouer `tsc` (TS2345 sur `router.push`) : le régénérer par un bref `npx expo start`. Les plans de test sont **manuels** : `docs/goals-test-plan.md`, `web/MEMBER_CARE_TEST_PLAN.md`.

---

## Conventions

- **i18n obligatoire** : aucune chaîne visible en dur. Toute clé ajoutée l'est dans `fr.json` **et** `en.json` de la surface concernée (`web/src/i18n/locales/`, `mobile/utils/i18n/locales/`). Les deux arbres sont **indépendants** — une clé web n'existe pas côté mobile.
- **Langue** : `me.language` (`'FR'|'EN'`) n'est appliquée **que si** l'utilisateur n'a pas encore choisi explicitement dans l'app (`applyUserLanguage` web / `applyAccountLanguage` mobile). Ne pas écraser un choix explicite.
- **Données serveur** : react-query côté web (`useQuery`/`useMutation` + `invalidateQueries`). Côté mobile, pas de react-query : `useState` + `useFocusEffect` (cf. `hooks/useGoalsData.ts`) — suivre le pattern local plutôt que d'introduire une seconde approche.
- **Types API = miroirs des DTO backend**, annotés `Mirrors com.excellence.back.…`. Garder le commentaire à jour en même temps que le champ.
- **Erreurs axios** : message utile dans `err.response.data.message` (helper `errMsg` dans les pages). Les 422 métier portent un code à traiter explicitement (`USERNAME_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS`, `USER_LEADS_ORPHAN_NODES`, `SUPER_ADMIN_SELF_DELETE`).
- **Style web** : tokens CSS de `theme/styles.css` (`var(--green-800)`, `var(--ink-500)`, `var(--font-serif)`…) en `style={{}}` inline ou classes existantes ; pas de framework utilitaire.
- **Style mobile** : `StyleSheet.create` + tokens de `theme/` (`colors.moss`, `colors.parchment`, `radii.md`, `fonts.sans`). La palette est **identique** à celle du web et de `shephr-webapp` — ne pas introduire de couleur en dur.
- **Imports mobile** : imports internes en `@/` (alias tsconfig `"@/*": ["./*"]`, résolu nativement par Metro depuis le SDK 50 — aucune config babel/metro) ; plus aucun chemin relatif `./` ou `../` (JP 14/10).
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

5. **Aucune interception de 401 côté mobile** (contrairement au web) : un token expiré produit des erreurs par appel, sans redirection automatique vers le login. Depuis le lot E6 (14/10, RG-ACT-08), la **restauration de session** ne retire le jeton que sur un vrai refus (401 / 403) : sans réseau ou sur une panne serveur, `AuthContext` repart du dernier profil et des derniers modules connus (`services/sessionCache.ts`, liés au compte **et** au jeton) et revalide au retour du réseau / du premier plan. Un `apiClient` appelé avec un en-tête `Authorization` explicite le garde (file EVENTS, `pushApi.supprimerAppareil`) : ne pas « simplifier » l'intercepteur.

6. **`mobile/docs/architecture.md` est daté** : il décrit l'app à l'époque « module donation » (tabs, endpoints, « web companion à décider »). Les tabs Goals / Care, l'organigramme, les demandes et l'onboarding n'y figurent pas. Utiliser le présent fichier comme référence ; corriger ce doc si on y touche.

7. **`web/MEMBER-CARE-RESTE-A-FAIRE-20260629-1713.md`** liste un reste-à-faire précis (suppression de fiche, etc.) **et** un hors-périmètre explicitement décidé (config de fréquence, export CSV) — vérifier avant d'implémenter une fonctionnalité Member Care « manquante » : elle peut avoir été refusée.

8. **Les endpoints org existent sous deux préfixes** côté backend : `/api/church/admin/**` (utilisé ici) et `/api/org/admin/**` (utilisé par `shephr-webapp`). Même contrôleur, mêmes contrats. Ne pas « unifier » un frontend sans regarder l'autre.

9. **Lectures ouvertes, écritures gardées** : les endpoints de structure sont lisibles par tout membre du ministère ; seules les écritures sont contrôlées (le backend renvoie 403). Le gating front sert à ne pas afficher de boutons inutiles — il ne remplace pas la garde serveur, et ne doit pas être « assoupli » pour contourner un 403.

10. **`web/src/services/authApi.ts` conserve un type legacy `UserRole = 'MEMBER'|'LEADER'|'ADMIN'`** (et `LeaderLevel`) hérité de l'ancien modèle. Son commentaire dit « still used by adminApi/Users page » — c'est faux aujourd'hui : plus aucune référence dans `web/src`. Code mort, à ne pas réutiliser.

11. **Vie d'assemblée (module `ASSEMBLY`, plan `cmfipraise-backend/docs/shephr/23_09_2026`)** : réunions et comptes rendus (CR), modules d'enseignement (créés par SUPER_ADMIN dans `shephr-webapp`, `/admin/teaching-modules`), avancement. **Lecture** = périmètre visible (`getAllVisibleUnitIds`, RG-ASM-05 : chaîne, géographie, LEADER/SECRETARIAT) ; **écriture** = `DIRIGEANT_UNITE` de l'assemblée uniquement (`canWrite`, D-ASM-03). Le texte copiable du CR est généré côté client par **deux copies** de `utils/meetingReport.ts` (web : clés `assembly.report.*`, mobile : `assemblyLife.report.*`), qui doivent produire le même texte au caractère près (modèle §5.4 du plan) : toute modification se porte des deux côtés.

12. **Member Care = accès par chaîne de superviseurs, jamais par la géographie (D-ASM-04/05, 23/09).** Une fiche = un compte `MEMBRE` rattaché (`goalUnitId`), automatique, adressée par `userId` ; plus de création, suppression, liaison ni export. **Lecture** : `DIRIGEANT_UNITE` de l'assemblée courante du membre + ses superviseurs (`supervisor_id`, récursif) + `superAdmin` (lecture seule). LEADER, SECRETARIAT et la géographie (ville/région/nation) ne voient **aucune** fiche. **Écriture** (statut, note) : `DIRIGEANT_UNITE` de l'assemblée uniquement (`canEdit`). Les présences viennent des CR si `ASSEMBLY` est actif (`attendanceEnabled`). Redevabilité (`/overview`, relances) : gelée (D-ASM-09).

13. **Évènements & recensement (module `EVENTS`, plan `cmfipraise-backend/docs/shephr/14_10_2026`, contrat `02_Contrat_API_Evenements.md`)** : un seul objet `Event` (D-EVT-01) ; une « action d'évangélisation » est un évènement d'un type `evangelism = true` (catalogue par ministère, créé par SUPER_ADMIN dans `shephr-webapp`, `/admin/event-types`). Cycle `PLANNED → DONE | CANCELLED` (D-EVT-02) : une **déclaration** terrain naît `DONE` (date jamais future), une **programmation** naît `PLANNED` — D-EVT-13 (JP 14/10, remplace D-EVT-08) : programmer n'est **pas** une prérogative du dirigeant, on programme exactement là où l'on déclare (MEMBRE dans son assemblée, dirigeant à son niveau ou dessous, SECRETARIAT partout, LEADER partout par conséquence de la règle — RG-EVT-03). Rattachement à **un** nœud (`scopeLevel` `COUNTRY`/`ZONE`/`LOCALITY`/`UNIT` + `scopeId`) : un évènement de ville compte une fois, à la ville, dans aucune assemblée (D-EVT-04). **Comptés** (D-EVT-03) : `DONE`, non supprimés, type évangélique — « à vérifier » ne retire **jamais** du total (RG-ACT-07) ; **aucun objectif** affiché (D-EVT-06). **Prédicateur** (D-EVT-16, JP 14/10) : champ `preacher` (texte libre ≤ 120, facultatif) réservé, comme les compteurs de D-EVT-15, à un type évangélique — ignoré / remis à null sinon ; saisi juste après le type et la date (création, modification, « marquer comme réalisé », où `""` l'efface), en évidence dans le détail et sur les lignes quand il est renseigné ; aucune statistique par prédicateur. **Invités** (D-EVT-17, JP 14/10) : compteur `guests` facultatif, **tout type**, part extérieure **incluse** dans `participants` ; si les deux sont renseignés, `guests ≤ participants` sur l'état résultant (création, PATCH, `/done`), sinon 422 `EVENT_GUESTS_EXCEED_PARTICIPANTS` — contrôlé avant envoi (bouton inactif), sommé dans les statistiques comme `participants`, affiché « 40 participants dont 12 invités ». **Lecture** = géographie classique (D-EVT-07, à l'inverse de Member Care) **+ l'assemblée principale** (`goalUnitId`) du compte (D-EVT-13) ; LEADER / SECRETARIAT tout le ministère ; un évènement d'un ancêtre est lisible (lecture « par le haut »), jamais modifiable ni compté en dessous. **Simple membre** (D-EVT-14, JP 14/10 — aucun rôle de dirigeant, ni LEADER / SECRETARIAT, ni superAdmin) : il ne lit **que** son assemblée (tous types, évènements des autres compris) et ses propres évènements — pas de lecture « par le haut » (`includeAncestors` sans effet, `GET /{id}` d'un évènement de sa ville / région / nation → 403), jamais une assemblée sœur ; il a une vue **dédiée** (contrat §3.12), un dirigeant rattaché à une assemblée garde la vue dirigeant. Lire n'ouvre aucune gestion : un membre ne modifie / clôture / annule / supprime que **ses** évènements et ne pose jamais « à vérifier » ; les dirigeants du périmètre gardent leurs droits sur les évènements programmés par des membres. Les droits viennent **du serveur** (`canDeclare` / `canPlan` de `/me/scopes`, `canEdit` / `canFlag` de chaque `EventResponse`) : ne jamais les recalculer côté client. Toute création porte un `clientId` UUID tiré **une fois par saisie** (RG-EVT-07) : rejouer renvoie 200 et l'existant. Mobile : seules les **déclarations** passent par la file hors-ligne (`services/eventQueue.ts`, `shephr.eventQueue.v1`, vidée au démarrage / premier plan / retour réseau par `EventQueueSync`) ; le tri « définitif / reste en file » suit **à la lettre** le tableau §3.3 du contrat (401, 403 `MODULE_ACCESS_DENIED`, 400 non qualifié, 5xx et réseau restent). File et catalogue (`useEventCatalog`) sont liés au **compte** (`me.id`), pas au jeton. `expo-crypto` est chargé par `requireOptionalNativeModule` (un binaire ancien ne plante pas) : refaire le dev build / EAS avant un test sur appareil. Web : `/events` (AppShell, `pages/Events.tsx` : Agenda · Déclarer · Statistiques, bouton « Programmer » sur l'agenda si `canPlan` ; onglet par défaut Statistiques pour le SECRETARIAT, D-EVT-09, sinon Agenda) et `/my-actions` (MemberShell, `pages/MyActions.tsx`, D-EVT-14) : compteur ce mois / cette année de l'assemblée (**un** `/stats` sur l'année locale), « Programmés » puis « Actions d'évangélisation » réalisées de l'assemblée (`GET /` sur `UNIT` = `goalUnitId`, `includeAncestors=false`), pastille « Moi » sur ses évènements (`createdById`), boutons « Déclarer » / « Programmer » en modale ; aucun onglet, sélecteur de nœud ni descente statistique. Les deux pages partagent les briques `EventForm`, `EventDetailModal`, `EventsTable` / `EventsBlock` et `utils/events`. Les types et clients sont **dupliqués** web / mobile (`services/eventsApi.ts`) : tout changement de contrat se porte des deux côtés, et dans `shephr-webapp/src/services/eventTypeService.ts` pour le back-office.

14. **Documents & liseuse (module `DOCUMENTS`, plan `cmfipraise-backend/docs/shephr/18_10_2026`, contrat `02_Contrat_API_Documents.md`)** : un PDF publié par SUPER_ADMIN dans `shephr-webapp` (`/documents`, routes backend `/admin/documents` et `/admin/document-categories`, D-DOC-07) se partage par **un seul lien** `https://<SHARE_DOMAIN>/d/{slug}` (slug base62 de 10 caractères, non devinable ; « régénérer » l'invalide). **PDF seuls** (D-DOC-02) : aucune image de page, aucun filigrane — la seule image est la vignette `cover.jpg` (page 1) pour l'aperçu WhatsApp (D-DOC-10). **Aperçu = second PDF** (D-DOC-03) : le backend découpe `preview.pdf` (les `freePages` premières pages) à l'upload ; le PDF complet n'est **jamais** signé pour une requête anonyme ni pour un compte non rattaché (RG-DOC-01b). **Le web n'affiche jamais que l'aperçu** (D-DOC-05, JP 18/10), même connecté, même sur ordinateur (mur : stores, QR code, « Ouvrir dans l'app » `shephr://d/{slug}`) ; seule exception, un document `open = true` (D-DOC-06, champ distinct de `freePages`). **Lecture complète = app + compte connecté et rattaché** (`isAttachedAccount`, D-DOC-04) via `GET /api/church/documents/{slug}/file` — non connecté : mur « Se connecter / Créer un compte » ; non rattaché : mur « Rejoindre mon assemblée » (`/join`). Un lien se lit **quel que soit l'abonnement du lecteur** : seul compte l'abonnement `DOCUMENTS` du ministère du document (D-DOC-12, à confirmer — P5) ; `hasDocuments` ne gate que l'espace Documents de l'app (tuile d'accueil, D-DOC-14 ; aucun espace Documents sur le web). Lien inconnu, dépublié, expiré, régénéré ou ministère sans `DOCUMENTS` → « Ce document n'est plus disponible » (404 / 410, RG-DOC-02). Les fronts **ne composent jamais** le lien de partage : ils prennent `shareUrl` (`POST /events` `SHARE` → `?r={shareRef}`, D-DOC-11). Mesure sans IP ni cookie tiers (D-DOC-15) : `visitorId` aléatoire (`localStorage` `shephr.visitorId` / AsyncStorage), `/privacy` complétée. Sur `/api/public/documents/**`, le backend **ignore** un jeton invalide (jamais 401) — ne pas « corriger » cela, l'intercepteur 401 du web purgerait la session depuis un lien public. Mobile : lecteur natif `react-native-pdf` (+ `react-native-blob-util`, plugins `@config-plugins/*`), chargé seulement si le module est dans le binaire ; cache disque `${slug}-v${version}.pdf` + `services/documentReadCache.ts` (relecture hors ligne) ; Expo web → `iframe` vers le lecteur web ; **retour après connexion** générique (`services/returnTarget.ts` + `utils/authRouting.routeHomeOrReturn`) — refaire un **build EAS** avant tout test sur appareil. **Liens universels partagés avec `/e/*`** (Évènements, cadrage 14/10) : un seul domaine, un seul `apple-app-site-association` / `assetlinks.json` (`web/public/.well-known/`), `vercel.json` réécrit `/d/:slug` vers `web/api/document-page.ts` (OpenGraph) avant la règle SPA et exclut `api/` et `.well-known/`. **Placeholders à remplacer** (prérequis JP non fournis, une source par valeur) : `www.shephr.org` (P1 — web `VITE_SHARE_BASE_URL` / `src/config/links.ts`, mobile `constants/links.ts` **et** `app.json` `associatedDomains` + `intentFilters`, à changer ensemble), liens App Store / Play Store fournis le 20/10 (P2, `web/src/config/stores.ts` — boutons inactifs tant qu'ils ne sont pas en `https://`), Team ID Apple `Q9QK5S76RP` (fourni le 20/10) / SHA-256 Play `B0:A7:…:26:70` (fourni le 20/10) (P3, `web/public/.well-known/`), `TODO_API_PUBLIC_BASE_URL` (env Vercel `API_PUBLIC_BASE_URL` de la fonction OpenGraph) ; côté backend `DOCUMENTS_SHARE_BASE_URL` et `R2_*` (P4). Types et clients **dupliqués** web / mobile (`services/documentsApi.ts`) et `shephr-webapp/src/services/documentService.ts` : tout changement de contrat se porte des trois côtés.

15. **Étude de l'assemblée (module `STUDY`, plan `cmfipraise-backend/docs/shephr/21_10_2026`, contrat `02_Contrat_API_Etude.md`, avenant `03_Avenant_Module_Etude.md` du 23/10)** : questionnaire en réunion, programme « Le Message de Bertoua » (libellé i18n **fixe**, D-ETU-04 — `study.tile.title` mobile). **Module d'abonnement à part `STUDY`** (D-ETU-28, JP 23/10 — remplace D-ETU-05 : l'étude n'est plus gatée par `ASSEMBLY`) ; sans `STUDY`, 403 `MODULE_ACCESS_DENIED` même avec `ASSEMBLY`. **Lien avec la Vie d'assemblée = le catalogue partagé** (`TeachingModule` / `TeachingChapter`, D-ETU-29) : le CR note les chapitres lus, la séance porte sur un chapitre — aucune clé entre séance et CR. **Suggestion dans le CR** (D-ETU-30, ministère qui a les deux modules, front seulement) : à la **création** d'un CR à la date D, si une séance de l'assemblée a été ouverte le jour D (date locale), son chapitre est pré-coché, modifiable, seulement si le dirigeant n'a encore rien coché (`GET /study/units/{id}/sessions?year=`, année voisine aussi interrogée un 1er janvier / 31 décembre car le serveur range l'année en UTC ; toute erreur = pas de suggestion) — web `pages/Assembly.tsx`, mobile `app/(tabs)/assembly/form.tsx`. Unité = `TeachingModule` existant (+ `code`, `prerequisiteModuleId`), leçon = `TeachingChapter` (+ `portion`) — D-ETU-01/02 ; questions, import JSON (module importé **inactif**, activé après relecture, D-ETU-17) et contrôle de cohérence (`STUDY_CONTENT_INVALID`, RG-ETU-22) dans la page **existante** `/modules-enseignement` de `shephr-webapp`. Séance **indépendante du CR** (D-ETU-03 : Journal, présences, avancement de lecture et Member Care inchangés). Cycle `REPONSES_OUVERTES → CORRECTION → TERMINEE` (+ `REPONSES_OUVERTES → TERMINEE` pour une séance oubliée, *Annuler* en `REPONSES_OUVERTES` seulement — D-ETU-22), une seule séance non terminée par assemblée (RG-ETU-02), prérequis bloquant **par assemblée** (D-ETU-19). **Pilotage** (Commencer, Correction, Terminer, Annuler, copie papier, ajustement) = `DIRIGEANT_UNITE` de l'assemblée (`leader` du serveur, D-ETU-07) ; **répondants** = tout compte dont `goalUnitId` est l'assemblée, quel que soit son rôle, + ses dirigeants (D-ETU-06) ; **résultats / avancement au-dessus** = géographie (`canView`, D-ETU-08). Notes calculées **par le serveur** (RG-ETU-05..11 ; *Juste* 100 % / *À préciser* 50 % / *À revoir* 0, ouverte sans avis = 0, D-ETU-12) : ne jamais recalculer côté client. **Confidentialité** : le contenu d'une copie (`GET /study/copies/{id}`) n'est lisible que par son **auteur** et les `DIRIGEANT_UNITE` de l'assemblée — ni la hiérarchie, ni LEADER / SECRETARIAT, ni le superAdmin (D-ETU-09, RG-ETU-13) ; un **simple membre** ne voit que **sa** note et **sa** progression, jamais celles des autres (D-ETU-10 — le backend filtre `results.copies` / `unitProgress.members` à lui seul) ; une `PERSONNELLE` ne s'affiche **jamais** pendant l'échange des téléphones (RG-ETU-08 : « Question personnelle — répondu ✓ ») — sur mobile, le lien *Résultats* du panneau dirigeant est masqué en `CORRECTION` et une copie ouverte masque ses `PERSONNELLE` tant que la séance n'est pas `TERMINEE` : ne pas « simplifier ». Réponses du manuel (`answerKey`, `expectedAnswer`) envoyées au répondant à partir de `CORRECTION` seulement (RG-ETU-12). Routes `/api/church/assembly/study/**` (chemins inchangés, `StudyController`, `@RequiresModule("STUDY")`) : `me`, `catalog[?unitId]`, `sessions` (+ `/{id}/correction`, `/finish`, `DELETE`), `sessions/{id}` (relu ≈ 5 s au premier plan, **pas de temps réel**, D-ETU-23), `/my-answers` (lot, upsert par question, `answeredAt` du téléphone, tolérance `correctionAt + 2 min`, rejets dans `ignoredQuestionIds` — RG-ETU-04 ; **pas** de `clientId` ni d'`eventQueue`, D-ETU-11) + `/my-answers/{questionId}/review`, `/results`, `/paper-copies` (même séance terminée, D-ETU-13), `copies/{id}` (+ `PATCH`/`DELETE` papier, `PATCH …/answers/{questionId}` ajustement), `units/{id}/sessions?year=`, `units/{id}/progress`, `progress`, `me/progress`, `members/{userId}/progress` ; progression = meilleure note par leçon, séances `TERMINEE` seulement (D-ETU-18, RG-ETU-17). **Mobile** (prioritaire) : tuile de `home` (`hasStudy && isAttachedAccount(me)`, `hasStudy` = code `STUDY` d'`accessible-modules` dans `AuthContext`, pastille « En cours » via `/study/me`) → `app/study/index` (contenu selon le rôle : dirigeant, répondant, ou avancement du périmètre si `/study/me` est vide), `app/study/session/[id]` (un écran, trois temps selon `status`), `results/[id]`, `progress` (`?unitId=` ou `?mine=1`), `components/StudyQuestionList.tsx` ; **brouillon hors ligne** `services/studyDraft.ts` (AsyncStorage `shephr.studyDraft.v1.{userId}.{sessionId}`, lié au **compte**, garde aussi le dernier détail de séance pour la rouvrir sans réseau, purgé à `TERMINEE` / annulation) ; i18n `study.*`. **Web** (D-ETU-14 : ni pilotage ni réponse) : page à part `pages/Study.tsx` (D-ETU-31 — l'onglet Étude a quitté `pages/Assembly.tsx`), routes `/study` (`AppShell`) et `/my-study` (`MemberShell`), gardes `FEATURES.study` + abonnement `STUDY`, entrée de menu « Le Message de Bertoua » (`nav.study`, libellé fixe) dans `Sidebar.tsx` et `MemberShell.tsx` ; rien d'affiché tant que `/study/catalog` est vide ; séances, résultats, copie papier, ajustement, avancement par membre et vue d'ensemble, carte « Mon avancement » au répondant ; i18n `assembly.study.*` (conservées) + `nav.study`, `assembly.studySuggested`. RGPD : la suppression d'un compte supprime ses copies d'étude et leurs réponses (`SelfAccountDeletionExecutor`, à confirmer par JP). Types **dupliqués** web / mobile (`services/assemblyApi.ts`, mêmes noms que le contrat §8) et `shephr-webapp/src/services/teachingModuleService.ts` (back-office) : tout changement de contrat se porte des trois côtés.

16. **Abonnements payants (facturation Stripe, plan `cmfipraise-backend/docs/shephr/23_10_2026/01_Plan_Abonnements_Payants.md`, contrat `02_Contrat_API_Abonnements.md`)** : **paiement ≠ accès** (D-ABO-01, JP 23/10) — un abonnement payant est un objet **de facturation** (`bil_subscription`, package `com.excellence.back.billing`), il n'active **jamais** de module : l'accès reste `sub_subscription` / `accessible-modules`, ouvert à la main par le SUPER_ADMIN (RG-SUB-07) ; aucun front ne doit déduire un accès d'un statut de paiement, ni l'inverse. Offres = données du back-office (seed `couverture-service` « Frais de couverture du service », 9 999 cts TTC / mois ; **EUR et mensuel seuls**, D-ABO-03) ; code promo = **pourcentage** sur toute la durée, calculé **par le serveur** (Stripe reçoit un prix déjà réduit, aucun coupon ; HALF_UP, plancher 100 cts — D-ABO-04, RG-ABO-05) : ne jamais recalculer un prix côté client, n'afficher que les centimes reçus (`Intl.NumberFormat` selon la langue, §6.4). **Payeur = compte connecté** (D-ABO-05), plusieurs abonnements par compte / ministère (D-ABO-06), **le payeur seul** voit ses abonnements et factures (D-ABO-07 — ressource d'un autre payeur → 404) ; le SUPER_ADMIN peut changer payeur et ministère. Cycle `PENDING → ACTIVE ⇄ PAST_DUE → CANCELED`, `PENDING → EXPIRED` (RG-ABO-07) ; le statut ne vient **que** des webhooks Stripe signés, jamais du retour navigateur (RG-ABO-08). Impayé : relance par email, **aucune coupure** (D-ABO-10). Facture `SHE-{AAAA}-000001` par mois payé, TVA 20 % incluse, PDF joint à l'email (D-ABO-08/09). **Routes** : public `GET /api/public/billing/offers` (jeton ignoré, comme `/api/public/documents/**`) ; payeur `/api/church/billing` — `promo-codes/{code}/preview?offer=` (10 / min / compte, 429), `POST /checkout` → `{ url }`, `subscriptions[/{reference}]`, `POST subscriptions/{reference}/portal` (422 `BILLING_PORTAL_UNAVAILABLE` sans client Stripe ou si le client Stripe n'a pas été créé pour le payeur actuel), `invoices`, `invoices/{number}/pdf` ; Stripe `POST /api/billing/webhooks/stripe` ; SUPER_ADMIN `/admin/billing/{overview,offers,promo-codes,subscriptions,invoices}` (+ `/cancel`, `/pdf`, `/resend`, `/export.csv`). Sans clé Stripe, caisse / portail / résiliation → 503 `PAYMENT_PROVIDER_UNAVAILABLE` (D-ABO-12). Codes d'erreur : contrat §9 + ajouts du §12 — tous traduits sous `billing.errors.*`. **Web** (lot ABO4, `pages/Billing.tsx`, hors shell) : `/abonnements` publique (cartes d'offres, champ code, bandeau `?annule=1` ; « S'abonner » déconnecté → `/login?next=/abonnements?code=…`, connecté → `POST /checkout` puis `window.location = url` ; un 401 du `/me` au démarrage n'y renvoie pas vers `/login`), `/abonnements/retour?ref=` (relit toutes les 3 s, 10 lectures max, tant que `PENDING` ; arrêt à la première erreur), `/abonnements/mes-abonnements` (tout compte connecté, rattaché ou non : statut, prix, échéance, résiliation demandée, « Gérer mon abonnement » / « Mettre à jour ma carte » → portail Stripe, factures + PDF). `/login` suit un `next` vers `/abonnements…` **pour tout compte** (avant : les non-rattachés partaient sur `/join`) ; `/signup` ne porte pas de `next`. Liens : pied de page de `Landing.tsx` et `components/MySubscriptionsLink.tsx` (bas de la sidebar des deux shells, si `GET /subscriptions` non vide). Les URL de retour Stripe sont composées **par le serveur** (`BILLING_FRONT_URL`), jamais par le front. **Mobile = consultation seule** (D-ABO-13, règles App Store 3.1.1 / Google Play Billing) : `app/billing/index.tsx` « Mes factures » (abonnements + factures, PDF → `expo-file-system` cache puis `expo-sharing` ; Expo web : lien de téléchargement), entrée dans `profile` si `GET /subscriptions` non vide (revérifiée au focus, masquée sur erreur) ; **aucun** appel `checkout` / `portal` / `preview`, aucun bouton, lien ni texte invitant à payer, sur iOS **et** Android — `services/billingApi.ts` ne reprend volontairement ni `BillingOffer`, ni `PromoPreview`, ni `CheckoutResponse` : ne pas les « compléter ». **Back-office** (`shephr-webapp`, lot ABO6, D-ABO-15) : page `/facturation` (`pages/Facturation.tsx`, entrée « Facturation » de la `Sidebar`) — Vue d'ensemble · Abonnements (tiroir : instantanés, ministère, payeur, notes, Résilier fin de période / immédiat, lien `/abonnements?ministryId=` vers l'**accès aux modules**, page qui garde son rôle) · Factures (PDF, renvoi, export CSV) · Offres · Codes promo ; service `services/billingService.ts`. **Variables** (backend, placeholders `REMPLACER_…` tant que JP ne les a pas fournies) : `SHEPHR_STRIPE_SECRET_KEY`, `SHEPHR_STRIPE_WEBHOOK_SECRET`, `BILLING_FRONT_URL`, `BILLING_INVOICE_PREFIX` (`SHE`), `BILLING_SELLER_{NAME,ADDRESS,SIREN,VAT_NUMBER}`, `BILLING_SUPPORT_EMAIL` ; aucune variable nouvelle côté fronts (le web prend le domaine de `config/links.ts`). Côté Stripe (à faire par JP) : point de terminaison webhook (7 événements du contrat §5), Customer Portal, Smart Retries, emails Stripe aux clients **désactivés**. Le nom des fichiers PDF / CSV est composé par les fronts (`{numéro}.pdf`, `factures[-from][-to].csv`) : `Content-Disposition` n'est pas exposé en CORS. Types **dupliqués** dans les trois fronts sous les **mêmes noms** (contrat §10, `Mirrors com.excellence.back.billing.BillingDtos…`) : `web/src/services/billingApi.ts`, `mobile/services/billingApi.ts` (sous-ensemble payeur), `shephr-webapp/src/services/billingService.ts` (+ types `Admin*` du §6) — tout changement de contrat se porte des trois côtés.
