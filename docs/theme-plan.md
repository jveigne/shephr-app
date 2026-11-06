# Shephr — Thème (sombre, noir et blanc, couleur d'accent) synchronisé entre web et mobile

> **Statut : spec corrigée le 06/11/2026 d'après la relecture de Jean Philippe
> (`docs/theme-reco-philippe.md`), à valider.** Aucun code n'est écrit avant sa validation.
> Rédigée par Catherine, sur la base de `main` de `shephr-app` et de `cmfipraise-backend`.
> Les décisions B1 à B5 de Jean Philippe (06/11) sont reportées au §3.

---

## 1. Objectif

Reprendre le travail fait sur CMFIPraise (PR #14) pour l'application Shephr, avec deux différences :

1. **Deux surfaces** : l'Espace ministère **web** (`shephr-app/web`) **et** l'app **mobile**
   (`shephr-app/mobile`). Le back-office `shephr-webapp` (SUPER_ADMIN) n'est **pas** concerné.
2. **Le choix est sauvegardé sur le compte** (backend, table dédiée `user_preference`) : un
   utilisateur connecté qui change de thème sur le web le retrouve sur le mobile, et inversement.

L'utilisateur connecté choisit, dans l'écran **Apparence** :
- un **mode** : Automatique (suit le système), Clair, Sombre, Noir et blanc ;
- une **couleur d'accent** : 6 pastilles proposées ou un code hexa libre.

La **luminosité** est prise en compte : le mode Automatique suit le réglage clair / sombre du
téléphone ou du navigateur, et tout accent est ajusté pour rester lisible (contraste WCAG).

---

## 2. État des lieux (mesuré sur `main`, 06/11/2026)

| | Mobile (`shephr-app/mobile`) | Web (`shephr-app/web`) |
|---|---|---|
| Stack | Expo 57, React Native 0.86, expo-router | React 18, Vite 5, react-router 6, react-query |
| Couleurs | `theme/colors.ts` (moss / parchment / earth / ink), importé **statiquement** | Variables CSS dans `theme/styles.css` (`--green-800`, `--ink-500`…) |
| Usages des jetons | **1 704** `colors.x` dans **92** fichiers | **~1 670** `var(--…)` |
| Couleurs en dur | **161** dans **42** fichiers (hors `theme/`) | **151** dans les `.ts` et `.tsx`, plus **86** dans `styles.css` |
| Thème sombre | Aucun. `app.json` : `userInterfaceStyle: "light"` | Aucun (pas de `data-theme`, pas de `prefers-color-scheme`) |
| Tests | Aucun framework de test | Aucun framework de test |
| Préférences du compte | `me.language` lu au login, jamais écrit | Idem |

**Conséquences**
- **Mobile** : le travail est le même que sur CMFIPraise : passer de couleurs fixes à des rôles lus
  via un hook. On réutilise l'infrastructure déjà écrite pour CMFIPraise (§4.2).
- **Web** : redéfinir les variables CSS par thème ne suffit **pas**. Une même variable sert à la fois
  de texte et de fond : les verts foncés (`--green-700/800/900`) sont utilisés **172 fois en texte
  et 21 fois en fond**. En Sombre, un vert foncé lisible en texte devient clair, donc illisible
  comme fond de bouton blanc. Il faut d'abord introduire des **rôles** (`--accent`, `--sur-accent`,
  `--texte`…) et migrer chaque usage vers le bon rôle (§4.4), puis seulement redéfinir les rôles
  par thème. S'y ajoutent les 86 couleurs en dur de `styles.css`.
- **Backend** : rien n'existe pour stocker une préférence d'affichage. Il faut l'ajouter.

---

## 3. Décisions

