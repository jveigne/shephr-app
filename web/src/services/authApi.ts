import { apiClient } from './apiClient';

// --- Legacy admin-users role model (still used by adminApi/Users page; aligned later in Lot 1.2/4.3)
export type UserRole = 'MEMBER' | 'LEADER' | 'ADMIN';
export type LeaderLevel = 'JUNIOR' | 'SENIOR' | null;

// --- Real role model exposed by the backend (ModuleRole + superAdmin) — Lot 2.1 contract
// Lot 3.5 — organigramme : DIRIGEANT_LEADER renommé DIRIGEANT_SENIOR + nouveau DIRIGEANT_UNITE.
export type ModuleRole =
  | 'MEMBRE'
  | 'DIRIGEANT_UNITE'
  | 'DIRIGEANT'
  | 'DIRIGEANT_SENIOR'
  | 'DIRIGEANT_COORDINATEUR'
  | 'LEADER'
  | 'SECRETARIAT';

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export type Language = 'FR' | 'EN';

// Mirrors com.excellence.back.donation.auth.dto.MeResponse
export interface MeResponse {
  id: string;
  email: string | null;
  /** A1 — identifiant de connexion (null pour les comptes historiques). */
  username: string | null;
  fullName: string;
  superAdmin: boolean;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  ministryId: string | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  active: boolean;
  // Lot 2.1 — enrichissements /me :
  /** Langue de préférence (UC-TRV-09). */
  language: Language | null;
  /** Date d'inscription (ISO-8601). */
  registeredAt: string | null;
  /** Nom du DIRIGEANT de l'unité ([DÉCISION V1.8]) ; null si non rattaché / sans dirigeant distinct. */
  leaderName: string | null;
  // Lot 4.2 — périmètre GOALS (UC-LDR-04/05, COO-04/05) :
  /** Unité du DIRIGEANT côté Goals ; null sinon. */
  goalUnitId: string | null;
  /**
   * Palier A2 — assemblées gérées côté Goals, « home » comprise (vide pour un simple membre).
   * Prérequis du drill-down A3 : sans ces ids, impossible de cibler une autre assemblée.
   */
  goalUnitIds: string[] | null;
  /** Zone du DIRIGEANT_SENIOR côté Goals ; null sinon. */
  goalZoneId: string | null;
  /** Chantier B (décision #7) — ville du dirigeant de ville ; null sinon. */
  donationCityId: string | null;
  goalCityId: string | null;
  /** Multi-rattachements (home + set) : villes d'un DIRIGEANT / régions d'un SENIOR ; vides sinon. */
  goalCityIds: string[] | null;
  goalZoneIds: string[] | null;
  /** Pays du DIRIGEANT_COORDINATEUR côté Goals ; vide sinon. */
  goalCountryIds: string[] | null;
  /** Lot 4.8 — pays qu'un SECRETARIAT/LEADER coordonne explicitement (assignés par SUPER_ADMIN). */
  coordinatedCountryIds: string[] | null;
  // Périmètre LISIBLE (noms résolus) — affichage explicite dans le profil, selon le leadership :
  /** Noms des unités rattachées (home + multi-unités, tous modules) ; vide sinon. */
  unitNames: string[] | null;
  /**
   * Palier A2 — mêmes assemblées que `unitNames`, sous forme structurée. `unitNames` reste servi
   * pour la rétro-compatibilité ; préférer `assemblies` dès qu'on a besoin de l'id ou de la ville
   * (« Béthel » existe dans plusieurs villes).
   * Mirrors com.excellence.back.donation.auth.dto.MeAssemblyResponse
   */
  assemblies: Array<{ id: string; name: string; cityName: string | null }> | null;
  /** Noms des zones rattachées (DIRIGEANT_SENIOR ou région de la ville) ; vide sinon. */
  zoneNames: string[] | null;
  /** Chantier B — noms des villes rattachées (dirigeant de ville) ; vide sinon. */
  cityNames: string[] | null;
  /** Noms des pays rattachés (DIRIGEANT_COORDINATEUR) ; vide sinon. */
  countryNames: string[] | null;
}

/** A role strictly above MEMBRE in a module. */
function isElevated(role: ModuleRole | null): boolean {
  return role != null && role !== 'MEMBRE';
}

/**
 * Web Espace ministère access rule (plan Lot 2.1 — « web réservé dirigeants+, MEMBRE refusé »):
 * superAdmin, or any module role above MEMBRE. A pure member uses the mobile app.
 */
