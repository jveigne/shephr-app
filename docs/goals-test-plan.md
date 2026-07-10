# Plan de test — Module Goals (Objectifs / But Quinquennal)

> Contexte : le module **Goals** a été réactivé le 2026-07-10 (`FEATURES.goals = true`
> dans `web/src/config/features.ts`). Côté **mobile**, Goals n'est pas piloté par un
> flag de build : sa visibilité dépend du rôle serveur (`hasGoalsAccess(me)`).
> Ce plan vérifie que la réactivation est complète et que le module fonctionne de bout en bout.

## 1. Périmètre & mécanismes de gating

| Surface | Mécanisme | Point de contrôle |
| --- | --- | --- |
| **Web** (`shephr-web`) | Flag statique `FEATURES.goals` | Route `/goals` (`App.tsx`), entrée de menu (`Sidebar.tsx`), page d'accueil `HOME` |
| **Mobile** (`shephr`) | Serveur `hasGoals = hasGoalsAccess(me)` (rôle `goalRole` élevé ou `superAdmin`) | Onglet Goals (`(tabs)/_layout.tsx`), raccourci accueil (`home.tsx`) |

**Rappel des règles métier de référence** (voir `services/goalsApi.ts`) :
- **RG-08** — engagement effectif d'un niveau = `MAX(agrégat des enfants, meilleure foi du niveau)` ; la source affichée est `AGGREGATE` ou `FAITH`.
- **RG-11** — un avancement (`progress`) reste éditable/supprimable **24 h** par son créateur uniquement.
- **Anti-spam rappels** — un rappel à un dirigeant d'unité non soumise est bloqué **24 h** côté backend.
- **Verrouillage** — après soumission (`submit`), les pledges passent `locked = true` et deviennent non modifiables.
- **Annualisation** — un `Goal` expose `currentYear` + `openYears` ; les vues acceptent `?year=`.

## 2. Pré-requis

