# Thème — corrections à apporter à `theme-plan.md`

> Relecture du 06/11/2026, à l'attention de Catherine. Les chiffres et les chemins ont été vérifiés sur
> le code après le rebase de `feat/theme` sur `main`, dans `shephr-app` et `cmfipraise-backend`.
> Corrige `docs/theme-plan.md` point par point, dans l'ordre du plan. Aucun code avant la validation
> du plan corrigé. Les décisions de Jean Philippe (B1 à B5) sont tranchées : voir la partie 2.

---

## 1. Corrections à faire

### En-tête et état des lieux (§2)

1. Remplacer la base `develop` par `main` dans l'en-tête, le titre du §2, R2 et les introductions des
   annexes A et B. Pour D10, voir la décision B1.
2. Mettre à jour les chiffres du §2 :
   - mobile : **1 704** `colors.x` dans **92** fichiers ;
   - web : **~1 670** `var(--…)` et **151** couleurs en dur dans les `.ts` et `.tsx`, plus **86** dans
     `styles.css`, à ajouter ;
   - couleurs en dur du mobile : à recompter.
3. Réécrire la conséquence « Web : beaucoup plus simple ». Une même variable sert à la fois de texte et
   de fond : les verts foncés sont utilisés **172 fois en texte et 21 fois en fond**. La redéfinir ne
   suffit donc pas.

### Décisions (§3)

4. **D5** : retirer `themeUpdatedAt`, qui n'existe pas dans l'API, et ne plus comparer de dates. Nouvelle
   règle : le serveur gagne, sauf si un envoi local est en attente.
5. **D6** : corriger « déjà en place ». Le mobile ne relit `/me` au premier plan que si le profil vient
   du cache (`mobile/contexts/AuthContext.tsx:354`). Cette relecture est à ajouter.
6. **D6 et §4.3** : au retour sur l'app ou l'onglet, lire `GET /me/preferences` plutôt que `/me`. Sur le
   web, `refreshMe` recrée `me`, dont dépendent plusieurs effets.
7. **D8** : en Noir et blanc, les statuts et les couleurs de catégories passent en gris (décision B3).
8. **D2** : l'accent remplace seulement la famille verte (décision B4).

### Backend (§4.1)

9. Passer `user_id` de `BIGINT` à **`UUID`** : `t_user.id` est en UUID, la migration échouerait sinon.
10. Ajouter la purge dans `prepare()` de `SelfAccountDeletionExecutor`, l'étape commune à la suppression
    et à l'anonymisation, plutôt que dans le seul cas de l'anonymisation. Mettre à jour la ligne
    correspondante du §5.1.
11. Préciser le `PUT` : l'accepte-t-on avec `themeMode: null` ? Remplace-t-il tout ou seulement les
    champs envoyés ?

### Mobile (§4.2, §5.2)

12. Ajouter aux fichiers modifiés `contexts/AuthContext.tsx` (relecture au premier plan) et le mécanisme
    d'envoi en attente de `ThemeContext`.
13. Donner la vraie source à réutiliser : branche `feat-darckmode` de `cmfipraise-app`, dossier
    `utils/theme/` et `contexts/ThemeContext.tsx`. Elle n'est pas encore dans `main` ni dans `develop`.
14. Lister les éléments à traiter hors `StyleSheet` :
    - `StatusBar` et `contentStyle` en dur dans `_layout.tsx` ;
    - barre d'onglets ;
    - `placeholderTextColor`, `RefreshControl`, `ActivityIndicator` ;
    - `BlurView` de `FeatureLock` ;
    - constantes hors composant (`constants/categories.ts`, `utils/demandes.tsx`).
15. Préciser que `userInterfaceStyle` demande un build natif, et qu'Auto n'arrivera aux utilisateurs
    qu'avec une nouvelle version sur les stores (`expo-updates` n'est pas installé).

### Web (§4.3, §5.3)

16. Prévoir la migration des 86 couleurs en dur de `styles.css` (barre latérale, boutons, modales, page
    de login) dans les étapes W1 à W3.
17. Ajouter `color-scheme` pour les champs natifs et les barres de défilement.
18. Le script d'`index.html` ne peut pas importer `couleurs.ts` : préciser qu'il lit des valeurs déjà
    calculées et stockées dans `localStorage`.

### Nouvelle section, à placer avant M3 et W1

