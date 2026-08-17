import { apiClient } from './apiClient';
import type { PageResponse } from './donationApi';
import type { ModuleRole } from './authApi';

// ---------------- Users (Lot 3.3 — contrat ModuleRole + périmètre) ----------------
export interface AdminUserResponse {
  id: string;
  email: string | null;
  /** A1 — identifiant de connexion (null pour les comptes historiques). */
  username: string | null;
  fullName: string;
  superAdmin: boolean;
  ministryId: string | null;
  /** Lot 3.5 — superviseur (organigramme de personnes). */
  supervisorId: string | null;
  donationRole: ModuleRole | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  /** Chantier B (décision #7) — ville de rattachement côté Dons (dirigeant de ville). */
  donationCityId: string | null;
  /** Lot 3.5 — unités gérées côté Dons (multi-unités). */
  donationUnitIds: string[];
  donationCountryIds: string[];
  goalRole: ModuleRole | null;
  goalUnitId: string | null;
  goalZoneId: string | null;
  /** Chantier B (décision #7) — ville de rattachement côté Objectifs (dirigeant de ville). */
  goalCityId: string | null;
  /** Lot 3.5 — unités gérées côté Objectifs (multi-unités). */
  goalUnitIds: string[];
  goalCountryIds: string[];
  /** Lot 4.8 — pays coordonnés par un SECRETARIAT/LEADER (assignés par SUPER_ADMIN). */
  coordinatedCountryIds: string[];
  active: boolean;
  /**
   * A soumis SES engagements personnels pour l'année courante.
   *
   * <p>⚠ Sémantique revue par le chantier « objectifs individuels » (JP 16/08, RG-BQ-03/11) :
   * `true` soumis · `false` pas encore · `null` UNIQUEMENT pour un compte sans `goalUnitId` ou
   * `superAdmin`. Un dirigeant de ville, un SENIOR, un COORDINATEUR ou un SECRETARIAT rattachés
   * valent désormais `true`/`false` comme les autres — il n'y a plus de « non applicable » lié
   * au rôle.
   * Mirrors com.excellence.back.auth.admin.user.dto.AdminUserResponse#goalSubmitted
   */
  goalSubmitted: boolean | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListUsersParams {
  donationRole?: ModuleRole;
  donationUnitId?: string;
  ministryId?: string;
  active?: boolean;
  page?: number;
  size?: number;
  /** Nation, région OU ville — le backend en déduit les assemblées (JP 31/07). */
  placeNodeId?: string;
  /** Recherche par noms approchés, INDÉPENDANTE du filtre géographique. */
  search?: string;
}

export interface InviteUserRequest {
  /** A1 (RG-ID-02) — email facultatif ; identifiant OU email requis. */
  email?: string;
  /** A1 (RG-ID-01) — identifiant de connexion attribué. */
  username?: string;
  fullName: string;
  ministryId?: string;
  /** Lot 3.5 — superviseur (par défaut l'invitant côté backend si omis). */
  supervisorId?: string;
  donationRole?: ModuleRole;
  donationUnitId?: string;
  donationZoneId?: string;
  donationCityId?: string;
  donationUnitIds?: string[];
  donationCountryIds?: string[];
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalCityId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
  /** Lot 4.8 — pays coordonnés (SECRETARIAT/LEADER) — réservé SUPER_ADMIN. */
  coordinatedCountryIds?: string[];
  superAdmin?: boolean;
}

export interface InviteUserResponse {
  userId: string;
  email: string;
  invitationToken: string;
  /** Lot 3.4 — code court saisissable (activation mobile par code). */
  invitationShortCode: string | null;
}

export interface UpdateUserRequest {
  ministryId?: string;
  /** Lot 3.5 — superviseur (organigramme). */
  supervisorId?: string;
  donationRole?: ModuleRole;
  donationUnitId?: string;
  donationZoneId?: string;
  donationCityId?: string;
  donationUnitIds?: string[];
  donationCountryIds?: string[];
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalCityId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
  /** Lot 4.8 — pays coordonnés (SECRETARIAT/LEADER) — réservé SUPER_ADMIN. */
  coordinatedCountryIds?: string[];
  active?: boolean;
  superAdmin?: boolean;
}

/**
 * Compteur « X / Y ont soumis leur engagement » — calculé par le SERVEUR sur tout le périmètre
 * filtré, pas sur la page affichée (la liste est paginée).
 * Mirrors com.excellence.back.auth.admin.user.dto.GoalSubmissionSummaryResponse
 */
export interface GoalSubmissionSummary {
  submitted: number;
  total: number;
}

export async function fetchGoalSubmissionSummary(
  params: Pick<ListUsersParams, 'ministryId' | 'active' | 'placeNodeId' | 'search'> = {},
): Promise<GoalSubmissionSummary> {
  const { data } = await apiClient.get<GoalSubmissionSummary>(
    '/api/church/admin/users/goal-submission-summary',
    { params },
  );
  return data;
}

export async function listUsers(params: ListUsersParams = {}) {
  const { data } = await apiClient.get<PageResponse<AdminUserResponse>>(
    '/api/church/admin/users',
    { params },
  );
  return data;
}

export async function getUser(id: string) {
  const { data } = await apiClient.get<AdminUserResponse>(`/api/church/admin/users/${id}`);
  return data;
}

export async function inviteUser(payload: InviteUserRequest) {
  const { data } = await apiClient.post<InviteUserResponse>(
    '/api/church/admin/users/invite',
    payload,
  );
  return data;
}

export async function updateUser(id: string, payload: UpdateUserRequest) {
  const { data } = await apiClient.patch<AdminUserResponse>(
    `/api/church/admin/users/${id}`,
    payload,
  );
  return data;
}

export async function deactivateUser(id: string) {
  const { data } = await apiClient.post<AdminUserResponse>(
    `/api/church/admin/users/${id}/deactivate`,
  );
  return data;
}

/** Suppression définitive — refusée par le backend si un poste resterait sans responsable. */
export async function deleteUser(id: string) {
  await apiClient.delete(`/api/church/admin/users/${id}`);
}

// ---------------- Ministries ----------------
export interface MinistryResponse {
  id: string;
  name: string;
  country: string;
  defaultCurrency: string;
  createdAt: string;
}

export async function listMinistries() {
  const { data } = await apiClient.get<MinistryResponse[]>('/api/church/admin/ministries');
  return data;
}

// ---------------- Countries (lecture seule, scopée au périmètre — référentiel des pickers) -------
export type ContinentCode =
  | 'EUROPE' | 'AFRIQUE' | 'ASIE' | 'AMERIQUE_NORD' | 'AMERIQUE_SUD' | 'OCEANIE';

export interface CountryResponse {
  id: string;
  ministryId: string;
  ministryName: string;
  continentId: string;
  continentCode: ContinentCode;
  code: string;
  name: string;
  nameEn: string;
  defaultCurrency: string;
  active: boolean;
  createdAt: string;
}

export async function listCountries() {
  const { data } = await apiClient.get<CountryResponse[]>('/api/church/admin/countries');
  return data;
}

// RDG 25/07 : création/suppression d'une NATION ouvertes au SECRETARIAT du ministère (garde
// serveur `requireSuperAdminOrSecretariat`). La modification reste back-office SUPER_ADMIN.
export interface ContinentResponse {
  id: string;
  code: ContinentCode;
  name: string;
  nameEn: string;
}

export async function listContinents() {
  const { data } = await apiClient.get<ContinentResponse[]>('/api/church/admin/continents');
  return data;
}

export interface CreateCountryRequest {
  ministryId: string;
  continentId: string;
  /** Code ISO 3166-1 alpha-2 (2 lettres majuscules). */
  code: string;
  name: string;
  nameEn: string;
  /** Code ISO 4217 (3 lettres majuscules). */
  defaultCurrency: string;
}

export async function createCountry(payload: CreateCountryRequest) {
  const { data } = await apiClient.post<CountryResponse>('/api/church/admin/countries', payload);
  return data;
}

export async function deleteCountry(id: string) {
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
  createdAt: string;
}

export interface CreateZoneRequest {
  countryId: string;
  name: string;
  description?: string;
}

export interface UpdateZoneRequest {
  name?: string;
  description?: string;
  active?: boolean;
}

export async function listZones(countryId?: string) {
  const { data } = await apiClient.get<ZoneResponse[]>('/api/church/admin/zones', {
    params: countryId ? { countryId } : undefined,
  });
  return data;
}

export async function createZone(payload: CreateZoneRequest) {
  const { data } = await apiClient.post<ZoneResponse>('/api/church/admin/zones', payload);
  return data;
}

export async function updateZone(id: string, payload: UpdateZoneRequest) {
  const { data } = await apiClient.patch<ZoneResponse>(`/api/church/admin/zones/${id}`, payload);
  return data;
}

export async function deleteZone(id: string) {
  await apiClient.delete(`/api/church/admin/zones/${id}`);
}

// ---------------- Localities ----------------
export interface LocalityResponse {
  id: string;
  ministryId: string;
  ministryName: string;
  zoneId: string | null;
  zoneName: string | null;
  name: string;
  country: string | null;
  createdAt: string;
}

export interface CreateLocalityRequest {
  ministryId: string;
  zoneId?: string;
  name: string;
  country?: string;
}

export interface UpdateLocalityRequest {
  name?: string;
  zoneId?: string;
  country?: string;
}

export async function listLocalities(params: { zoneId?: string } = {}) {
  const { data } = await apiClient.get<LocalityResponse[]>('/api/church/admin/localities', { params });
  return data;
}

export async function createLocality(payload: CreateLocalityRequest) {
  const { data } = await apiClient.post<LocalityResponse>('/api/church/admin/localities', payload);
  return data;
}

export async function updateLocality(id: string, payload: UpdateLocalityRequest) {
  const { data } = await apiClient.patch<LocalityResponse>(`/api/church/admin/localities/${id}`, payload);
  return data;
}

export async function deleteLocality(id: string) {
  await apiClient.delete(`/api/church/admin/localities/${id}`);
}

// ---------------- Units ----------------
export type UnitType = 'ASSEMBLY'; // Chantier B (décision #5) : plus de CENTER

export interface UnitResponse {
  id: string;
  ministryId: string;
  ministryName: string;
  localityId: string;
  localityName: string;
  name: string;
  type: UnitType;
  joinCode: string;
  active: boolean;
  createdAt: string;
}

export interface CreateUnitRequest {
  ministryId: string;
  localityId: string;
  name: string;
  /**
   * Responsable de l'assemblée, compte EXISTANT — FACULTATIF (RG-BQ-12, JP 16/08).
   *
   * <p>Omis, le CRÉATEUR devient responsable et passe à `DIRIGEANT_UNITE` s'il était `MEMBRE`
   * (jamais de rétrogradation) ; son assemblée « maison » (`goalUnitId`) ne bouge pas, et son
   * rôle Dons n'est pas promu. Le code `UNIT_LEADER_REQUIRED` n'existe plus.
   * ⚠ Anti-doublon : deux assemblées du même nom dans la même ville → 422 `STRUCTURE_NAME_EXISTS`.
   */
  leaderUserId?: string;
}

export interface UpdateUnitRequest {
  name?: string;
  localityId?: string;
  type?: UnitType;
  active?: boolean;
}

export async function listUnits(params: { localityId?: string } = {}) {
  const { data } = await apiClient.get<UnitResponse[]>('/api/church/admin/units', { params });
  return data;
}

export async function createUnit(payload: CreateUnitRequest) {
  // Chantier B (décision #5) : plus de type CENTER — toute unité est une assemblée de maison.
  const { data } = await apiClient.post<UnitResponse>('/api/church/admin/units', { ...payload, type: 'ASSEMBLY' });
  return data;
}

export async function updateUnit(id: string, payload: UpdateUnitRequest) {
  const { data } = await apiClient.patch<UnitResponse>(`/api/church/admin/units/${id}`, payload);
  return data;
}

export async function deleteUnit(id: string) {
  await apiClient.delete(`/api/church/admin/units/${id}`);
}

// ---------------- Mon assemblée (RG-BQ-13 — changement en LIBRE-SERVICE) ----------------
// PUT /api/church/units/me/assembly — une personne change d'assemblée ELLE-MÊME, sans demande ni
// valideur. Volontairement hors de `goalsApi` : l'endpoint n'est PAS gaté `@RequiresModule("GOALS")`,
// son échec ne doit donc pas être confondu avec un défaut d'abonnement.

/** Mirrors com.excellence.back.org.unit.dto.ChangeMyAssemblyRequest */
export interface ChangeMyAssemblyRequest {
  unitId: string;
}

/** Mirrors com.excellence.back.org.unit.dto.MyUnitResponse */
export interface MyUnitResponse {
  unitId: string;
  unitName: string;
  type: UnitType;
  ministryId: string;
  ministryName: string;
  localityId: string | null;
  localityName: string | null;
}

/**
 * Change MON assemblée de rattachement : pose `goalUnitId` ET `donationUnitId` sur la cible
 * (RG-BQ-13). Ne touche PAS `goalUnitIds` — déménager ne fait pas démissionner des assemblées
 * qu'on dirige.
 *
 * <p>⚠ Les engagements SUIVENT la personne, années passées comprises : le total de l'ancienne
 * assemblée baisse et celui de la nouvelle monte dès la lecture suivante.
 * Erreurs : 404 (assemblée inconnue ou inactive), 422 `ASSEMBLY_MINISTRY_MISMATCH` (autre ministère).
 */
export async function changeMyAssembly(unitId: string) {
  const { data } = await apiClient.put<MyUnitResponse>('/api/church/units/me/assembly', { unitId });
  return data;
}

/**
 * Palier C4 (JP 14/08) — une ligne de l'historique de création des assemblées.
 * Mirrors com.excellence.back.org.admin.unit.dto.AssemblyCreationResponse
 */
export interface AssemblyCreationRow {
  unitId: string;
  name: string;
  cityName: string | null;
  regionName: string | null;
  nationName: string | null;
  /** Instant ISO-8601. */
  createdAt: string;
  createdById: string | null;
  /** null pour les assemblées créées AVANT la migration org/18 — l'écran affiche « — ». */
  createdByName: string | null;
  createdByRole: ModuleRole | null;
}

/**
 * Palier C4 (JP 14/08) — historique de création des assemblées, trié par le SERVEUR (plus
 * récentes d'abord) et paginé côté serveur.
 *
 * <p>⚠ Garde serveur : SUPER_ADMIN (tous ministères) ou SECRETARIAT (le sien seul) — tout autre
 * rôle reçoit un 403. `ministryId` est facultatif : omis, le backend applique le périmètre de
 * l'appelant. Le gating d'écran ne remplace pas cette garde.
 */
export async function listAssemblyHistory(
  params: { ministryId?: string; page?: number; size?: number } = {},
) {
  const { data } = await apiClient.get<PageResponse<AssemblyCreationRow>>(
    '/api/church/admin/units/history',
    { params },
  );
  return data;
}