- [ ] Backend `cmfipraise-backend` accessible (dev : `https://cmfipraise-backend-dev-c586.up.railway.app`).
- [ ] Un **Goal actif** existe (sinon les écrans renvoient l'état vide « aucun objectif », 404 attendu).
- [ ] Comptes de test couvrant les rôles `goalRole` :
  - [ ] `MEMBRE` (fidèle simple — ne doit **pas** accéder au web)
  - [ ] `DIRIGEANT` (unité + sous-arbre « Mon périmètre »)
  - [ ] `DIRIGEANT_SENIOR` (zones du sous-arbre)
  - [ ] `DIRIGEANT_COORDINATEUR` (pays)
  - [ ] `LEADER` / `SECRETARIAT` (vue ministère-large / globale)
  - [ ] `superAdmin`
- [ ] Une unité avec un **dirigeant rattaché**, une zone, un pays, un continent (pour l'agrégation et les rappels).
- [ ] Web : `npm run dev` dans `web/`. Mobile : `expo start` dans `mobile/`.

## 3. Vérification de l'activation (fumée)

| # | Étape | Résultat attendu |
| --- | --- | --- |
| 3.1 | `web/src/config/features.ts` | `donations: false`, `goals: true` |
| 3.2 | `npx tsc -b` dans `web/` | Aucune erreur de type |
| 3.3 | Connexion web (dirigeant+) → `/` | Redirige vers `/goals` (car `donations:false` → HOME = `/goals`) |
| 3.4 | Menu latéral web | Entrée **Objectifs** (icône sparkle) visible dans « Pilotage » |
| 3.5 | URL directe `/goals` | Charge la page Goals (plus de redirection vers member-care) |
| 3.6 | Mobile, user avec `goalRole` élevé | Onglet **Objectifs** visible dans la tab bar |
| 3.7 | Mobile, user `MEMBRE` pur | Onglet Objectifs **absent** (server-driven, comportement inchangé) |

## 4. Web — Contrôle d'accès & routing

| # | Cas | Attendu |
| --- | --- | --- |
| 4.1 | `MEMBRE` pur tente le web | Refusé (`hasMinistryAccess=false`) — pas d'accès Espace ministère |
| 4.2 | Dirigeant+ sans scope Goals | Page Goals en état « aucun périmètre » (pas de crash) |
| 4.3 | Aucun Goal actif (404) | État vide « aucun objectif » propre, pas d'erreur rouge |
| 4.4 | Route inconnue `/xyz` | Redirige vers HOME (`/goals`) |
| 4.5 | Déconnexion puis `/goals` | Redirige vers `/login` |

## 5. Web — Engagements (pledges) DIRECT — UC-DIR-08/09

| # | Cas | Attendu |
| --- | --- | --- |
| 5.1 | Dirigeant d'unité ouvre Goals | Table des catégories (Livres, Missionnaires, Urgence, Hall, Effectifs) avec colonnes Engagé / Versé / Progression / Statut |
| 5.2 | Créer un pledge (montant, catégorie `CURRENCY`) | Ligne mise à jour, montant formaté avec symbole devise |
| 5.3 | Créer un pledge en `COUNT` (ex. Effectifs) | Saisie en nombre, libellé d'unité correct |
| 5.4 | Modifier un pledge non verrouillé | Valeur mise à jour (`PATCH /pledges/:id`) |
| 5.5 | Montant/décimales invalides | Bouton désactivé / message d'erreur, pas d'envoi |

## 6. Web — Soumission & verrouillage — UC-DIR-11

| # | Cas | Attendu |
| --- | --- | --- |
| 6.1 | Soumettre ses pledges | Dialogue de confirmation → `submittedAt` renseigné, `lockedPledges` = nb |
| 6.2 | Après soumission | Pledges affichés `locked` — champs d'édition désactivés |
| 6.3 | Tenter de modifier un pledge verrouillé | Édition impossible (bouton disabled) |
| 6.4 | Deadline dépassée + non soumis | Ligne/unité marquée `late` |

## 7. Web — Suivi d'avancement (progress) — UC-DIR-12/13/14

| # | Cas | Attendu |
| --- | --- | --- |
| 7.1 | Ajouter un avancement sur un pledge | Barre de progression + % mis à jour |
| 7.2 | Versé > engagé | **Barre déborde au-delà de 100 %** : segment vert jusqu'à l'objectif, segment terre au-delà, repère blanc sur la ligne 100 %, % en gras couleur terre |
| 7.3 | Éditer un avancement < 24 h (créateur) | Autorisé (`isProgressEditable = true`) |
| 7.4 | Éditer un avancement > 24 h | **Refusé** (RG-11) |
| 7.5 | Éditer l'avancement d'un autre utilisateur | Refusé |
| 7.6 | Supprimer un avancement | Retiré, toast « supprimé », total recalculé |

## 8. Web — Engagements de foi & agrégation (RG-08) — Lot 4.2/4.5

| # | Cas | Attendu |
| --- | --- | --- |
| 8.1 | Créer un faith-pledge sur une zone | Visible dans la liste des engagements de foi du niveau |
| 8.2 | Agrégat zone : foi < somme des enfants | `source = AGGREGATE`, `effectiveAmount = somme enfants` |
| 8.3 | Agrégat zone : foi > somme des enfants | `source = FAITH`, `effectiveAmount = foi` |
| 8.4 | Modifier / supprimer un faith-pledge | Recalcul de l'effectif du niveau |
| 8.5 | Niveau `units` | Agrégat seulement, **pas** de saisie de foi |

## 9. Web — Vues dirigeant / périmètre — Lot 3.5 / 4.7

| # | Cas | Attendu |
| --- | --- | --- |
| 9.1 | `DIRIGEANT` / `DIRIGEANT_SENIOR` | Vue « Mon périmètre » = son **sous-arbre** (≠ zone géographique) |
| 9.2 | Statut des unités d'une zone | Liste avec `submitted`, `late`, `hasLeader`, `pledgeCount` |
| 9.3 | Drill-down d'une unité | Détail lecture seule : engagé + versé par catégorie |
| 9.4 | Envoyer un rappel à une unité non soumise | Notification envoyée au dirigeant (`sentToName`) |
| 9.5 | Renvoyer un rappel < 24 h | **Bloqué** (anti-spam) — message d'erreur explicite |
| 9.6 | Rappel sur unité sans dirigeant (`hasLeader=false`) | Action indisponible / message clair |

## 10. Web — Vue globale (LEADER / SECRETARIAT / superAdmin) — Lot 4.3 / 7.1

| # | Cas | Attendu |
| --- | --- | --- |
| 10.1 | Résumé global | Totaux par catégorie + répartition par continent (`totalUnits`, `submittedUnits`) |
| 10.2 | Carte du monde (nations) | Nations colorées selon `submissionRate` ; nations en retard mises en évidence |
| 10.3 | Correspondance carte | Code ISO alpha-2 → bon pays sur la carte |
| 10.4 | Timeline (versé cumulé/mois) | Courbe cohérente aux niveaux units/zones/countries/continents |

## 11. Web — Annualisation — Lot 4.6

| # | Cas | Attendu |
| --- | --- | --- |
| 11.1 | Sélecteur d'année (`openYears`) | Bascule d'année recharge pledges/agrégats/progress avec `?year=` |
| 11.2 | Année courante par défaut | Sans paramètre, retombe sur `currentYear` |

## 12. Web — i18n & états

| # | Cas | Attendu |
| --- | --- | --- |
| 12.1 | Bascule FR ↔ EN (sidebar) | Tous les libellés Goals traduits (catégories `name`/`nameEn`) |
| 12.2 | Formats devise & date | Cohérents avec la locale active |
| 12.3 | Erreur réseau (backend coupé) | État d'erreur propre, pas d'écran blanc |

## 13. Mobile — Goals (server-driven)

> Aucune modification de code mobile n'a été faite. Objectif : **non-régression**.

| # | Cas | Attendu |
| --- | --- | --- |
| 13.1 | User `goalRole` élevé | Onglet **Objectifs** présent |
| 13.2 | User `MEMBRE` | Onglet **Objectifs** absent |
| 13.3 | Écran Goals index | Catégories + états vides gérés (`noGoal`, `noUnit`, `loadingError`) |
| 13.4 | Créer / éditer un pledge (`pledge/[categoryId]`) | Sauvegarde OK ; verrouillé après soumission |
| 13.5 | Soumettre (`submit`) | Confirmation + `SubmitResponse` |
| 13.6 | Ajouter un avancement (`progress`) | Progression mise à jour |
| 13.7 | Historique (`history`) | Édition possible < 24 h uniquement (RG-11) |
| 13.8 | Raccourci Goals sur l'accueil | ⚠️ Masqué tant que `FEATURES.donations = true` sur mobile (condition `!FEATURES.donations && hasGoals`) — **comportement connu, non modifié** |

## 14. Non-régression (hors Goals)

| # | Cas | Attendu |
| --- | --- | --- |
| 14.1 | Dons masqués (web `donations:false`) | `/dashboard`, `/donations`, `/exports` redirigent vers HOME ; pas d'entrée de menu Dons |
| 14.2 | Member Care | Module toujours accessible si `MEMBER_CARE` activé (entrée « Suivi pastoral ») |
| 14.3 | Organisation / Structure | Ministères / Zones / Localités / Unités inchangés |
| 14.4 | Invitations / activation de compte | `/invitation/:token`, `/activate` fonctionnels |

## 15. Feuille de validation

| Section | Statut (OK / KO / N/A) | Testeur | Date | Notes |
| --- | --- | --- | --- | --- |
| 3. Activation | | | | |
| 4. Accès & routing | | | | |
| 5. Pledges | | | | |
| 6. Soumission | | | | |
| 7. Progress | | | | |
| 8. Foi & agrégation | | | | |
| 9. Périmètre / rappels | | | | |
| 10. Vue globale / carte | | | | |
| 11. Annualisation | | | | |
| 12. i18n & états | | | | |
| 13. Mobile | | | | |
| 14. Non-régression | | | | |

---

### Note pour un « Goals only » complet côté web

Aujourd'hui, avec `donations:false` + `goals:true`, l'accueil bascule sur `/goals` et
Goals est visible partout côté web. Pour repasser plus tard en livraison mixte
(Dons **et** Goals), remettre `donations:true` : dashboard, dons et exports réapparaissent
automatiquement et HOME redevient `/dashboard`.

### Backend appelé par le web

- **Dev** : proxy Vite (`web/vite.config.ts`) → `/api/*` redirigé vers le backend Railway
  `https://cmfipraise-backend-dev-c586.up.railway.app` (surchargeable via `VITE_DEV_PROXY_TARGET`).
- **Prod** : `web/.env.production` → `VITE_API_BASE_URL=https://cmfipraise-backend-dev-c586.up.railway.app`.
- **Mobile** : `mobile/app.json` → `extra.API_URL` (même backend).
