import axios from 'axios';
import { apiClient } from './apiClient';
import type { CountryBranding } from '../theme/branding';
import type { MeResponse } from './authApi';

// ---------------------------------------------------------------------------------------------
//  Pays, configuration par pays et géographie du compte — lot « conf-pays » (JP 11/11).
//  Contrat docs/shephr/11_11_2026/02_Contrat_API_Configuration_Pays.md §3.4 / §4.2.
//  Les routes publiques (`/api/public/countries/**`) passent par une instance axios SANS intercepteur
//  ni jeton (§5.4) : le serveur ignore un jeton invalide, et un 401 n'y doit jamais purger la session.
// ---------------------------------------------------------------------------------------------

const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

/** Mirrors com.excellence.back.org.branding.CountryBrandingDtos.PublicCountry (JP 11/11). */
export interface PublicCountry {
  /** ISO 3166-1 alpha-2, majuscules. */
  code: string;
  name: string;
  nameEn: string;
  /** Configuration ACTIVE (pays configurés en tête de liste). */
  hasBranding: boolean;
}

/** `GET /api/public/countries` — pays actifs de la CMCI (RG-PAYS-13 : aucune donnée de membre). */
export async function listPublicCountries(): Promise<PublicCountry[]> {
  const { data } = await publicClient.get<PublicCountry[]>('/api/public/countries');
  return data ?? [];
}

/**
 * Issue d'une relecture de configuration (§5.4) : `ok` (200, nouvelle configuration), `unchanged` (304),
 * `none` (404 `BRANDING_NOT_FOUND` = Shephr standard), `error` (réseau, 429, 5xx — rien ne change).
 */
export type BrandingFetch =
  | { kind: 'ok'; branding: CountryBranding }
  | { kind: 'unchanged' }
  | { kind: 'none' }
  | { kind: 'error' };

/**
 * `GET /api/public/countries/{code}/branding` — `If-None-Match: "{ISO}-{version}"` composé depuis le cache (l'en-tête
 * `ETag` n'est pas exposé en CORS : inutile de le lire).
 */
export async function fetchCountryBranding(code: string, cachedVersion?: number | null): Promise<BrandingFetch> {
  const iso = code.toUpperCase();
  try {
    const res = await publicClient.get<CountryBranding>(`/api/public/countries/${encodeURIComponent(iso)}/branding`, {
      headers: cachedVersion != null ? { 'If-None-Match': `"${iso}-${cachedVersion}"` } : undefined,
      validateStatus: (s) => s === 200 || s === 304 || s === 404,
    });
    if (res.status === 304) return { kind: 'unchanged' };
    if (res.status === 404) return { kind: 'none' };
    return res.data ? { kind: 'ok', branding: res.data } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

// --- Géographie du compte (`/api/church/me`, MeGeographyController) ---------------------------

/** Mirrors com.excellence.back.auth.country.MeGeographyDtos.MeCity (JP 11/11). */
export interface MeCity { id: string; name: string; regionName: string | null }

/** RG-PAYS-05 / RG-PAYS-06 — 400 `COUNTRY_UNKNOWN` ; 422 `COUNTRY_LOCKED_BY_ASSEMBLY`. */
export async function setMyCountry(countryIso: string): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/api/church/me/country', { countryIso });
  return data;
}

/** RG-PAYS-21 — null = aucune ville. 400 `CITY_NOT_IN_COUNTRY` ; 422 `CITY_LOCKED_BY_ASSEMBLY`. */
export async function setMyCity(cityNodeId: string | null): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/api/church/me/city', { cityNodeId });
  return data;
}

/** Villes actives du pays (défaut : pays du compte) ; `q` ≥ 2 caractères. 400 `COUNTRY_UNKNOWN`. */
export async function listMyCities(params: { countryIso?: string; q?: string } = {}): Promise<MeCity[]> {
  const { data } = await apiClient.get<MeCity[]>('/api/church/me/cities', { params });
  return data ?? [];
}

/** Mirrors com.excellence.back.auth.country.MeGeographyDtos.NoAssemblyRequest (JP 11/11). */
export interface NoAssemblyRequest { countryIso: string; cityNodeId?: string | null; consent: boolean }

/** RG-PAYS-20 — « Je n'ai pas d'assemblée » ; `consent` facultatif (E-05) : sans lui, aucune fiche de suivi. */
export async function declareNoAssembly(body: NoAssemblyRequest): Promise<MeResponse> {
  const { data } = await apiClient.put<MeResponse>('/api/church/me/no-assembly', body);
  return data;
}

/** RG-PAYS-33 — « Ne plus être recontacté ». */
export async function optOutFollowUp(): Promise<MeResponse> {
  const { data } = await apiClient.post<MeResponse>('/api/church/me/follow-up/opt-out');
  return data;
}

/** Nom d'un pays dans la langue de l'interface. */
export function countryLabel(c: PublicCountry, lang: string): string {
  return lang.startsWith('en') ? c.nameEn || c.name : c.name;
}
