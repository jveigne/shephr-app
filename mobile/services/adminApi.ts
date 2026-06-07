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

export async function createUnit(payload: { ministryId: string; localityId: string; name: string; type: UnitType }) {
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