export function hasMinistryAccess(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin) return true;
  return isElevated(me.donationRole) || isElevated(me.goalRole);
}

/**
 * Espace membre « Mes objectifs » (Feature A) : un MEMBRE du module Goals rattaché à une
 * assemblée. Espace minimal séparé — n'ouvre PAS le Web Espace ministère (hasMinistryAccess).
 *
 * ⚠ Le rattachement RESTE exigé (décision JP 16/08). J'avais brièvement retiré cette condition en
 * croyant débloquer un compte sans assemblée ; c'était une erreur de raisonnement : l'assemblée est
 * exigée À L'INSCRIPTION (RG-BQ-03), donc un compte non rattaché est une ANOMALIE, pas un état de
 * départ normal à corriger soi-même.
 *
 * Les deux chemins prévus, et il n'y en a pas de troisième :
 *  - compte neuf sans rattachement → parcours `/join` (hors shell), qui exige l'assemblée ;
 *  - compte hérité non conforme → rattaché par le BACK-OFFICE ou le SECRÉTARIAT (palier G5).
 *
 * Le self-service (RG-BQ-13) sert à CHANGER d'assemblée, pas à s'en donner une première.
 */
export function hasMemberSpace(me: MeResponse | null): boolean {
  return me?.goalRole === 'MEMBRE' && !!me?.goalUnitId;
}

/** Accès à la page Objectifs (Lot 4.1) : dirigeant+ du module Goals, ou superAdmin. */
export function hasGoalsAccess(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isElevated(me.goalRole);
}

/**
 * Peut administrer la STRUCTURE dans son périmètre (Lot 3.2/3.5) : localités & unités.
 * superAdmin, ou COORDINATEUR (ses pays) / DIRIGEANT_SENIOR (les zones de son sous-arbre).
 * Les rôles ministère-large (LEADER/SECRETARIAT) voient mais n'écrivent pas (le backend renvoie 403).
 */
export function canManageStructure(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin) return true;
  const writer = (r: ModuleRole | null) =>
    r === 'DIRIGEANT_COORDINATEUR' || r === 'DIRIGEANT_SENIOR';
  return writer(me.donationRole) || writer(me.goalRole);
}

/** Peut administrer les ZONES (autorité pays) : superAdmin ou COORDINATEUR (Lot 3.2). */
export function canManageZones(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin) return true;
  return me.donationRole === 'DIRIGEANT_COORDINATEUR' || me.goalRole === 'DIRIGEANT_COORDINATEUR';
}

/**
 * RDG 25/07 — rôle SECRETARIAT (Dons ∪ Objectifs). Avec le superAdmin, seul profil autorisé à
 * CRÉER et SUPPRIMER directement nation / région / ville depuis l'app. Strictement SECRETARIAT.
 */
export function isSecretariat(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.donationRole === 'SECRETARIAT' || me.goalRole === 'SECRETARIAT';
}

/**
 * RG-BQ-12 (JP 16/08) — peut CRÉER une assemblée de maison.
 *
 * <p>La création n'a plus AUCUNE contrainte de rôle ni de géographie : tout membre du ministère
 * ouvre une assemblée dans la ville de son choix, sans y être rattaché ni en être dirigeant
 * ({@code AdminUnitServiceImpl.create} n'appelle plus {@code requireCanManageInLocality}). Le seul
 * prérequis côté écran est d'être rattaché à un ministère — la frontière de ministère, elle, reste
 * gardée par le serveur.
 *
 * <p>Historique : le palier C1 (14/08) avait ouvert ce geste au dirigeant de la ville
 * ({@code managerRank >= DIRIGEANT_UNITE} + SECRETARIAT) ; le 16/08 supprime la contrainte.
 * Ce prédicat était resté plus strict que le backend, cachant une capacité réellement accordée.
 *
 * <p>⚠ Ne gate QUE la création. MODIFIER ou SUPPRIMER une assemblée reste gardé côté serveur par
 * {@code requireCanManageInLocality} → voir {@link canManageUnits}, qui n'a pas bougé.
 */
export function canCreateAssembly(me: MeResponse | null): boolean {
  return !!me && !!me.ministryId;
}

/** Chantier B (décision #7) — l'utilisateur est un dirigeant de VILLE (rattaché à une ville). */
export function isCityLeader(me: MeResponse | null): boolean {
  return !!me && (!!me.donationCityId || !!me.goalCityId);
}