19. Ajouter un **tableau « usage → rôle »**, par exemple :

    | Usage actuel | Rôle |
    |---|---|
    | `moss` en fond | `accent` |
    | `moss` en texte | `texte` ou `accent`, selon le cas |
    | `white` sur fond de marque | `surAccent` |

    `colors.white` est en réalité une couleur crème, et `colors.moss` sert **53 fois en texte et 29 fois
    en fond**. La migration ne peut donc pas se faire par rechercher-remplacer.

### Étapes (§6)

20. Remplacer « montré à Catherine » par le nom du relecteur.
21. Découper M4 (56 fichiers) et W3 (50 fichiers) par domaine, un commit par domaine. M3 passe à 41
    composants.
22. Renommer l'étape « D1 », qui porte le même nom que la décision D1.

### Recette (§7)

23. **Environnement, R9 et R10** : remplacer Expo Go par un build de développement EAS.
24. **R8** : décrire le comportement attendu avec l'envoi en attente, sans que `/me` écrase le choix
    local.
25. **R6** : retirer toute notion de comparaison de dates.
26. **Nouveau test PDF** : en Sombre, le journal PDF reste identique à celui du Clair, sur le web et le
    mobile.
27. **Nouveau test téléphone partagé** : A se déconnecte, B se connecte sans avoir rien choisi : le
    compte de B ne reçoit pas le thème de A, aucun `PUT` n'est envoyé et B voit le thème par défaut.
27 bis. **Nouveau test pages marketing** : en Sombre et en Noir et blanc, la landing et `/offres`, avec
    la modale « J'ai un code », restent identiques au Clair.

### Annexes

Les journaux PDF gardent des couleurs fixes et les pages marketing restent en Clair (B5) : ils sortent
des fichiers à migrer. `LinkConfirmModal` est arrivé avec `main`.

28. **Annexe A** : ajouter `mobile/components/auth/LinkConfirmModal.tsx` et retirer
    `mobile/utils/assemblyJournal.ts`. Le total reste 97, à corriger au §5.2 (41 composants, utils 1).
29. **Annexe B** : ajouter `web/src/components/LinkConfirmModal.tsx` et retirer
    `web/src/utils/assemblyJournal.ts`, `web/src/pages/Landing.tsx` et `web/src/pages/Offers.tsx`. Le
    total passe à **50**, à corriger au §5.3 (28 pages, 21 composants, `MemberShell.tsx`, sans `utils`).

---

## 2. Décisions de Jean Philippe (06/11/2026)

| # | Question | Décision | À reporter dans le plan |
|---|---|---|---|
| B1 | Cible des PR (D10) | **`develop`, remis au niveau de `main`** | D10 : branches `feat/theme` à jour de `main`, PR vers `develop`. Ne pas ouvrir de PR avant la remise à niveau de `develop` dans les deux dépôts |
| B2 | Thème quand on n'est pas connecté (D4, R7) | **Ni sélecteur ni envoi au compte** | Supprimer l'envoi de D4. Pages publiques : dernier thème de l'appareil, sinon le défaut. Compte sans préférence : thème par défaut (§4.1). Seule une action dans l'écran Apparence envoie un `PUT`. Réécrire R7 selon ces règles |
| B3 | Noir et blanc : statuts et catégories (D8, R1) | **Tout en gris**, seule l'alerte reste rouge | Compléter D8. Libellés et icônes distinguent les statuts et les catégories |
| B4 | Ce que remplace l'accent (D2) | **Seulement la famille verte** | Compléter D2 et les palettes. La couleur terre reste secondaire |
| B5 | La landing et `/offres` suivent-elles le thème ? | **Non : Clair fixe** | Voir ci-dessous |

**Mise en œuvre de B5.** Un bloc `:root[data-theme="sombre"]` s'applique à toute la page : une page ne
peut pas revenir au Clair si ses valeurs ne sont définies que sur `:root`. Il faut donc :

- à reporter au §4.3 : déclarer aussi les variables du Clair sur un sélecteur `[data-theme="clair"]` ;
- poser `data-theme="clair"` sur le conteneur racine de `Landing.tsx` et d'`Offers.tsx` (une ligne, ces
  deux fichiers ne sont pas migrés pour autant) ;
- ne pas injecter l'accent de l'utilisateur dans ce conteneur : ces pages gardent l'accent par défaut.

`VoucherRedeemModal` reste à migrer, car `LockedFeature` l'utilise aussi. Sur `/offres`, elle hérite du
Clair : aucune modale du web ne passe par un portail. Les toasts, montés au niveau de `App.tsx`, suivent
en revanche le thème de l'utilisateur : c'est acceptable.
