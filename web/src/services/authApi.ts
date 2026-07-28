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

/** Chantier B (décision #7) — l'utilisateur est un dirigeant de VILLE (rattaché à une ville). */
export function isCityLeader(me: MeResponse | null): boolean {
  return !!me && (!!me.donationCityId || !!me.goalCityId);
}

/** Peut administrer les VILLES : les managers de structure (SENIOR/COORDINATEUR/superAdmin). */
export function canManageLocalities(me: MeResponse | null): boolean {
  return canManageStructure(me);
}

/**
 * Peut administrer les ASSEMBLÉES de son périmètre : les managers de structure PLUS le
 * dirigeant de ville (qui gère les assemblées de sa ville — Chantier B).
 */
export function canManageUnits(me: MeResponse | null): boolean {
  return canManageStructure(me) || isCityLeader(me);
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

export async function login(payload: { email: string; password: string }) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/login',
    payload,
  );
  return data;
}

/**
 * Feature B — inscription libre (miroir du parcours mobile `(auth)/signup`). Le compte créé
 * n'est rattaché à rien : l'utilisateur enchaîne sur `/join` pour demander son rattachement.
 * Erreurs 422 attendues : EMAIL_ALREADY_EXISTS / PHONE_ALREADY_EXISTS.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  countryCode?: string;
}

export async function register(payload: RegisterRequest) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/register',
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

export async function acceptInvitationByCode(payload: { shortCode: string; password: string }) {
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