/** Peut administrer les VILLES : les managers de structure (SENIOR/COORDINATEUR/superAdmin). */
export function canManageLocalities(me: MeResponse | null): boolean {
  return canManageStructure(me);
}

/**
 * Peut ADMINISTRER (modifier / supprimer) les assemblées de son périmètre : les managers de
 * structure, le dirigeant de ville (Chantier B) et — palier C1 (JP 14/08) — le dirigeant d'unité.
 *
 * <p>Miroir du backend {@code AccessControlServiceImpl.requireCanManageInLocality}, qui garde
 * toujours {@code update} et {@code delete} : superAdmin, SECRETARIAT du ministère, DIRIGEANT de la
 * ville, DIRIGEANT_UNITE dans la ville de ses assemblées, SENIOR/COORDINATEUR de la région
 * englobante — soit, côté écran, tout rang de manager ≥ DIRIGEANT_UNITE plus le SECRETARIAT.
 *
 * <p>⚠ RG-BQ-12 n'a ouvert que la CRÉATION ({@link canCreateAssembly}) : élargir ce prédicat-ci
 * afficherait des boutons Modifier / Supprimer qui prendront un 403. La garde de périmètre
 * (« dans MA ville ») reste serveur ; ce gating d'écran sert seulement à ne pas promettre un geste
 * que le serveur refusera.
 */
export function canManageUnits(me: MeResponse | null): boolean {
  if (!me) return false;
  return (
    canManageStructure(me) ||
    isCityLeader(me) ||
    me.superAdmin ||
    isSecretariat(me) ||
    managerRank(me) >= ROLE_RANK.DIRIGEANT_UNITE
  );
}

const ROLE_RANK: Record<ModuleRole, number> = {
  MEMBRE: 0,
  DIRIGEANT_UNITE: 1,
  DIRIGEANT: 2,
  DIRIGEANT_SENIOR: 3,
  DIRIGEANT_COORDINATEUR: 4,
  LEADER: 5,
  SECRETARIAT: 5,
};

/**
 * Rang d'AUTORITÉ (manager) de l'acteur, miroir de `managerRank` backend (Lot 3.5) :
 * rang max parmi ses rôles de manager. Les rôles ministère-large (LEADER/SECRETARIAT) = 0.
 */
function managerRank(me: MeResponse | null): number {
  if (!me) return 0;
  const w = (r: ModuleRole | null) =>
    r === 'DIRIGEANT_COORDINATEUR' || r === 'DIRIGEANT_SENIOR' || r === 'DIRIGEANT' || r === 'DIRIGEANT_UNITE'
      ? ROLE_RANK[r] : 0;
  return Math.max(w(me.donationRole), w(me.goalRole));
}

// ============================================================================================
//  Périmètre de LECTURE des agrégats Goals — miroirs de AccessControlServiceImpl (16/08)
//
//  ⚠ Ces prédicats existent à l'identique dans `shephr-app/mobile/services/authApi.ts`. Les deux
//  copies doivent bouger ENSEMBLE : c'est leur divergence qui faisait afficher au web des sections
//  que le serveur refusait, là où le mobile les masquait déjà.
//
//  Le principe, en une phrase : **le rôle gate, la géographie ne fait que désigner la branche.**
//  Un rattachement porté par un rang trop bas ne doit pas devenir une section à zéros — les
//  rattachements résiduels existent bel et bien (le PATCH `update` ne purge pas les champs géo
//  d'un rôle rétrogradé, seul `reassign` le fait).
// ============================================================================================

/** Rang du rôle GOALS seul — les agrégats Objectifs ne regardent jamais le rôle Dons. */
function goalRank(me: MeResponse | null): number {
  return me?.goalRole ? ROLE_RANK[me.goalRole] : 0;
}

/** Viewer ministère-large côté Goals : voit tout son ministère sans rattachement géographique. */
function isMinistryWideGoals(me: MeResponse | null): boolean {
  return me?.goalRole === 'LEADER' || me?.goalRole === 'SECRETARIAT';
}

/**
 * Niveau RÉGION (`GET /goals/zones/{id}/aggregate`) — miroir de `getVisibleZoneIds` : superAdmin,
 * ministère-large, ou rang Objectifs ≥ DIRIGEANT_SENIOR. En dessous le backend renvoie `Set.of()`
 * et le garde répond 403.
 */
export function canReadZoneAggregate(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isMinistryWideGoals(me) || goalRank(me) >= ROLE_RANK.DIRIGEANT_SENIOR;
}