| # | Question | Décision | Statut |
|---|---|---|---|
| D1 | Les modes proposés | **Automatique, Clair, Sombre, Noir et blanc**, comme CMFIPraise. Clair reste le défaut. | à valider |
| D2 | Accent : défaut, pastilles, portée | Défaut : **vert mousse Shephr** (`#1E3A2F`). Pastilles : mousse, terre (`#A7754B`), argile (`#B86A4A`), bleu (`#1F5A8A`), violet (`#6B3FD4`), framboise (`#B4245E`), plus un hexa libre. **L'accent remplace seulement la famille verte** (moss / `--green-*`) ; la couleur **terre** reste la couleur secondaire, quel que soit l'accent. | **tranché (B4)** |
| D3 | Qu'est-ce qui est synchronisé ? | **Le mode et l'accent**, liés au **compte**. Les deux surfaces affichent donc le même thème. | à valider |
| D3b | Forme de la table `user_preference` | **(1) une colonne par préférence** (`theme_mode`, `theme_accent`…), une ligne par utilisateur : simple, typée, valeurs contrôlées par la base, mais une migration par nouvelle préférence ; **(2) clé / valeur** (`user_id`, `cle`, `valeur`) : aucune migration pour en ajouter, mais valeurs non typées. **Proposition : (1)**, plus lisible et plus sûre tant que seules les préférences de thème sont connues. | à valider |
| D4 | Utilisateur non connecté (login, inscription, pages publiques) | **Ni sélecteur ni envoi au compte.** Les pages publiques affichent le **dernier thème de l'appareil**, sinon le thème par défaut. Un compte **sans préférence** affiche le thème par défaut, jamais celui laissé sur l'appareil. **Seule une action dans l'écran Apparence envoie un `PUT`** : jamais la connexion, jamais un rafraîchissement. | **tranché (B2)** |
| D5 | Qui gagne entre l'appareil et le serveur ? | **Le serveur gagne, sauf si un envoi local est en attente.** Pas de comparaison de dates. Quand l'utilisateur change de thème, le choix s'applique tout de suite et un envoi est mis **en attente** (stocké sur l'appareil, lié au compte) ; tant qu'il l'est, une lecture du serveur n'écrase pas le choix local. Une fois l'envoi accepté, l'attente est levée et le serveur redevient la référence. | à valider |
| D6 | Délai de répercussion | **Pas de temps réel.** Au retour sur l'app (mobile, premier plan) ou sur l'onglet (web, focus / `visibilitychange`), la surface lit **`GET /me/preferences`**, et non `/me`. Sur le mobile, cette relecture est **à ajouter** : aujourd'hui `AuthContext` ne relit `/me` au premier plan que si le profil vient du cache (`mobile/contexts/AuthContext.tsx:354`). Sur le web, `refreshMe` recrée l'objet `me`, dont dépendent plusieurs effets : on ne l'appelle pas pour le thème. | à valider |
| D7 | À la déconnexion | Le thème reste affiché sur l'appareil (pas de retour brutal au Clair). L'envoi en attente du compte est abandonné. | à valider |
| D8 | Exceptions hors thème | L'**alerte** (supprimer, déconnexion, erreur) reste **rouge** dans tous les thèmes, Noir et blanc compris. En **Noir et blanc**, les **statuts** et les **couleurs de catégories** passent **en gris** : ce sont les libellés et les icônes qui les distinguent. La carte des nations et les graphiques gardent leurs couleurs de données en Clair et en Sombre, et passent en niveaux de gris en Noir et blanc. Les **journaux PDF** gardent leurs couleurs fixes, quel que soit le thème. | **tranché (B3)** |
| D9 | Tests automatiques | Les deux projets n'ont aucun framework de test. Proposition : ajouter **Vitest** au web (dépendance de développement uniquement) pour tester les calculs de couleur et la règle D5. Le mobile réutilise les mêmes fonctions, copiées (`CLAUDE.md` : les deux surfaces ne partagent pas de code). | à valider |
| D10 | Branches et PR | Une branche `feat/theme` dans **`shephr-app`** et une dans **`cmfipraise-backend`**, **à jour de `main`**. PR vers **`develop`**, une fois `develop` remis au niveau de `main` dans les deux dépôts : **aucune PR n'est ouverte avant cette remise à niveau.** | **tranché (B1)** |
| D11 | Landing et `/offres` | **Clair fixe** : ces pages ne suivent pas le thème et gardent l'accent par défaut (mise en œuvre au §4.3). | **tranché (B5)** |

---

## 4. Proposition technique

### 4.1 Backend (`cmfipraise-backend`)

**Données** : une **nouvelle table** `user_preference` (Liquibase), une ligne par utilisateur, créée
au premier choix. `t_user` n'est pas modifiée : aucun impact sur les comptes existants ni sur
CMFIPraise. **Pas de ligne = aucun choix = thème par défaut.**

| Colonne | Type | Rôle |
|---|---|---|
| `user_id` | **`UUID`**, clé primaire, clé étrangère vers `t_user(id)` (UUID), `ON DELETE CASCADE` | le compte |
| `theme_mode` | `VARCHAR(16) NOT NULL` | `AUTO`, `CLAIR`, `SOMBRE`, `NOIR_ET_BLANC` |
| `theme_accent` | `VARCHAR(7) NULL` | `#RRGGBB` ; `NULL` = accent par défaut |
| `created_at` | `TIMESTAMP NOT NULL` | création de la ligne |
| `updated_at` | `TIMESTAMP NOT NULL` | dernière modification (audit seulement, jamais comparé par les fronts) |

*(Forme (1) de la décision D3b. Avec la forme (2), la table serait `user_preference(user_id UUID,
pref_key, pref_value, updated_at)`, clé primaire `(user_id, pref_key)`.)*

**Code** : un module à part, `com.excellence.back.auth.preference` : entité `UserPreference`,
`UserPreferenceRepository`, `UserPreferenceService` (lire, créer ou remplacer) et
`UserPreferenceController`.

**Lecture**
- `GET /api/church/auth/me/preferences` → `{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A" }` ;
  `{ "themeMode": null, "themeAccent": null }` si le compte n'a pas de ligne.
- `GET /api/church/auth/me` renvoie aussi un objet `preferences` identique, pour éviter un appel
  de plus au démarrage. Champ ajouté, rien de retiré : les anciennes versions de l'app continuent
  de fonctionner. Les relectures au retour sur l'app utilisent `GET /me/preferences` (D6).

**Écriture** : `PUT /api/church/auth/me/preferences`, réservé au compte connecté (il ne modifie que
son propre compte : l'API ne prend aucun identifiant d'utilisateur).

```jsonc
// requête
{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A" }
// réponse 200
{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A" }
```

- **Remplacement complet** : le `PUT` remplace l'ensemble des préférences, il n'y a pas de mise à
  jour partielle. Un champ absent vaut `null`.
- **`themeMode` est obligatoire** : `null` ou absent → `400 PREFERENCE_INVALID`. Revenir au réglage
  par défaut, c'est envoyer `"AUTO"` ou `"CLAIR"` explicitement.
- **`themeAccent` peut être `null`** : accent par défaut.
- `400 PREFERENCE_INVALID` aussi si le mode est inconnu ou si l'accent ne respecte pas
  `^#[0-9A-Fa-f]{6}$`.
