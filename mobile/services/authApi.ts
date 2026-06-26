import { apiClient } from './apiClient';

// Real role model exposed by the backend (ModuleRole + superAdmin).
// Lot 3.5 : DIRIGEANT_LEADER renommé DIRIGEANT_SENIOR + nouveau DIRIGEANT_UNITE (aligné backend/web).
export type ModuleRole =
  | 'MEMBRE'
  | 'DIRIGEANT_UNITE'
  | 'DIRIGEANT'
  | 'DIRIGEANT_SENIOR'
  | 'DIRIGEANT_COORDINATEUR'
  | 'LEADER'
  | 'SECRETARIAT';

export const MODULE_ROLE_LABELS: Record<ModuleRole, string> = {
  MEMBRE: 'Fidèle',
  DIRIGEANT_UNITE: "Dirigeant d'unité",
  DIRIGEANT: 'Dirigeant',
  DIRIGEANT_SENIOR: 'Dirigeant senior',
  DIRIGEANT_COORDINATEUR: 'Coordinateur',
  LEADER: 'Leader',
  SECRETARIAT: 'Secrétariat',
};

const ROLE_RANK: Record<ModuleRole, number> = {
  MEMBRE: 0,
  DIRIGEANT_UNITE: 1,
  DIRIGEANT: 2,
  DIRIGEANT_SENIOR: 3,
  DIRIGEANT_COORDINATEUR: 4,
  LEADER: 5,
  SECRETARIAT: 5,
};

/** Rang d'autorité MANAGER (miroir backend) : max parmi les rôles manager ; viewers ministère-large = 0. */
function managerRank(me: MeResponse | null): number {
  if (!me) return 0;
  const w = (r: ModuleRole | null) =>
    r === 'DIRIGEANT_COORDINATEUR' || r === 'DIRIGEANT_SENIOR' || r === 'DIRIGEANT' || r === 'DIRIGEANT_UNITE'
      ? ROLE_RANK[r] : 0;
  return Math.max(w(me.donationRole), w(me.goalRole));
}

/** Peut gérer la structure (localités/unités de son périmètre) : tout manager (rang ≥ 1) ou superAdmin. */
export function canManageStructure(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || managerRank(me) >= ROLE_RANK.DIRIGEANT_UNITE;
}

/** Peut gérer les zones (créer une zone) : COORDINATEUR (ses pays) ou superAdmin. */
export function canManageZones(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin
    || me.donationRole === 'DIRIGEANT_COORDINATEUR'
    || me.goalRole === 'DIRIGEANT_COORDINATEUR';
}

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  countryCode?: string | null;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

// Mirrors com.excellence.back.donation.auth.dto.MeResponse
export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  /** Langue préférée du compte ('FR' | 'EN' | …) ; null si non définie côté backend. */
  language?: string | null;
  superAdmin: boolean;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  ministryId: string | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  active: boolean;
  // Lot 4.2 — périmètre GOALS (UC-LDR-04/05, COO-04/05) :
  /** Unité du DIRIGEANT côté Goals ; null sinon. */
  goalUnitId: string | null;
  /** Zone du DIRIGEANT_LEADER côté Goals ; null sinon. */
  goalZoneId: string | null;
  /** Pays du DIRIGEANT_COORDINATEUR côté Goals ; vide sinon. */
  goalCountryIds: string[] | null;
  // Périmètre LISIBLE (noms résolus) — affichage explicite dans le profil, selon le leadership :
  /** Noms des unités rattachées (home + multi-unités, tous modules) ; vide sinon. */
  unitNames: string[] | null;
  /** Noms des zones rattachées (DIRIGEANT_SENIOR) ; vide sinon. */
  zoneNames: string[] | null;
  /** Noms des pays rattachés (DIRIGEANT_COORDINATEUR) ; vide sinon. */
  countryNames: string[] | null;
}

/** A role strictly above MEMBRE in a module. */
function isElevated(role: ModuleRole | null): boolean {
  return role != null && role !== 'MEMBRE';
}

/** True for a dirigeant+ (any module role above MEMBRE) or a platform superAdmin. */
export function isLeaderRole(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isElevated(me.donationRole) || isElevated(me.goalRole);
}

/** Goals tab access (Lot 4.1) : dirigeant+ du module Goals, ou superAdmin. */
export function hasGoalsAccess(me: MeResponse | null): boolean {
  if (!me) return false;
  return me.superAdmin || isElevated(me.goalRole);
}

/** Human label for the user's most significant role ('Fidèle' for a plain member). */
export function roleLabel(me: MeResponse | null): string {
  if (!me) return '—';
  if (me.superAdmin) return 'Super Admin';
  const role =
    (isElevated(me.donationRole) ? me.donationRole : null) ??
    (isElevated(me.goalRole) ? me.goalRole : null) ??
    me.donationRole ??
    me.goalRole;
  return role ? MODULE_ROLE_LABELS[role] : 'Fidèle';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  countryCode?: string;
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/login',
    payload,
  );
  return data;
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/register',
    payload,
  );
  return data;
}

// --- Activation par CODE COURT (Lot 3.4, UC-TRV-10) — endpoints publics ---------------
export interface InvitationPreview {
  email: string;
  fullName: string;
  ministryName: string | null;
}

/** Aperçu d'une invitation à partir du code court (404/erreur si code inconnu/expiré/utilisé). */
export async function previewInvitationByCode(shortCode: string): Promise<InvitationPreview> {
  const { data } = await apiClient.get<InvitationPreview>(
    `/api/cmfipraise/auth/invitation/code/${encodeURIComponent(shortCode)}`,
  );
  return data;
}

/** Active le compte par code court : définit le mot de passe, active, et connecte (renvoie token+user). */
export async function acceptInvitationByCode(shortCode: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/invitation/code/accept',
    { shortCode, password },
  );
  return data;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/api/church/auth/me');
  return data;
}