/**
 * Niveau VILLE (`GET /goals/cities/{id}/aggregate`) — miroir de `getVisibleLocalityIds` : SENIOR et
 * au-dessus, PLUS le dirigeant DE ville (`DIRIGEANT` effectivement rattaché à une ville — sans
 * rattachement il reste unité-only, exactement comme côté backend).
 */
export function canReadCityAggregate(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin || isMinistryWideGoals(me) || goalRank(me) >= ROLE_RANK.DIRIGEANT_SENIOR) return true;
  const cities = [me.goalCityId, ...(me.goalCityIds ?? [])].filter(Boolean);
  return me.goalRole === 'DIRIGEANT' && cities.length > 0;
}

/**
 * Niveau NATION (`GET /goals/countries/{id}/aggregate`) — miroir de `getVisibleCountryIds` :
 * réservé au COORDINATEUR, aux viewers ministère-large et au superAdmin. Un SENIOR n'y passe pas.
 */
export function canReadCountryAggregate(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isMinistryWideGoals(me) || me.goalRole === 'DIRIGEANT_COORDINATEUR';
}

/** Nœuds de rattachement, principal en tête, sans doublon. */
function uniqNodes(home?: string | null, set?: string[] | null): string[] {
  const rest = (set ?? []).filter((id) => id !== home);
  return home ? [home, ...rest] : rest;
}

/**
 * Les nœuds de périmètre que le compte peut RÉELLEMENT lire, par niveau. Source unique des
 * sections « Mon périmètre » — aucune section ne doit être construite sur un niveau refusé.
 */
export function goalPerimeterNodes(me: MeResponse | null): {
  zoneIds: string[];
  cityIds: string[];
  countryIds: string[];
} {
  return {
    zoneIds: canReadZoneAggregate(me) ? uniqNodes(me?.goalZoneId, me?.goalZoneIds) : [],
    cityIds: canReadCityAggregate(me) ? uniqNodes(me?.goalCityId, me?.goalCityIds) : [],
    countryIds: canReadCountryAggregate(me) ? (me?.goalCountryIds ?? []) : [],
  };
}

/**
 * Peut lire le DÉTAIL NOMINATIF d'une assemblée (`GET /units/{id}/members-aggregate`) — miroir de
 * `GoalAccessGuard.coversAssembly`, qui interroge `getVisibleUnitIds(user, GOAL)` : un
 * `goalRole = MEMBRE` obtient `Set.of()`, donc 403, et un rôle Dons-seul aussi (le périmètre est
 * GOAL et rien d'autre). Sans ce test, le bloc était monté pour tout le monde et le refus
 * s'effaçait en silence.
 */
export function canReadAssemblyMembers(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isMinistryWideGoals(me) || goalRank(me) >= ROLE_RANK.DIRIGEANT_UNITE;
}

/**
 * Peut gérer les UTILISATEURS (Lot 3.5) : tout rôle de manager (DIRIGEANT_UNITE → COORDINATEUR)
 * gère son sous-arbre ; superAdmin partout. (Les viewers ministère-large n'administrent pas.)
 */
export function canManageUsers(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin) return true;
  return managerRank(me) >= ROLE_RANK.DIRIGEANT_UNITE;
}

/**
 * Dirigeant d'ASSEMBLÉE et rien de plus : DIRIGEANT_UNITE au maximum, hors superAdmin,
 * SECRETARIAT et LEADER (vues ministère-large). Son périmètre s'arrête à son assemblée :
 * il valide les rattachements de SES membres, et la structure (création d'assemblée dans sa
 * ville) ne le concerne pas — ni en dépôt, ni en suivi, ni en validation.
 */
export function isAssemblyLeaderOnly(me: MeResponse | null): boolean {
  if (!me || me.superAdmin || isSecretariat(me)) return false;
  if (me.donationRole === 'LEADER' || me.goalRole === 'LEADER') return false;
  return managerRank(me) <= ROLE_RANK.DIRIGEANT_UNITE;
}

/**
 * Rôles que l'acteur peut CONFÉRER (Lot 3.5) : de rang ≤ au sien (un DIRIGEANT peut conférer DIRIGEANT).
 * SUPER_ADMIN : tous. Le rattachement à des pays (COORDINATEUR) étant réservé au SUPER_ADMIN côté
 * backend, on n'offre pas COORDINATEUR à un non-SUPER_ADMIN. Aligné sur `requireCanAssign`.
 */