- Pas de garde de module (`@RequiresModule`) : c'est une préférence du compte, pas une
  fonctionnalité payante.
- Le contrôle du **contraste** reste côté front : le serveur stocke l'accent choisi tel quel, et
  chaque surface l'ajuste à l'affichage.

**Suppression de compte (RGPD)** : la ligne est purgée dans **`prepare()` de
`SelfAccountDeletionExecutor`**, l'étape commune à la suppression **et** à l'anonymisation. La
cascade `ON DELETE CASCADE` reste en filet de sécurité pour une suppression faite ailleurs.

### 4.2 Mobile (`shephr-app/mobile`)

**Source à réutiliser** : l'infrastructure du thème de CMFIPraise, dans `cmfipraise-app` :
dossier `utils/theme/` (`couleurs.ts`, `palettes.ts`, `creerStyles.ts`, `typo.ts`, tests) et
`contexts/ThemeContext.tsx`. Elle vient de la branche `feat-darckmode`, mergée dans `main` de
`cmfipraise-app` le 04/11 (PR #14) ; elle n'est **pas** encore dans `develop`.

- `theme/palettes.ts` : les **rôles de couleur** (`page`, `surface`, `texte`, `texteSecondaire`,
  `filet`, `accent`, `surAccent`, `secondaire` (terre), `alerte`…) et leurs valeurs pour chaque
  mode. Le Clair reprend **exactement** les couleurs actuelles : aucune régression visuelle.
  L'accent ne remplace que la famille verte (D2).
- `theme/couleurs.ts` : calculs de luminance, de contraste et d'ajustement d'un accent.
- `theme/creerStyles.ts` : remplace `StyleSheet.create` par un hook qui recalcule les styles quand
  le thème change.
- `contexts/ThemeContext.tsx` : lit le dernier thème de l'appareil (AsyncStorage `app_theme`),
  applique les préférences du compte (`me.preferences`, puis `GET /me/preferences`), et gère
  l'**envoi en attente** (D5) : clé AsyncStorage `app_theme_pending.{userId}`, rejouée au retour du
  réseau et au premier plan, effacée après un `PUT` accepté ou à la déconnexion.
- `contexts/AuthContext.tsx` : au retour au premier plan d'une session **connectée**, déclencher la
  relecture `GET /me/preferences` (aujourd'hui, la relecture au premier plan n'a lieu que pour un
  profil servi par le cache, ligne 354).
- Nouvel écran **Apparence** (`app/appearance.tsx`), accessible depuis l'onglet **Profil**, réservé
  au compte connecté (D4).

**À traiter hors `StyleSheet`** (une migration des styles ne les attrape pas) :
- `app/_layout.tsx` : `StatusBar style="dark"` et `contentStyle: { backgroundColor: '#E8DCC4' }`
  en dur ;
- la **barre d'onglets** (`app/(tabs)/_layout.tsx` : `tabBarActiveTintColor`,
  `tabBarInactiveTintColor`, `tabBarStyle`) ;
- les props de couleur des composants natifs : `placeholderTextColor`, `RefreshControl`
  (`tintColor`, `colors`), `ActivityIndicator` (`color`) ;
- le `BlurView` de `components/FeatureLock.tsx` (teinte `light` / `dark` selon le mode) ;
- les **constantes hors composant** : `constants/categories.ts`, `constants/goalCategories.ts`,
  `utils/demandes.tsx` (couleurs calculées hors du rendu, à transformer en fonctions du thème).

**Mode Automatique** : `app.json` passe à `userInterfaceStyle: "automatic"`. C'est un réglage
**natif** : il ne s'applique qu'avec un **nouveau build** (EAS). `expo-updates` n'étant pas installé,
le mode Automatique n'arrivera aux utilisateurs qu'avec une **nouvelle version publiée sur les
stores**. Clair, Sombre et Noir et blanc fonctionnent sans cela.

### 4.3 Web (`shephr-app/web`)

- `theme/styles.css` :
  - ajout des **variables de rôle** (`--page`, `--surface`, `--texte`, `--texte-secondaire`,
    `--filet`, `--accent`, `--sur-accent`, `--accent-teinte`, `--secondaire`, `--alerte`…), migration
    de chaque usage vers son rôle (§4.4) ;
  - valeurs du **Clair déclarées sur `:root` et aussi sur `[data-theme="clair"]`**, puis un bloc par
    mode, `[data-theme="sombre"]` et `[data-theme="noirEtBlanc"]`. Sans le sélecteur `clair`, une page
    ne pourrait pas revenir au Clair à l'intérieur d'un document en Sombre (D11) ;
  - **`color-scheme: light | dark`** par mode, pour que les champs natifs (dates, sélecteurs, cases)
    et les barres de défilement suivent le thème ;
  - migration des **86 couleurs en dur** de `styles.css` (barre latérale, boutons, modales, page de
    login) vers les rôles, réparties dans les étapes W1 à W3.
- L'accent choisi est injecté en variables CSS (`--accent`, `--accent-teinte`…) sur `<html>`, calculé
  avec les mêmes règles de contraste que le mobile.
- `index.html` : un petit script inline applique le thème **avant** l'affichage, pour éviter un
  flash au chargement. Il **ne peut pas importer** `couleurs.ts` : il lit des valeurs **déjà
  calculées** et stockées dans `localStorage` (`shephr.theme.v1` : mode résolu + variables d'accent
  prêtes à poser), écrites par `useTheme` à chaque changement, sous `try/catch`.
- `hooks/useTheme.tsx` : contexte de thème, même règle D5 et même envoi en attente que le mobile
  (`localStorage` `shephr.theme.pending.{userId}`).
