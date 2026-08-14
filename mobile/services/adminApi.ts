import { apiClient } from './apiClient';

// Structure org scopée (Lot 3.4 mobile) — calque l'adminApi web. Endpoints `/api/church/admin/*`
// ouverts/scopés au Lot 3.2 : la VISIBILITÉ et l'ÉCRITURE sont enforcées côté backend (403 hors périmètre).

// ---------------- Countries (lecture seule, scopée — picker) ----------------
export interface CountryResponse {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  active: boolean;
}

export async function listCountries(): Promise<CountryResponse[]> {
  const { data } = await apiClient.get<CountryResponse[]>('/api/church/admin/countries');
  return data;
}

// RDG 25/07 : création/suppression d'une NATION ouvertes au SECRETARIAT du ministère (garde
// serveur `requireSuperAdminOrSecretariat`). La modification reste back-office SUPER_ADMIN.
export type ContinentCode =
  | 'EUROPE' | 'AFRIQUE' | 'ASIE' | 'AMERIQUE_NORD' | 'AMERIQUE_SUD' | 'OCEANIE';

export interface ContinentResponse {
  id: string;
  code: ContinentCode;
  name: string;
  nameEn: string;
}

export async function listContinents(): Promise<ContinentResponse[]> {
  const { data } = await apiClient.get<ContinentResponse[]>('/api/church/admin/continents');
  return data;
}

export async function createCountry(payload: {
  ministryId: string;
  continentId: string;
  /** ISO 3166-1 alpha-2 (2 lettres majuscules). */
  code: string;
  name: string;
  nameEn: string;
  /** ISO 4217 (3 lettres majuscules). */
  defaultCurrency: string;
}) {
  const { data } = await apiClient.post<CountryResponse>('/api/church/admin/countries', payload);
  return data;
}

export async function deleteCountry(id: string): Promise<void> {
  await apiClient.delete(`/api/church/admin/countries/${id}`);
}

// ---------------- Zones ----------------
export interface ZoneResponse {
  id: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  name: string;
  description: string | null;
  active: boolean;
}

export async function listZones(countryId?: string): Promise<ZoneResponse[]> {
  const { data } = await apiClient.get<ZoneResponse[]>('/api/church/admin/zones', {
    params: countryId ? { countryId } : undefined,
  });
  return data;
}

export async function createZone(payload: { countryId: string; name: string; description?: string }) {
  const { data } = await apiClient.post<ZoneResponse>('/api/church/admin/zones', payload);
  return data;
}

export async function updateZone(id: string, payload: { name?: string; description?: string; active?: boolean }) {
  const { data } = await apiClient.patch<ZoneResponse>(`/api/church/admin/zones/${id}`, payload);
  return data;
}

export async function deleteZone(id: string): Promise<void> {
  await apiClient.delete(`/api/church/admin/zones/${id}`);
}

// ---------------- Localities ----------------
export interface LocalityResponse {
  id: string;
  ministryId: string;
  zoneId: string | null;
  zoneName: string | null;
  name: string;
  country: string | null;
}

export async function listLocalities(params: { zoneId?: string } = {}): Promise<LocalityResponse[]> {
  const { data } = await apiClient.get<LocalityResponse[]>('/api/church/admin/localities', { params });
  return data;
}

export async function createLocality(payload: { ministryId: string; zoneId?: string; name: string; country?: string }) {
  const { data } = await apiClient.post<LocalityResponse>('/api/church/admin/localities', payload);
  return data;
}

export async function updateLocality(id: string, payload: { name?: string; zoneId?: string; country?: string }) {
  const { data } = await apiClient.patch<LocalityResponse>(`/api/church/admin/localities/${id}`, payload);
  return data;
}

export async function deleteLocality(id: string): Promise<void> {
  await apiClient.delete(`/api/church/admin/localities/${id}`);
}

// ---------------- Units ----------------
export type UnitType = 'CENTER' | 'ASSEMBLY';

export interface UnitResponse {
  id: string;
  ministryId: string;
  localityId: string;
  localityName: string;
  name: string;
  type: UnitType;
  joinCode: string;
  active: boolean;
}

export async function listUnits(params: { localityId?: string } = {}): Promise<UnitResponse[]> {
  const { data } = await apiClient.get<UnitResponse[]>('/api/church/admin/units', { params });
  return data;
}

/**
 * Palier C1-bis (JP 14/08) — `leaderUserId` : responsable de l'assemblée, compte EXISTANT.
 * Obligatoire hors SUPER_ADMIN (422 `UNIT_LEADER_REQUIRED`) : une assemblée sans responsable
 * n'est administrable par personne. L'affectation est faite par le backend dans la MÊME
 * transaction que la création — inutile (et risqué) d'enchaîner deux appels ici.
 */
