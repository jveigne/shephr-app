import { apiClient } from './apiClient';
import type { PageResponse } from './donationApi';
import type { ModuleRole } from './authApi';

// ---------------- Users (Lot 3.3 — contrat ModuleRole + périmètre) ----------------
export interface AdminUserResponse {
  id: string;
  email: string;
  fullName: string;
  superAdmin: boolean;
  ministryId: string | null;
  /** Lot 3.5 — superviseur (organigramme de personnes). */
  supervisorId: string | null;
  donationRole: ModuleRole | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  /** Lot 3.5 — unités gérées côté Dons (multi-unités). */
  donationUnitIds: string[];
  donationCountryIds: string[];
  goalRole: ModuleRole | null;
  goalUnitId: string | null;
  goalZoneId: string | null;
  /** Lot 3.5 — unités gérées côté Objectifs (multi-unités). */
  goalUnitIds: string[];
  goalCountryIds: string[];
  /** Lot 4.8 — pays coordonnés par un SECRETARIAT/LEADER (assignés par SUPER_ADMIN). */
  coordinatedCountryIds: string[];
  active: boolean;
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
}

export interface InviteUserRequest {
  email: string;
  fullName: string;
  ministryId?: string;
  /** Lot 3.5 — superviseur (par défaut l'invitant côté backend si omis). */
  supervisorId?: string;
  donationRole?: ModuleRole;
  donationUnitId?: string;
  donationZoneId?: string;
  donationUnitIds?: string[];
  donationCountryIds?: string[];
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
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
  donationUnitIds?: string[];
  donationCountryIds?: string[];
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
  /** Lot 4.8 — pays coordonnés (SECRETARIAT/LEADER) — réservé SUPER_ADMIN. */
  coordinatedCountryIds?: string[];
  active?: boolean;
  superAdmin?: boolean;
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
export type UnitType = 'CENTER' | 'ASSEMBLY';

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
  type: UnitType;
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
  const { data } = await apiClient.post<UnitResponse>('/api/church/admin/units', payload);
  return data;
}

export async function updateUnit(id: string, payload: UpdateUnitRequest) {
  const { data } = await apiClient.patch<UnitResponse>(`/api/church/admin/units/${id}`, payload);
  return data;
}

export async function deleteUnit(id: string) {
  await apiClient.delete(`/api/church/admin/units/${id}`);
}