- Relecture de `GET /me/preferences` au focus de l'onglet (`visibilitychange`), **sans** appeler
  `refreshMe` (D6).
- Section **Apparence** dans la page **Paramètres** (`/settings` et `/member-settings`), donc
  seulement pour un compte connecté (D4).

**Landing et `/offres` en Clair fixe (D11)**
- `data-theme="clair"` est posé sur le conteneur racine de `pages/Landing.tsx` et de
  `pages/Offers.tsx` (une ligne par fichier ; ces deux pages ne sont pas migrées pour autant).
- L'accent de l'utilisateur n'est **pas** injecté dans ce conteneur : ces pages gardent l'accent par
  défaut.
- `components/VoucherRedeemModal.tsx` reste à migrer, car `LockedFeature` l'utilise aussi dans
  l'application. Sur `/offres`, elle hérite du Clair : aucune modale du web ne passe par un portail.
- Les **toasts**, montés au niveau d'`App.tsx`, suivent le thème de l'utilisateur, même sur ces
  pages : c'est accepté.

### 4.4 Correspondance « usage → rôle » (à appliquer avant M3 et W1)

La migration ne peut **pas** se faire par rechercher-remplacer : une même couleur joue plusieurs
rôles. Exemples mesurés : `colors.moss` sert **53 fois en texte et 29 fois en fond** sur le mobile,
et `colors.white` est en réalité une couleur **crème**, pas un blanc. Chaque usage est donc classé
selon ce qu'il fait à l'écran :

| Usage actuel (mobile / web) | Rôle |
|---|---|
| `moss`, `mossDeep` / `--green-700..900` en **fond** (bouton principal, barre latérale, pastille active) | `accent` |
| `moss`, `mossDeep` / `--green-700..900` en **texte** (titre, lien, chiffre mis en avant) | `accent` si c'est un élément de marque ou d'action, sinon `texte` |
| `white` (crème) / texte ou icône posé **sur un fond de marque** | `surAccent` |
| `paper`, `paper2` / `--ivory`, `--ivory-card`, `--ivory-raised` en fond de carte ou de feuille | `surface` |
| `parchment`, `parchmentDeep` / `--parchment`, `--parchment-deep` en fond de page | `page` |
| `ink`, `ink2` / `--ink-900`, `--ink-800`, `--ink-700` en texte courant | `texte` |
| `ink3` / `--ink-500`, `--ink-400`, `--ink-300` en texte secondaire, métadonnée | `texteSecondaire` |
| `mossTint`, `mossTint2`, `mossSoft` / `--green-50`, `--green-100` en fond de pastille | `accentTeinte` |
| `earth`, `earthDeep` / `--earth-*` | `secondaire` (n'est **pas** remplacé par l'accent, D2) |
| `clay` quand il signale une suppression ou une erreur / `--err`, `--err-bg` | `alerte`, `alerteTeinte` |
| `--ok`, `--warn` et couleurs de catégorie | rôles de statut (`succes`, `avertissement`) et couleurs de catégorie, **gris en Noir et blanc** (D8) |
| `hair`, `hairStrong` / `--line`, `--line-soft`, `--line-strong` | `filet` |

Le tableau complet, usage par usage, est tenu dans ce document et complété à chaque étape de
migration.

---

## 5. Fichiers créés et modifiés

### 5.1 Backend (`cmfipraise-backend`)

