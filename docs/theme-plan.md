# Shephr — Thème (sombre, noir et blanc, couleur d'accent) synchronisé entre web et mobile

> **Statut : spec à valider par Jean Philippe.** Aucun code n'est écrit avant sa validation.
> Rédigée le 05/11/2026 par Catherine , sur la base de `develop` de `shephr-app`
> et de `cmfipraise-backend`.

---

## 1. Objectif

Reprendre le travail fait sur CMFIPraise (PR #14) pour l'application Shephr, avec deux différences :

1. **Deux surfaces** : l'Espace ministère **web** (`shephr-app/web`) **et** l'app **mobile**
   (`shephr-app/mobile`). Le back-office `shephr-webapp` (SUPER_ADMIN) n'est **pas** concerné.
2. **Le choix est sauvegardé sur le compte** (backend) : un utilisateur connecté qui change de thème
   sur le web le retrouve sur le mobile, et inversement.

Comme pour CMFIPraise, l'utilisateur choisit :
- un **mode** : Automatique (suit le système), Clair, Sombre, Noir et blanc ;
- une **couleur d'accent** : 6 pastilles proposées ou un code hexa libre.

Et la **luminosité** est prise en compte : le mode Automatique suit le réglage clair / sombre du
téléphone ou du navigateur, et tout accent est ajusté pour rester lisible (contraste WCAG).

---

## 2. État des lieux (mesuré sur `develop`, 05/11/2026)

| | Mobile (`shephr-app/mobile`) | Web (`shephr-app/web`) |
|---|---|---|
| Stack | Expo 57, React Native 0.86, expo-router | React 18, Vite 5, react-router 6, react-query |
| Couleurs | `theme/colors.ts` (moss / parchment / earth / ink), importé **statiquement** | Variables CSS dans `theme/styles.css` (`--green-800`, `--ink-500`…) |
| Usages | **1 675** `colors.x` dans **92** fichiers, plus **178** couleurs en dur dans **42** fichiers | **~1 300** `var(--…)`, plus **157** couleurs en dur dans **28** fichiers |
| Thème sombre | Aucun. `app.json` : `userInterfaceStyle: "light"` | Aucun (pas de `data-theme`, pas de `prefers-color-scheme`) |
| Tests | Aucun framework de test | Aucun framework de test |
| Préférences du compte | `me.language` lu au login, jamais écrit | Idem |

**Conséquences**
- **Mobile** : le travail est le même que sur CMFIPraise (passer de couleurs fixes à des rôles
  lus via un hook). On réutilise l'infrastructure déjà écrite et validée (calculs de contraste,
  `creerStyles`, contexte de thème).
- **Web** : beaucoup plus simple. Les écrans utilisent déjà des variables CSS : il suffit de
  **redéfinir ces variables** pour chaque thème (`:root[data-theme="sombre"]`…). Seuls les
  ~20 endroits où une couleur de marque sert de **fond** (boutons, barre latérale) et les couleurs
  en dur doivent être repris.
- **Backend** : rien n'existe pour stocker une préférence d'affichage. Il faut l'ajouter.

---

## 3. Décisions à valider par Jean Philippe