export async function createUnit(payload: {
  ministryId: string; localityId: string; name: string; type: UnitType; leaderUserId?: string;
}) {
  const { data } = await apiClient.post<UnitResponse>('/api/church/admin/units', payload);
  return data;
}

export async function updateUnit(id: string, payload: { name?: string; localityId?: string; type?: UnitType; active?: boolean }) {
  const { data } = await apiClient.patch<UnitResponse>(`/api/church/admin/units/${id}`, payload);
  return data;
}

export async function deleteUnit(id: string): Promise<void> {
  await apiClient.delete(`/api/church/admin/units/${id}`);
}

// ---------------- Invitations (UC-DIR-04) ----------------
// POST /api/church/admin/users/invite — route `authenticated()`, le périmètre (rôle ≤ le sien,
// sous-arbre) est enforcé côté backend. V1 : aucun email envoyé, on récupère le code court à
// transmettre à l'invité (flux d'activation par code — cf. (auth)/activate).
import type { ModuleRole } from './authApi';

export interface InviteUserRequest {
  /** A1 (RG-ID-02) — email de contact facultatif ; identifiant OU email requis. */
  email?: string;
  /** A1 (RG-ID-01) — identifiant de connexion attribué (type pveigne@shephr.org). */
  username?: string;
  fullName: string;
  donationRole?: ModuleRole;
  donationUnitId?: string;
  /** 21/07 — invitation de DIRIGEANTS (module Goals) : plus jamais de MEMBRE depuis le mobile. */
  goalRole?: ModuleRole;
  goalUnitId?: string;
}

export interface InviteUserResponse {
  userId: string;
  email: string | null;
  invitationToken: string;
  invitationShortCode: string;
}

export async function inviteUser(payload: InviteUserRequest): Promise<InviteUserResponse> {
  const { data } = await apiClient.post<InviteUserResponse>(
    '/api/church/admin/users/invite',
    payload,
  );
  return data;
}

// ---------------- Membres (Lot S1 — 21/07) ----------------
// GET /api/church/admin/users — route `authenticated()`, liste SCOPÉE côté backend (sous-arbre
// superviseur + unités visibles ; LEADER/SECRETARIAT = ministère ; MEMBRE = lui-même).

export interface AdminUserResponse {
  id: string;
  email: string | null;
  /** A1 — identifiant de connexion (null pour les comptes historiques). */
  username: string | null;
  fullName: string;
  superAdmin: boolean;
  supervisorId: string | null;
  donationRole: ModuleRole | null;
  donationUnitId: string | null;
  goalRole: ModuleRole | null;
  goalUnitId: string | null;
  active: boolean;
  /**
   * A soumis son engagement pour l'année courante (JP 14/08).
   * `true` soumis · `false` pas encore · `null` NON APPLICABLE (dirigeant de ville, région ou
   * nation : il ne soumet rien à son niveau).
   * Mirrors com.excellence.back.auth.admin.user.dto.AdminUserResponse#goalSubmitted
   */
  goalSubmitted: boolean | null;
}

export interface UsersPage {
  content: AdminUserResponse[];
  totalElements: number;
  /** Enveloppe Page de Spring : vrai sur la dernière page (pagination serveur, JP 31/07). */
  last?: boolean;
}

/**
 * Compteur « X / Y ont soumis leur engagement » (JP 14/08) — calculé par le SERVEUR sur TOUT le
 * périmètre filtré, pas sur les lignes chargées (la liste est paginée et s'empile).
 * Mirrors com.excellence.back.auth.admin.user.dto.GoalSubmissionSummaryResponse
 */
export interface GoalSubmissionSummary {
  submitted: number;
  total: number;
}

export async function fetchGoalSubmissionSummary(
  params: { placeNodeId?: string; search?: string } = {},
): Promise<GoalSubmissionSummary> {
  const { data } = await apiClient.get<GoalSubmissionSummary>(
    '/api/church/admin/users/goal-submission-summary',
    { params },
  );
  return data;
}

export async function listUsers(
  // JP 31/07 — filtrage et pagination CÔTÉ SERVEUR : `placeNodeId` (nation, région ou ville)
  // et `search` (noms approchés, indépendant du filtre géographique) sont résolus par le backend.
  params: { active?: boolean; page?: number; size?: number; placeNodeId?: string; search?: string } = {},
): Promise<UsersPage> {
  const { data } = await apiClient.get<UsersPage>('/api/church/admin/users', { params });
  return data;
}