| Action | Fichier |
|---|---|
| Créé | `src/main/java/com/excellence/back/auth/preference/UserPreference.java` (entité) |
| Créé | `src/main/java/com/excellence/back/auth/preference/ThemeMode.java` (enum) |
| Créé | `src/main/java/com/excellence/back/auth/preference/UserPreferenceRepository.java` |
| Créé | `src/main/java/com/excellence/back/auth/preference/UserPreferenceService.java` et `UserPreferenceServiceImpl.java` |
| Créé | `src/main/java/com/excellence/back/auth/preference/UserPreferenceController.java` (`GET` et `PUT /api/church/auth/me/preferences`) |
| Créé | `src/main/java/com/excellence/back/auth/preference/dto/UserPreferenceDto.java` et `UpdateUserPreferenceRequest.java` |
| Créé | changeset Liquibase `create-user-preference` (fichier dédié, inclus avant `resync-sequences`, qui doit rester en dernier) |
| Créé | `src/test/java/com/excellence/back/auth/preference/UserPreferenceServiceImplTest.java` et `UserPreferenceControllerTest.java` |
| Modifié | `src/main/resources/db/changelog/db.changelog-master.xml` (inclusion du changeset) |
| Modifié | `src/main/java/com/excellence/back/donation/auth/dto/MeResponse.java` (objet `preferences`) |
| Modifié | `src/main/java/com/excellence/back/donation/auth/ChurchAuthServiceImpl.java` (remplit `preferences` dans `/me`) |
| Modifié | `src/main/java/com/excellence/back/auth/selfaccount/SelfAccountDeletionExecutor.java` (purge de la ligne dans `prepare()`, commun à la suppression et à l'anonymisation) |
| Modifié | doc du contrat d'API Shephr (section « Préférences du compte ») |
| Inchangé | `src/main/java/com/excellence/back/auth/User.java` et la table `t_user` |

### 5.2 Mobile (`shephr-app/mobile`)

| Action | Fichier |
|---|---|
| Créé | `theme/palettes.ts`, `theme/couleurs.ts`, `theme/creerStyles.ts` (portés de `cmfipraise-app/utils/theme/`) |
| Créé | `contexts/ThemeContext.tsx` (avec l'envoi en attente, D5) |
| Créé | `services/preferencesApi.ts` (`GET` et `PUT /me/preferences`) |
| Créé | `app/appearance.tsx` (écran Apparence) |
| Modifié | `theme/colors.ts` (devient la palette Claire), `theme/index.ts` |
| Modifié | `app/_layout.tsx` (`ThemeProvider`, `StatusBar`, `contentStyle`, splash qui attend le thème) |
| Modifié | `app/(tabs)/_layout.tsx` (couleurs de la barre d'onglets) |
| Modifié | `contexts/AuthContext.tsx` (relecture des préférences au premier plan, D6) |
| Modifié | `app.json` (`userInterfaceStyle: "automatic"`, effectif au prochain build store) |
| Modifié | `services/authApi.ts` (`MeResponse` : objet `preferences`) |
| Modifié | `app/(tabs)/profile.tsx` (entrée « Apparence ») |
| Modifié | `utils/i18n/locales/fr.json` et `en.json` (libellés de l'écran Apparence) |
| **Migrés** | **97 fichiers** (annexe A) : **41 composants** (dont `components/auth/LinkConfirmModal.tsx`), **51 écrans** (`app/`), `constants` (2), `utils` (1 : `utils/demandes.tsx`) et les 2 fichiers de `theme/`. `utils/assemblyJournal.ts` (journal PDF) **n'est pas migré** : couleurs fixes (D8). |

### 5.3 Web (`shephr-app/web`)

| Action | Fichier |
|---|---|
| Créé | `src/theme/palettes.ts`, `src/theme/couleurs.ts` |
| Créé | `src/hooks/useTheme.tsx` (avec l'envoi en attente, D5) |
| Créé | `src/services/preferencesApi.ts` |
| Créé | `src/components/AppearanceSection.tsx` |
| Créé | `src/theme/__tests__/palettes.test.ts` (si D9 validé) |
| Modifié | `src/theme/styles.css` (rôles, `[data-theme]` dont `clair`, `color-scheme`, 86 couleurs en dur) |
| Modifié | `index.html` (thème appliqué avant l'affichage, depuis les valeurs déjà calculées) |
| Modifié | `src/App.tsx` (`ThemeProvider`) |
| Modifié | `src/services/authApi.ts` (`MeResponse` : objet `preferences`) |
| Modifié | `src/pages/Settings.tsx` (section Apparence) |
| Modifié | `src/pages/Landing.tsx` et `src/pages/Offers.tsx` (`data-theme="clair"` sur le conteneur racine, une ligne chacun — non migrés) |
| Modifié | `src/i18n/locales/fr.json` et `en.json` |
| Modifié | `package.json` (Vitest en dépendance de dev, si D9 validé) |
| **Migrés** | **50 fichiers** (annexe B) : **28 pages**, **21 composants** (dont `components/LinkConfirmModal.tsx` et `VoucherRedeemModal.tsx`) et `MemberShell.tsx`. Hors migration : `utils/assemblyJournal.ts` (journal PDF, couleurs fixes), `pages/Landing.tsx` et `pages/Offers.tsx` (Clair fixe, D11). |

### 5.4 Documentation

- `shephr-app/docs/theme-plan.md` : ce document, tenu à jour à chaque étape (dont le tableau §4.4).
- `shephr-app/CLAUDE.md` : règle de style mise à jour (« pas de couleur en dur, utiliser les rôles
  du thème ; la landing, `/offres` et les journaux PDF restent en Clair »).

---

## 6. Plan d'implémentation, étape par étape

Chaque étape correspond à **un commit** sur `feat/theme`, **relu par Jean Philippe** avant de passer
à la suivante. Le **squash** n'est fait qu'à la fin, au moment du merge.

| Étape | Dépôt | Contenu | Vérification avant commit |
|---|---|---|---|
| **B1** | backend | Table `user_preference` (Liquibase, `user_id` UUID), entité, repository, `ThemeMode` | Le back démarre, la table existe, CMFIPraise fonctionne toujours |
| **B2** | backend | Service, `GET` / `PUT /me/preferences`, `preferences` dans `/me`, purge dans `prepare()`, tests | Tests verts ; appels manuels 200, 400 et 401 |
| **M1** | mobile | Infrastructure : palettes, calculs, `creerStyles`, `ThemeContext` (local seulement) | `tsc` OK ; l'app est identique en Clair |
| **M2** | mobile | Écran Apparence, entrée dans Profil, `_layout.tsx` (barre d'état, fond), barre d'onglets, `app.json` | Changer de mode change l'écran Apparence, la barre d'état et les onglets |
| **M3** | mobile | Migration des **41 composants**, dont `FeatureLock` (`BlurView`) | Captures Clair / Sombre / Noir et blanc |
| **M4a** | mobile | Écrans d'authentification `(auth)` (5) et écrans racine (6) | Recette visuelle du domaine |
| **M4b** | mobile | Objectifs et dirigeant : `(tabs)/goals` (8), `(tabs)/leader` (5) | Recette visuelle du domaine |
| **M4c** | mobile | Assemblée, soins, évènements, accueil : `(tabs)/assembly` (4), `(tabs)/care` (2), `(tabs)/events` (1), `(tabs)` racine (4), `events` (4) | Recette visuelle du domaine |
| **M4d** | mobile | Étude, hiérarchie, dons, documents : `study` (5), `hierarchie` (3), `donation` (2), `d` (1), `documents` (1) | Recette visuelle du domaine |
| **M4e** | mobile | Constantes et utilitaires : `constants/categories.ts`, `constants/goalCategories.ts`, `utils/demandes.tsx` | Catégories et statuts gris en Noir et blanc |
| **M5** | mobile | Synchronisation : préférences du compte, `PUT`, envoi en attente, relecture au premier plan (`AuthContext`) | Changement sur le mobile visible dans `GET /me/preferences` |
| **W1** | web | Rôles et blocs `[data-theme]` dans `styles.css` (dont `clair`, `color-scheme`), couleurs en dur de `styles.css` (1ʳᵉ partie), script d'`index.html`, `useTheme` (local), Clair fixe de la landing et d'`/offres` | Le web est identique en Clair |
| **W2** | web | Section Apparence dans Paramètres | Changer de mode recolore les écrans déjà migrés |
| **W3a** | web | Composants (21) et `MemberShell.tsx`, couleurs en dur restantes de `styles.css` | Recette visuelle des composants |
| **W3b** | web | Pages de compte : `Login`, `ForgotPassword`, `ResetPassword`, `Onboarding`, `Settings`, `DeleteAccount`, `Privacy`, `Contact`, `Billing` (9) | Recette visuelle du domaine |
| **W3c** | web | Pilotage : `Dashboard`, `Goals`, `MemberGoals`, `Hierarchy`, `HierarchyLeadership`, `HierarchyLife`, `MonMinistere`, `MyActions`, `Unites`, `Users` (10) | Recette visuelle du domaine |
| **W3d** | web | Vie de l'assemblée : `Assembly`, `MemberCare`, `Requests`, `Study`, `StudySession`, `CityStudy`, `Documents`, `DocumentReader`, `Donations` (9) | Recette visuelle du domaine |
| **W4** | web | Synchronisation : préférences du compte, `PUT`, envoi en attente, relecture au focus | Changement sur le web visible sur le mobile |
| **DOC** | les deux | Documentation (`theme-plan.md`, `CLAUDE.md`) et sanity check des RDG | Tableau des RDG rempli |

Ordre : **backend d'abord** (B1, B2), parce que les deux surfaces en dépendent pour la
synchronisation. Ensuite le mobile, puis le web.

---

## 7. Plan de recette

**Environnement** : back local (profil `local`, PostgreSQL), web `npm run dev`, mobile
`npm run web:local` au format téléphone, plus un vrai téléphone avec un **build de développement
EAS** (Expo Go ne prend pas en compte `userInterfaceStyle` ni les modules natifs de l'app).

**R1 — Chaque mode, chaque surface.** En Clair, Sombre et Noir et blanc, parcourir les écrans du
**membre** (objectifs, assemblée, actions, étude, documents, paramètres) et du **dirigeant**
(tableau de bord, objectifs, assemblée, évènements, étude, membres, structure, hiérarchie). Aucun
texte illisible, aucun bloc resté clair en Sombre. En Noir et blanc, aucune couleur sauf l'alerte :
statuts et catégories en gris, distingués par leurs libellés et leurs icônes.

**R2 — Non-régression.** En Clair avec l'accent par défaut, le web et le mobile sont visuellement
identiques à `main` (captures avant / après).

**R3 — Contraste automatique.** Avec un accent jaune pâle puis bleu nuit : boutons et liens
lisibles (≥ 4,5:1 pour le texte, ≥ 3:1 pour les icônes), mesuré par script sur chaque page. La
couleur terre ne change pas avec l'accent.

**R4 — Synchronisation web → mobile.** Connecté avec le même compte : choisir Sombre et un accent
argile sur le web, puis ramener l'app mobile au premier plan : elle passe en Sombre avec l'accent
argile.

**R5 — Synchronisation mobile → web.** Choisir Noir et blanc sur le mobile, puis revenir sur
l'onglet web : il passe en Noir et blanc sans rechargement manuel.

**R6 — Deux choix successifs.** Choix A sur le web, puis choix B sur le mobile : après relecture,
B s'applique partout. Aucune date n'est comparée : c'est le dernier `PUT` accepté par le serveur
qui fait foi.

**R7 — Non connecté.** Sur les pages publiques (login, inscription, `/d/:slug`…), aucun sélecteur
de thème. Sans thème déjà connu sur l'appareil : thème par défaut. Après une session en Sombre puis
une déconnexion : le login s'affiche en Sombre. Se connecter avec un compte **sans** préférence :
thème par défaut, et **aucun `PUT`** n'est envoyé. Se connecter avec un compte **avec** préférence :
le choix du compte s'applique.

**R8 — Hors ligne.** Mobile en mode avion : changer de thème s'applique tout de suite et l'envoi est
mis en attente. Au retour au premier plan ou du réseau, une lecture de `/me` ou de
`/me/preferences` **n'écrase pas** le choix local tant que l'envoi est en attente ; l'envoi part,
le serveur enregistre le choix, puis l'attente est levée. Même test sur le web, réseau coupé dans
l'outil de développement.

**R9 — Mode Automatique.** Sur le build de développement EAS et dans le navigateur, basculer le
réglage clair / sombre du système : l'app suit sans redémarrer.

**R10 — Pas de flash.** Recharger le web et relancer le build de développement en Sombre : aucun
écran clair au démarrage.

**R11 — Backend.** `PUT /me/preferences` avec un mode invalide → 400 ; avec `themeMode: null` → 400 ;
avec un accent `#12` → 400 ; sans jeton → 401 ; un compte ne peut pas modifier celui d'un autre
(l'API n'accepte pas d'identifiant). Un compte sans ligne renvoie des préférences `null`, et le
premier `PUT` crée la ligne. En base, `t_user` est inchangée.

**R11b — Suppression de compte.** Supprimer puis anonymiser un compte qui a des préférences : sa
ligne `user_preference` a disparu dans les deux cas.

**R12 — Sanity check des RDG.** Rôles (membre, dirigeant, LEADER, SECRETARIAT, superAdmin) et
modules (verrous Néhémie et Caleb, modules désactivés) inchangés : le thème ne touche à aucune
condition, aucun appel d'API ni aucune navigation existants.

**R13 — Journaux PDF.** En Sombre, puis en Noir et blanc, générer un journal PDF (assemblée et
hiérarchie) sur le web et sur le mobile : il est identique à celui généré en Clair.

**R14 — Téléphone partagé.** Le compte A choisit Sombre puis se déconnecte. Le compte B, qui n'a
jamais rien choisi, se connecte sur le même téléphone : B voit le thème **par défaut**, son compte
ne reçoit **pas** le thème de A, et **aucun `PUT`** n'est envoyé.

**R15 — Pages marketing.** En Sombre puis en Noir et blanc, ouvrir la landing et `/offres`, avec la
modale « J'ai un code » : elles restent identiques au Clair, avec l'accent par défaut.

---

## 8. Risques

- **Volume côté mobile** (1 704 usages, 161 couleurs en dur) : migration découpée par domaine
  (M3, M4a à M4e), avec une recette visuelle à chaque étape.
- **Usages ambigus** (même couleur en texte et en fond) : traités par le tableau §4.4, jamais par
  rechercher-remplacer.
- **Contrat d'API partagé** : `preferences` est ajouté à `MeResponse` ; il faut le porter dans les
  types des **deux** surfaces (`CLAUDE.md`, point d'attention n°1).
- **CMFIPraise utilise le même back** : la nouvelle table n'est lue par aucun écran CMFIPraise et
  `t_user` n'est pas modifiée. À vérifier à l'étape B1.
- **Mode Automatique sur mobile** : attend une nouvelle version sur les stores (§4.2).
- **Pas de temps réel** (D6) : une répercussion instantanée demanderait du push ou un websocket,
  hors de cette spec.

---

## Annexe A — fichiers mobiles migrés (97)

Tout fichier de `mobile/` qui importe `@/theme` ou contient une couleur en dur, sur `main` (06/11/2026). Les deux fichiers de `theme/` sont l'infrastructure elle-même (M1). Retiré : `mobile/utils/assemblyJournal.ts` (journal PDF, couleurs fixes, D8). Ajouté depuis la première version : `mobile/components/auth/LinkConfirmModal.tsx`, arrivé avec `main`.

- `mobile/app/(auth)/forgot-password.tsx`
- `mobile/app/(auth)/join.tsx`
- `mobile/app/(auth)/login.tsx`
- `mobile/app/(auth)/reset-password.tsx`
- `mobile/app/(auth)/signup.tsx`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app/(tabs)/assembly/form.tsx`
- `mobile/app/(tabs)/assembly/index.tsx`
- `mobile/app/(tabs)/assembly/journal.tsx`
- `mobile/app/(tabs)/assembly/meeting/[id].tsx`
- `mobile/app/(tabs)/care/index.tsx`
- `mobile/app/(tabs)/care/record/[id].tsx`
- `mobile/app/(tabs)/donations.tsx`
- `mobile/app/(tabs)/events/index.tsx`
- `mobile/app/(tabs)/goals/assembly.tsx`
- `mobile/app/(tabs)/goals/history.tsx`
- `mobile/app/(tabs)/goals/member.tsx`
- `mobile/app/(tabs)/goals/pledge/[categoryId].tsx`
- `mobile/app/(tabs)/goals/progress.tsx`
- `mobile/app/(tabs)/goals/remind.tsx`
- `mobile/app/(tabs)/goals/submit.tsx`
- `mobile/app/(tabs)/goals/units.tsx`
- `mobile/app/(tabs)/home.tsx`
- `mobile/app/(tabs)/leader/declaration/[id].tsx`
- `mobile/app/(tabs)/leader/index.tsx`
- `mobile/app/(tabs)/leader/stats.tsx`
- `mobile/app/(tabs)/leader/unit/[unitId].tsx`
- `mobile/app/(tabs)/leader/verify.tsx`
- `mobile/app/(tabs)/profile.tsx`
- `mobile/app/_layout.tsx`
- `mobile/app/d/[slug].tsx`
- `mobile/app/declare.tsx`
- `mobile/app/documents/index.tsx`
- `mobile/app/donation/[id].tsx`
- `mobile/app/donation/edit/[id].tsx`
- `mobile/app/events/[id].tsx`
- `mobile/app/events/declare.tsx`
- `mobile/app/events/mine.tsx`
- `mobile/app/events/plan.tsx`
- `mobile/app/hierarchie/index.tsx`
- `mobile/app/hierarchie/leadership.tsx`
- `mobile/app/hierarchie/vie.tsx`
- `mobile/app/index.tsx`
- `mobile/app/membres.tsx`
- `mobile/app/notification-settings.tsx`
- `mobile/app/structure.tsx`
- `mobile/app/study/city.tsx`
- `mobile/app/study/index.tsx`
- `mobile/app/study/progress.tsx`
- `mobile/app/study/results/[id].tsx`
- `mobile/app/study/session/[id].tsx`
- `mobile/components/Amount.tsx`
- `mobile/components/AssemblyHierarchyStats.tsx`
- `mobile/components/Button.tsx`
- `mobile/components/Card.tsx`
- `mobile/components/Chip.tsx`
- `mobile/components/DeclarationForm.tsx`
- `mobile/components/DeclarationStatusPill.tsx`
- `mobile/components/DonationRow.tsx`
- `mobile/components/ErrorBanner.tsx`
- `mobile/components/EventAgenda.tsx`
- `mobile/components/EventCounterFields.tsx`
- `mobile/components/EventCounters.tsx`
- `mobile/components/EventForm.tsx`
- `mobile/components/EventHierarchyStats.tsx`
- `mobile/components/EventMemberView.tsx`
- `mobile/components/EventPeriodPicker.tsx`
- `mobile/components/EventQueueBlocks.tsx`
- `mobile/components/EventRow.tsx`
- `mobile/components/EventStatsDrill.tsx`
- `mobile/components/FeatureLock.tsx`
- `mobile/components/Field.tsx`
- `mobile/components/GoalAggregates.tsx`
- `mobile/components/GoalCards.tsx`
- `mobile/components/GoalsMinistryOverview.tsx`
- `mobile/components/HandDivider.tsx`
- `mobile/components/Label.tsx`
- `mobile/components/LangSwitch.tsx`
- `mobile/components/MeetingReportCard.tsx`
- `mobile/components/NotificationGate.tsx`
- `mobile/components/RelanceNonDeclarants.tsx`
- `mobile/components/ScreenShell.tsx`
- `mobile/components/SelectField.tsx`
- `mobile/components/StudyHierarchyStats.tsx`
- `mobile/components/StudyQuestionList.tsx`
- `mobile/components/UnitMembersAggregate.tsx`
- `mobile/components/Wordmark.tsx`
- `mobile/components/auth/LinkConfirmModal.tsx`
- `mobile/components/auth/SocialSignInButtons.tsx`
- `mobile/components/documents/PdfReader.tsx`
- `mobile/components/push/ModaleActivationPush.tsx`
- `mobile/components/push/usePushNotifications.ts`
- `mobile/constants/categories.ts`
- `mobile/constants/goalCategories.ts`
- `mobile/theme/colors.ts`
- `mobile/theme/index.ts`
- `mobile/utils/demandes.tsx`

## Annexe B — fichiers web migrés (50)

Tout fichier de `web/src/` avec une couleur en dur ou une couleur de marque (`--green-700/800/900`, `--earth-500/600/700`) susceptible de servir de fond, sur `main` (06/11/2026). Retirés : `web/src/utils/assemblyJournal.ts` (journal PDF, D8), `web/src/pages/Landing.tsx` et `web/src/pages/Offers.tsx` (Clair fixe, D11 — une ligne `data-theme="clair"` chacune, sans migration). Ajouté : `web/src/components/LinkConfirmModal.tsx`, arrivé avec `main`. S'y ajoutent les 86 couleurs en dur de `web/src/theme/styles.css` (étapes W1 et W3a).

- `web/src/MemberShell.tsx`
- `web/src/components/AssemblyHierarchyStats.tsx`
- `web/src/components/AuthPageLayout.tsx`
- `web/src/components/BulkReminderModal.tsx`
- `web/src/components/EventDetail.tsx`
- `web/src/components/EventForm.tsx`
- `web/src/components/EventStatsDrill.tsx`
- `web/src/components/EventsTable.tsx`
- `web/src/components/GoalTimeline.tsx`
- `web/src/components/LangSwitch.tsx`
- `web/src/components/LinkConfirmModal.tsx`
- `web/src/components/LockedFeature.tsx`
- `web/src/components/NationsMap.tsx`
- `web/src/components/NotificationGate.tsx`
- `web/src/components/Sidebar.tsx`
- `web/src/components/SocialSignInButtons.tsx`
- `web/src/components/StudyHierarchyBlock.tsx`
- `web/src/components/StudyLiveBadge.tsx`
- `web/src/components/StudyQuestionList.tsx`
- `web/src/components/SupervisorCard.tsx`
- `web/src/components/VoucherRedeemModal.tsx`
- `web/src/components/charts.tsx`
- `web/src/pages/Assembly.tsx`
- `web/src/pages/Billing.tsx`
- `web/src/pages/CityStudy.tsx`
- `web/src/pages/Contact.tsx`
- `web/src/pages/Dashboard.tsx`
- `web/src/pages/DeleteAccount.tsx`
- `web/src/pages/DocumentReader.tsx`
- `web/src/pages/Documents.tsx`
- `web/src/pages/Donations.tsx`
- `web/src/pages/ForgotPassword.tsx`
- `web/src/pages/Goals.tsx`
- `web/src/pages/Hierarchy.tsx`
- `web/src/pages/HierarchyLeadership.tsx`
- `web/src/pages/HierarchyLife.tsx`
- `web/src/pages/Login.tsx`
- `web/src/pages/MemberCare.tsx`
- `web/src/pages/MemberGoals.tsx`
- `web/src/pages/MonMinistere.tsx`
- `web/src/pages/MyActions.tsx`
- `web/src/pages/Onboarding.tsx`
- `web/src/pages/Privacy.tsx`
- `web/src/pages/Requests.tsx`
- `web/src/pages/ResetPassword.tsx`
- `web/src/pages/Settings.tsx`
- `web/src/pages/Study.tsx`
- `web/src/pages/StudySession.tsx`
- `web/src/pages/Unites.tsx`
- `web/src/pages/Users.tsx`