| # | Question | Proposition |
|---|---|---|
| D1 | Les modes proposés | Les mêmes que CMFIPraise : **Automatique, Clair, Sombre, Noir et blanc**. Clair reste le défaut. |
| D2 | Couleur d'accent par défaut et pastilles | Défaut : **vert mousse Shephr** (`#1E3A2F`). Pastilles : mousse, terre (`#A7754B`), argile (`#B86A4A`), bleu (`#1F5A8A`), violet (`#6B3FD4`), framboise (`#B4245E`), plus un hexa libre. |
| D3 | Qu'est-ce qui est synchronisé ? | **Le mode et l'accent**, liés au **compte**. Les deux surfaces affichent donc le même thème. |
| D3b | Où les sauvegarder ? (consigne JP : « créer une table pour sauvegarder les préférences des utilisateurs ») | Une **table dédiée `user_preference`**, sans toucher à `t_user` (table partagée avec CMFIPraise). Deux formes possibles, à trancher : **(1) une colonne par préférence** (`theme_mode`, `theme_accent`…), une ligne par utilisateur : simple, typée, valeurs contrôlées par la base, mais une migration par nouvelle préférence ; **(2) clé / valeur** (`user_id`, `cle`, `valeur`), une ligne par préférence : aucune migration pour en ajouter, mais valeurs non typées, contrôlées dans le code. **Proposition : (1)**, plus lisible et plus sûre tant que seules les préférences de thème sont connues. |
| D4 | Et un utilisateur non connecté (page de login, landing, `/offres`) ? | Choix gardé **sur l'appareil** (comme la langue), et envoyé au compte à la première connexion si le compte n'a encore rien choisi. |
| D5 | Qui gagne en cas de conflit ? | **Le compte** : à la connexion et à chaque rafraîchissement de `/me`, la valeur du serveur remplace la valeur locale. Le dernier choix enregistré gagne (`themeUpdatedAt`). |
| D6 | Délai de répercussion | **Pas de temps réel.** Le mobile relit `/me` quand l'app revient au premier plan (déjà en place) ; le web relira `/me` quand l'onglet reprend le focus (à ajouter). Un changement fait sur le web apparaît donc sur le mobile à la prochaine ouverture de l'app, et inversement. |
| D7 | À la déconnexion | Le thème reste affiché sur l'appareil (pas de retour brutal au clair). |
| D8 | Exceptions hors thème | À la manière de CMFIPraise : l'**alerte** (supprimer, déconnexion, erreur) reste **rouge** dans tous les thèmes, noir et blanc compris ; la carte des nations et les graphiques gardent leurs couleurs de données en Clair et Sombre, et passent en niveaux de gris en Noir et blanc. |
| D9 | Tests automatiques | Les deux projets n'ont aucun framework de test. Proposition : ajouter **Vitest** au web (dépendance de développement uniquement) pour tester les calculs de couleur et la règle de synchronisation. Le mobile réutilise les mêmes fonctions, copiées (règle du `CLAUDE.md` : les deux surfaces ne partagent pas de code). |
| D10 | Branches et PR | Une branche `feat/theme` dans **`shephr-app`** et une dans **`cmfipraise-backend`**, toutes deux depuis `develop`, PR vers **`develop`**. |

---

## 4. Proposition technique

### 4.1 Backend (`cmfipraise-backend`)

**Données** : une **nouvelle table** `user_preference` (Liquibase), une ligne par utilisateur, créée
au premier choix. `t_user` n'est pas modifiée : aucun impact sur les comptes existants ni sur
CMFIPraise. Pas de ligne = aucun choix = thème par défaut.

| Colonne | Type | Rôle |
|---|---|---|
| `user_id` | `BIGINT`, clé primaire, clé étrangère vers `t_user(id)`, `ON DELETE CASCADE` | le compte |
| `theme_mode` | `VARCHAR(16) NULL` | `AUTO`, `CLAIR`, `SOMBRE`, `NOIR_ET_BLANC` ; `NULL` = jamais choisi |
| `theme_accent` | `VARCHAR(7) NULL` | `#RRGGBB` ; `NULL` = accent par défaut |
| `created_at` | `TIMESTAMP NOT NULL` | création de la ligne |
| `updated_at` | `TIMESTAMP NOT NULL` | dernier changement (règle D5) |

*(Forme (1) de la décision D3b. Avec la forme (2), la table serait `user_preference(user_id,
pref_key, pref_value, updated_at)`, clé primaire `(user_id, pref_key)`.)*

**Code** : un petit module à part, `com.excellence.back.auth.preference` : entité
`UserPreference`, `UserPreferenceRepository`, `UserPreferenceService` (lire, créer ou mettre à
jour) et `UserPreferenceController`.

**Lecture**
- `GET /api/church/auth/me/preferences` → `{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A", "updatedAt": "…" }`
  (valeurs `null` si aucune ligne).
- `GET /api/church/auth/me` renvoie aussi un objet `preferences` identique, pour éviter un appel
  de plus au démarrage des apps. Champ ajouté, rien de retiré : les anciennes versions de l'app
  continuent de fonctionner.

**Écriture** : `PUT /api/church/auth/me/preferences`, réservé au compte connecté (il ne modifie
que son propre compte : l'API ne prend aucun identifiant d'utilisateur) :

```jsonc
// requête
{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A" }   // themeAccent: null = défaut
// réponse 200
{ "themeMode": "SOMBRE", "themeAccent": "#B86A4A", "updatedAt": "2026-11-05T10:12:00Z" }
```

- `400 PREFERENCE_INVALID` si le mode est inconnu ou si l'accent ne respecte pas `^#[0-9A-Fa-f]{6}$`.
- Pas de garde de module (`@RequiresModule`) : c'est une préférence du compte, pas une
  fonctionnalité payante.