export function assignableRoles(me: MeResponse | null): ModuleRole[] {
  if (!me) return [];
  if (me.superAdmin) {
    return ['MEMBRE', 'DIRIGEANT_UNITE', 'DIRIGEANT', 'DIRIGEANT_SENIOR', 'DIRIGEANT_COORDINATEUR', 'LEADER', 'SECRETARIAT'];
  }
  const mr = managerRank(me);
  return (['MEMBRE', 'DIRIGEANT_UNITE', 'DIRIGEANT', 'DIRIGEANT_SENIOR'] as ModuleRole[]).filter((r) => ROLE_RANK[r] <= mr);
}

/**
 * i18n key suffix for the user's most significant role (sidebar footer).
 * Returns 'superAdmin' or a ModuleRole code, to be looked up under `roles.*`. '' if none.
 */
export function primaryRoleKey(me: MeResponse | null): 'superAdmin' | ModuleRole | '' {
  if (!me) return '';
  if (me.superAdmin) return 'superAdmin';
  const elevated =
    (isElevated(me.donationRole) ? me.donationRole : null) ??
    (isElevated(me.goalRole) ? me.goalRole : null);
  const role = elevated ?? me.donationRole ?? me.goalRole;
  return role ?? '';
}

/**
 * Identités séparées par application (JP 30/07) : Shephr s'authentifie sur son PROPRE
 * identifiant (`t_user.username` côté backend), jamais sur l'email. Les écrans continuent
 * d'afficher « Email » — c'est un libellé, pas un contrat : la saisie part dans `identifier`.
 */
export async function login(payload: { identifier: string; password: string }) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/church/auth/login',
    payload,
  );
  return data;
}

/**
 * Inscription libre (miroir du parcours mobile `(auth)/signup`). Le compte créé n'est rattaché
 * à rien : l'utilisateur enchaîne sur `/join` pour demander son rattachement.
 * Erreurs 422 attendues : USERNAME_ALREADY_EXISTS / PHONE_ALREADY_EXISTS.
 */
export interface RegisterRequest {
  identifier: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  countryCode?: string;
}

export async function register(payload: RegisterRequest) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/church/auth/register',
    payload,
  );
  return data;
}

export async function fetchMe() {
  const { data } = await apiClient.get<MeResponse>('/api/church/auth/me');
  return data;
}

/**
 * Feature C — suppression de compte in-app. Le backend décide : DELETED (suppression) ou
 * ANONYMIZED (données rattachées à conserver). Erreurs 422 : USER_LEADS_ORPHAN_NODES
 * (message à afficher tel quel), SUPER_ADMIN_SELF_DELETE.
 */
export async function deleteMyAccount() {
  const { data } = await apiClient.delete<{ mode: 'DELETED' | 'ANONYMIZED' }>('/api/church/auth/me');
  return data;
}

// --- Invitation (Lot 3.1) — acceptation publique d'une invitation ---
export interface InvitationPreview {
  email: string | null;
  /** A1 — identifiant de connexion (comptes créés sans email). */
  username: string | null;
  fullName: string;
  ministryName: string | null;
}

export async function previewInvitation(token: string) {
  const { data } = await apiClient.get<InvitationPreview>(
    `/api/cmfipraise/auth/invitation/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function acceptInvitation(payload: {
  token: string; password: string;
  // A1 (RG-ID-04) — coordonnées fournies à l'activation (téléphone requis côté formulaire).
  phoneNumber?: string; countryCode?: string; email?: string;
}) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/invitation/accept',
    payload,
  );
  return data;
}

// --- Invitation par CODE COURT (Lot 3.4) — alternative au lien : l'invité saisit le code reçu ---
export async function previewInvitationByCode(shortCode: string) {
  const { data } = await apiClient.get<InvitationPreview>(
    `/api/cmfipraise/auth/invitation/code/${encodeURIComponent(shortCode)}`,
  );
  return data;
}

export async function acceptInvitationByCode(payload: {
  shortCode: string; password: string;
  // A1 (RG-ID-04) — mêmes coordonnées que l'activation par lien (téléphone requis côté formulaire).
  phoneNumber?: string; countryCode?: string; email?: string;
}) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/invitation/code/accept',
    payload,
  );
  return data;
}

/** Modules accessibles à l'utilisateur courant (gratuit/activé OU abonnement actif). */
export async function getAccessibleModules(): Promise<string[]> {
  const { data } = await apiClient.get<{ moduleCodes: string[] }>('/api/me/accessible-modules');
  return data.moduleCodes ?? [];
}
