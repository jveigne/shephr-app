# Member Care (web ministère) — reste à faire

> ⚠ **Document historique — remplacé par le plan du 23/09/2026**
> `cmfipraise-backend/docs/shephr/23_09_2026/01_Plan_Vie_Assemblee_Member_Care.md`
> (décisions D-ASM-01 à D-ASM-15, règles RG-MCR-* v2). La refonte web a été faite au **Lot L7** (23/09).
>
> Ce qui change par rapport à ce document :
> - **D-ASM-01 / D-ASM-02 (JP 23/09)** : une fiche = un compte `MEMBRE` de l'assemblée, **automatique**.
>   Plus de création, d'édition d'identité (prénom/nom/contact viennent du compte) ni de suppression :
>   `createRecord`, `updateRecord` (identité) et `deleteRecord` ont été **retirés** de `memberCareApi.ts`,
>   ainsi que les endpoints backend `POST /records`, `DELETE /records/{id}`, `POST /records/{id}/link`,
>   `GET /export`. Les §1 (suppression) et §3 (lier une fiche à un compte) ci-dessous sont donc **caducs**.
> - Les fiches sont adressées par le **userId** du membre : `GET /records/{userId}`,
>   `PATCH /records/{userId}` (`{ note }`), `PATCH /records/{userId}/status`.
> - **D-ASM-04 / D-ASM-05 (JP 23/09)** : lecture = dirigeant(s) de l'assemblée + chaîne de leurs superviseurs
>   (pas la géographie) ; écriture = `DIRIGEANT_UNITE` de l'assemblée uniquement (`canEdit` serveur).
>   Le sélecteur d'assemblée est alimenté par `GET /member-care/units`.
> - **D-ASM-08 / RG-MCR-10** : la fiche affiche les présences aux réunions si le module `ASSEMBLY` est actif.
> - **D-ASM-09 (JP 23/09)** : Redevabilité / relances (`/overview`, `/reminders`, `/config`) **gelées**.
> - Restent valables : §2 (gestion du référentiel de statuts, toujours hors UI — plan §8) et le
>   hors-périmètre « config fréquence » / « export CSV ».
>
> Le contenu ci-dessous est conservé pour mémoire (état au 29/06/2026).

---

> Horodatage : 2026-06-29 17:13
> Contexte : la livraison « Member Care only » (décision JP 2026-06-27) cible le web ministère (`shephr-app/web`).
> Le backend (`cmfipraise-backend`, package `com.excellence.back.membercare`) expose déjà toutes les capacités ci-dessous.

## ✅ Fait dans cette session
- **Édition de fiche** côté web :
  - `updateRecord(id, body)` ajouté dans `src/services/memberCareApi.ts` (PATCH `/api/church/member-care/records/{id}`).
  - Mode édition dans le modal détail de `src/pages/MemberCare.tsx` (bouton « Modifier », formulaire prénom/nom/téléphone/email/note, Enregistrer/Annuler), gardé par `canEdit`.
  - Clé i18n `memberCare.recordUpdated` (fr + en).
  - `npx tsc -b` : OK.

## ⛔ Explicitement HORS périmètre (décision JP)
- **Config fréquence de redevabilité** (`GET/PATCH /config`) — non souhaité.
  - Note : la redevabilité fonctionne sans : `overview()` retombe sur `MONTHLY` par défaut.
- **Export CSV** (`GET /export`) — non souhaité.

## 🔲 Reste à faire (web)

### 1. Suppression de fiche — effort minime
- L'API web `deleteRecord(id)` **existe déjà** dans `src/services/memberCareApi.ts` mais n'est appelée nulle part.
- À faire : bouton « Supprimer » dans le modal détail (gardé par `canEdit`), avec confirmation
  (réutiliser `common.deleteTitle` / `common.deleteConfirm` / `common.delete`).
- À la réussite : invalider `['mc-records']` + `['mc-overview']`, fermer le modal, toast.
- Backend : `DELETE /api/church/member-care/records/{id}` (soft-delete via colonne `deleted`).

### 2. Gestion du référentiel de statuts — non bloquant
- Permettre à un ministère de créer / éditer / réordonner / (dés)activer ses statuts spirituels.
- Backend dispo :
  - `POST /statuses` (`createStatus` — **déjà dans l'API web**, pas branché à l'UI)
  - `PATCH /statuses/{id}` (`updateStatus` — **à ajouter dans l'API web**)
- À faire : section/écran de gestion (table des statuts + modal create/edit : label, couleur, ordre, actif).
- Non bloquant pour les tests : `listStatuses()` auto-amorce des statuts par défaut au premier accès
  (`MemberCareServiceImpl.seedDefaultStatuses`).

### 3. Lier une fiche à un compte applicatif — plus gros morceau
- Backend : `POST /records/{id}/link` (`LinkRequest { userId }`), champ `linkedUserId` déjà renvoyé dans la fiche.
- À faire :
  - `linkAccount(id, userId)` dans l'API web (absent).
  - UI : sélecteur d'utilisateur (recherche) dans le modal détail + affichage de l'état « lié ».
  - Dépend d'un endpoint de recherche d'utilisateurs dans le périmètre (à confirmer côté backend).

## Récap parité backend ↔ web
| Capacité backend | API web | UI web |
|---|---|---|
| listStatuses / createStatus | ✅ / ✅ | ❌ (gestion statuts) |
| updateStatus | ❌ | ❌ |
| listRecords / createRecord | ✅ / ✅ | ✅ |
| getRecord (détail + historique) | ✅ | ✅ |
| **updateRecord (édition)** | ✅ | ✅ *(fait cette session)* |
| changeStatus (historisé) | ✅ | ✅ |
| deleteRecord | ✅ | ❌ (à brancher — §1) |
| linkAccount | ❌ | ❌ (§3) |
| overview / reminder | ✅ / ✅ | ✅ |
| config get/update | ❌ | ❌ (hors périmètre) |
| export CSV | ❌ | ❌ (hors périmètre) |

## Avant les tests bout à bout en local
- Backend : `mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=local"` (PostgreSQL localhost:5432).
- S'assurer que l'utilisateur de test a accès au module **MEMBER_CARE** (module payant → abonnement actif, ou activé) et un rôle dirigeant avec une unité dans son périmètre (sinon création de fiche impossible).
- Web : `npm run dev`.
- Parcours minimal testable dès maintenant (édition incluse) : créer une fiche → changer le statut (historisé) → **éditer la fiche** → onglet Redevabilité (à jour / en retard) → relancer une unité en retard.