- Le contrôle du **contraste** reste côté front : le serveur stocke l'accent choisi tel quel, et
  chaque surface l'ajuste à l'affichage.

**Suppression de compte (RGPD)** : la ligne de préférences est supprimée avec le compte
(`ON DELETE CASCADE`), et explicitement dans le cas d'une **anonymisation**, où le compte
`t_user` est conservé.

### 4.2 Mobile (`shephr-app/mobile`)

Même architecture que CMFIPraise :
- `theme/palettes.ts` : les **rôles de couleur** (`page`, `surface`, `texte`, `texteSecondaire`,
  `filet`, `accent`, `surAccent`, `alerte`…) et leurs valeurs pour chaque mode. Le Clair reprend
  **exactement** les couleurs actuelles (moss, parchment, ink…) : aucune régression visuelle.
- `theme/couleurs.ts` : calculs de luminance, de contraste et d'ajustement d'un accent.
- `theme/creerStyles.ts` : remplace `StyleSheet.create` par un hook qui recalcule les styles quand
  le thème change.
- `contexts/ThemeContext.tsx` : lit le choix local (AsyncStorage `app_theme`), lit `me.preferences`
  du compte, applique la règle D5 et envoie chaque changement au serveur.
- Nouvel écran **Apparence** (`app/appearance.tsx`), accessible depuis l'onglet **Profil**.
- `app.json` : `userInterfaceStyle: "automatic"` pour que le mode Automatique suive le téléphone.

### 4.3 Web (`shephr-app/web`)

- `theme/styles.css` : on garde les variables actuelles pour le Clair et on ajoute un bloc par mode,
  `:root[data-theme="sombre"] { --parchment: …; --ink-500: …; }` et `[data-theme="noirEtBlanc"]`.
  On ajoute aussi quelques variables de rôle (`--accent`, `--sur-accent`, `--page`…) pour les ~20
  fonds de marque.
- L'accent choisi est injecté en variables CSS (`--accent`, `--accent-teinte`…), calculé avec les
  mêmes règles de contraste que le mobile.
- `index.html` : un petit script applique le thème enregistré **avant** l'affichage, pour éviter
  un flash blanc au chargement.
- `hooks/useTheme.tsx` : contexte de thème, avec la même règle D5 que le mobile.
- Section **Apparence** dans la page **Paramètres** (`/settings` et `/member-settings`).
- `hooks/useAuth.tsx` : relire `/me` quand l'onglet reprend le focus (règle D6).

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
| Modifié | `src/main/java/com/excellence/back/auth/selfaccount/SelfAccountDeletionExecutor.java` (suppression de la ligne en cas d'anonymisation) |
| Modifié | doc du contrat d'API Shephr (section « Préférences du compte ») |
| Inchangé | `src/main/java/com/excellence/back/auth/User.java` et la table `t_user` |

> Les noms exacts (classes de service et de test, sens de suppression) seront confirmés à la
> lecture du code avant l'étape B1.

### 5.2 Mobile (`shephr-app/mobile`)

| Action | Fichier |
|---|---|
| Créé | `theme/palettes.ts`, `theme/couleurs.ts`, `theme/creerStyles.ts` |
| Créé | `contexts/ThemeContext.tsx` |
| Créé | `services/themeApi.ts` (`PUT /me/preferences`) |
| Créé | `app/appearance.tsx` (écran Apparence) |
| Modifié | `theme/colors.ts` (devient la palette Claire), `theme/index.ts` |
| Modifié | `app/_layout.tsx` (`ThemeProvider`, barre d'état, splash qui attend le thème) |
| Modifié | `app.json` (`userInterfaceStyle: "automatic"`) |
| Modifié | `services/authApi.ts` (`MeResponse` : objet `preferences`) |
| Modifié | `app/(tabs)/profile.tsx` (entrée « Apparence ») |
| Modifié | `i18n` fr / en (libellés de l'écran Apparence) |
| **Migrés** | **97 fichiers** qui utilisent `colors` ou une couleur en dur : 40 composants, 24 écrans `(tabs)`, 5 `(auth)`, 5 `study`, 4 `events`, 3 `hierarchie`, 2 `donation`, 6 écrans racine, `constants` (2), `utils` (2), `documents`, `d`. Liste exacte en annexe A. |

### 5.3 Web (`shephr-app/web`)

| Action | Fichier |
|---|---|
| Créé | `src/theme/palettes.ts`, `src/theme/couleurs.ts` |
| Créé | `src/hooks/useTheme.tsx` |
| Créé | `src/services/themeApi.ts` |
| Créé | `src/components/AppearanceSection.tsx` |
| Créé | `src/theme/__tests__/palettes.test.ts` (si D9 validé) |
| Modifié | `src/theme/styles.css` (blocs Sombre et Noir et blanc, variables de rôle) |
| Modifié | `index.html` (thème appliqué avant l'affichage) |
| Modifié | `src/App.tsx` (`ThemeProvider`) |
| Modifié | `src/hooks/useAuth.tsx` (relecture de `/me` au focus) |
| Modifié | `src/services/authApi.ts` (`MeResponse` : objet `preferences`) |
| Modifié | `src/pages/Settings.tsx` (section Apparence) |
| Modifié | `src/i18n/locales/fr.json` et `en.json` |
| Modifié | `package.json` (Vitest en dépendance de dev, si D9 validé) |
| **Migrés** | **52 fichiers** avec une couleur en dur ou une couleur de marque en fond : 30 pages, 20 composants, `MemberShell.tsx`, `utils/assemblyJournal.ts`. Liste exacte en annexe B. |

### 5.4 Documentation

- `shephr-app/docs/theme-plan.md` : ce document, tenu à jour à chaque étape.
- `shephr-app/CLAUDE.md` : règle de style mise à jour (« pas de couleur en dur, utiliser les
  rôles du thème »).

---

## 6. Plan d'implémentation, étape par étape

Chaque étape correspond à **un commit**, poussé sur `feat/theme`, montré à Catherine avant d'être
commité. Le **squash** n'est fait qu'à la fin, au moment du merge (consigne de JP).

| Étape | Dépôt | Contenu | Vérification avant commit |
|---|---|---|---|
| **B1** | backend | Table `user_preference` (Liquibase), entité, repository, `ThemeMode` | Le back démarre, la table existe, CMFIPraise fonctionne toujours |
| **B2** | backend | Service, `GET`/`PUT /me/preferences`, `preferences` dans `/me`, suppression RGPD, tests | Tests verts ; appels manuels 200, 400 et 401 |
| **M1** | mobile | Infrastructure : palettes, calculs, `creerStyles`, `ThemeContext` (local seulement), `app.json` | `tsc` OK ; l'app est identique en Clair |
| **M2** | mobile | Écran Apparence et entrée dans Profil | Changer de mode change l'écran Apparence |
| **M3** | mobile | Migration des composants partagés (40) | Captures Clair / Sombre / Noir et blanc |
| **M4** | mobile | Migration des écrans (57) | Recette visuelle complète du mobile |
| **M5** | mobile | Synchronisation avec le compte (lecture `/me`, envoi `PUT`) | Changement sur le mobile visible dans `GET /me/preferences` |
| **W1** | web | Variables par mode dans `styles.css`, script d'`index.html`, `useTheme` (local) | Le web est identique en Clair |
| **W2** | web | Section Apparence dans Paramètres | Changer de mode recolore tout le site |
| **W3** | web | Migration des 52 fichiers | Recette visuelle complète du web |
| **W4** | web | Synchronisation avec le compte, relecture au focus | Changement sur le web visible sur le mobile |
| **D1** | les deux | Documentation (`theme-plan.md`, `CLAUDE.md`) et sanity check des RDG | Tableau des RDG rempli |

Ordre : **backend d'abord** (B1, B2), parce que les deux surfaces en dépendent pour la
synchronisation. Ensuite mobile, puis web.

---

## 7. Plan de recette

**Environnement** : back local (profil `local`, PostgreSQL), web `npm run dev`, mobile
`npx expo start --web` au format téléphone, plus un vrai téléphone (Expo Go) pour le mode
Automatique et la barre d'état.

**R1 — Chaque mode, chaque surface.** En Clair, Sombre et Noir et blanc, parcourir les écrans du
**membre** (objectifs, assemblée, actions, étude, documents, paramètres) et du **dirigeant**
(tableau de bord, objectifs, assemblée, événements, étude, membres, structure, hiérarchie). Aucun
texte illisible, aucun bloc resté clair en Sombre, aucune couleur en Noir et blanc sauf l'alerte.

**R2 — Non-régression.** En Clair avec l'accent par défaut, le web et le mobile sont visuellement
identiques à `develop` (captures avant / après).

**R3 — Contraste automatique.** Avec un accent jaune pâle puis bleu nuit : boutons et liens
lisibles (≥ 4,5:1 pour le texte, ≥ 3:1 pour les icônes), mesuré par script sur chaque page.

**R4 — Synchronisation web → mobile.** Connecté avec le même compte : choisir Sombre et un accent
argile sur le web, puis rouvrir l'app mobile : elle est en Sombre avec l'accent argile.

**R5 — Synchronisation mobile → web.** Choisir Noir et blanc sur le mobile, puis revenir sur
l'onglet web : il passe en Noir et blanc sans rechargement manuel.

**R6 — Conflit.** Choix A sur le web, puis choix B sur le mobile : le dernier choix (B) s'impose
partout.

**R7 — Non connecté.** Sur la page de login, choisir Sombre, puis se connecter avec un compte qui
n'a jamais choisi : le compte enregistre Sombre. Avec un compte qui a déjà un choix : le choix du
compte s'applique.

**R8 — Hors ligne.** Mobile en mode avion : changer de thème fonctionne localement, et le choix est
envoyé au serveur au retour du réseau.

**R9 — Mode Automatique.** Basculer le réglage clair / sombre du téléphone et du navigateur :
l'app suit sans redémarrer.

**R10 — Pas de flash.** Recharger le web et relancer le mobile en Sombre : aucun écran blanc au
démarrage.

**R11 — Backend.** `PUT /me/preferences` avec un mode invalide → 400 ; avec un accent `#12` → 400 ;
sans jeton → 401 ; un compte ne peut pas modifier celui d'un autre (l'API n'accepte pas
d'identifiant). Un compte sans ligne renvoie des préférences `null`, et le premier `PUT` crée la
ligne. En base, `t_user` est inchangée.

**R11b — Suppression de compte.** Supprimer puis anonymiser un compte qui a des préférences : sa
ligne `user_preference` a disparu dans les deux cas.

**R12 — Sanity check des RDG.** Rôles (membre, dirigeant, LEADER, SECRETARIAT, superAdmin) et
modules (verrous Néhémie et Caleb, modules désactivés) inchangés : le thème ne touche à aucune
condition, aucun appel d'API ni aucune navigation existants.

---

## 8. Risques

- **Volume côté mobile** (1 675 usages) : migration en deux étapes (composants, puis écrans), avec
  une recette visuelle à chaque étape.
- **Contrat d'API partagé** : les champs sont ajoutés à `MeResponse` ; il faut les porter dans les
  types des **deux** surfaces (règle n°1 du `CLAUDE.md`).
- **CMFIPraise utilise le même back** : la nouvelle table n'est lue par aucun écran CMFIPraise et
  `t_user` n'est pas modifiée, donc aucun effet sur son app. À vérifier à l'étape B1.
- **Pas de temps réel** (D6) : si JP veut une répercussion instantanée, il faudrait du push ou du
  websocket, ce qui sort de cette spec.

---

## Annexe A — fichiers mobiles migrés (97)

Tout fichier de `mobile/` qui importe `@/theme` ou contient une couleur en dur (`develop`, 05/11/2026). Les deux fichiers de `theme/` sont l'infrastructure elle-même.

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
- `mobile/components/auth/SocialSignInButtons.tsx`
- `mobile/components/documents/PdfReader.tsx`
- `mobile/components/push/ModaleActivationPush.tsx`
- `mobile/components/push/usePushNotifications.ts`
- `mobile/constants/categories.ts`
- `mobile/constants/goalCategories.ts`
- `mobile/theme/colors.ts`
- `mobile/theme/index.ts`
- `mobile/utils/assemblyJournal.ts`
- `mobile/utils/demandes.tsx`

## Annexe B — fichiers web migrés (52)

Tout fichier de `web/src/` avec une couleur en dur ou une couleur de marque (`--green-700/800/900`, `--earth-500/600/700`) susceptible de servir de fond (`develop`, 05/11/2026).

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
- `web/src/pages/Landing.tsx`
- `web/src/pages/Login.tsx`
- `web/src/pages/MemberCare.tsx`
- `web/src/pages/MemberGoals.tsx`
- `web/src/pages/MonMinistere.tsx`
- `web/src/pages/MyActions.tsx`
- `web/src/pages/Offers.tsx`
- `web/src/pages/Onboarding.tsx`
- `web/src/pages/Privacy.tsx`
- `web/src/pages/Requests.tsx`
- `web/src/pages/ResetPassword.tsx`
- `web/src/pages/Settings.tsx`
- `web/src/pages/Study.tsx`
- `web/src/pages/StudySession.tsx`
- `web/src/pages/Unites.tsx`
- `web/src/pages/Users.tsx`
- `web/src/utils/assemblyJournal.ts`
