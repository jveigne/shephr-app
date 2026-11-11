import { apiClient } from '@/services/apiClient';
import type { MeResponse } from '@/services/authApi';
import type { CountryBranding } from '@/theme/branding';

// ---------------------------------------------------------------------------------------------
//  Configuration par pays et géographie du compte — lot conf-pays (JP 11/11).
//  Contrat : cmfipraise-backend/docs/shephr/11_11_2026/02_Contrat_API_Configuration_Pays.md §3.4 et §4.2.
//  Routes publiques (`/api/public/countries/**`) : CMCI seule, aucune donnée de membre, jeton ignoré (RG-PAYS-13).
//  Routes du compte (`/api/church/me/**`) : tout compte connecté, sans @RequiresModule.
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.org.branding.CountryBrandingDtos.PublicCountry — `GET /api/public/countries`. */
export interface PublicCountry {
  /** ISO 3166-1 alpha-2, majuscules. */
  code: string;
  name: string;
  nameEn: string;
  /** Configuration ACTIVE (les pays configurés viennent en tête). */
  hasBranding: boolean;
}

/** Pays actifs de la CMCI, pays configurés en premier puis par nom. */
export async function fetchPublicCountries(timeoutMs = 8000): Promise<PublicCountry[]> {
  const { data } = await apiClient.get<PublicCountry[]>('/api/public/countries', { timeout: timeoutMs });
  return Array.isArray(data) ? data : [];
}

/**
 * Issue d'une lecture de configuration (contrat §5.4) : `ok` (200, configuration active), `unchanged` (304 —
 * If-None-Match égal), `none` (404 BRANDING_NOT_FOUND = Shephr standard), `failed` (réseau, délai, 429, 5xx :
 * rien ne change).
 */
export type BrandingFetch =
  | { kind: 'ok'; branding: CountryBranding }
  | { kind: 'unchanged' }
  | { kind: 'none' }
  | { kind: 'failed' };

/**
 * `GET /api/public/countries/{code}/branding` par un `fetch` SIMPLE, sans jeton (contrat §5.4) : le 304 doit
 * remonter tel quel. `etagVersion` = version de la configuration en cache pour CE pays → `If-None-Match:
 * "{ISO}-{version}"` composé ici (l'en-tête `ETag` n'est pas lu, non exposé en CORS).
 */
export async function fetchCountryBranding(
  iso: string,
  etagVersion: number | null,
  timeoutMs = 5000,
): Promise<BrandingFetch> {
  const code = iso.toUpperCase();
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/+$/, '');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (etagVersion != null) headers['If-None-Match'] = `"${code}-${etagVersion}"`;
    const res = await fetch(`${base}/api/public/countries/${encodeURIComponent(code)}/branding`, {
      method: 'GET',
      headers,
      signal: controller?.signal,
    });
    if (res.status === 304) return { kind: 'unchanged' };
    if (res.status === 404) return { kind: 'none' };
    if (!res.ok) return { kind: 'failed' };
    const body = (await res.json()) as CountryBranding;
    if (!body || typeof body !== 'object' || !body.colors) return { kind: 'failed' };
    return { kind: 'ok', branding: { ...body, countryIso: (body.countryIso ?? code).toUpperCase() } };
  } catch {
    return { kind: 'failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Mirrors com.excellence.back.auth.country.MeGeographyDtos.MeCity (JP 11/11). */
export interface MeCity {
  id: string;
  name: string;
  regionName: string | null;
}

/** Mirrors com.excellence.back.auth.country.MeGeographyDtos.NoAssemblyRequest (JP 11/11). */
export interface NoAssemblyRequest {
  countryIso: string;
  cityNodeId?: string | null;
  /** RG-PAYS-26 / écart E-05 — consentement de suivi FACULTATIF : sans lui, aucune fiche de suivi. */
  consent: boolean;
}

/** RG-PAYS-06 — `PATCH /me/country` ; 400 COUNTRY_UNKNOWN, 422 COUNTRY_LOCKED_BY_ASSEMBLY. */
export async function patchMyCountry(countryIso: string): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/api/church/me/country', { countryIso });
  return data;
}

/** RG-PAYS-21 — `PATCH /me/city` (null = aucune) ; 400 CITY_NOT_IN_COUNTRY, 422 CITY_LOCKED_BY_ASSEMBLY. */
export async function patchMyCity(cityNodeId: string | null): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/api/church/me/city', { cityNodeId });
  return data;
}

/** Villes ACTIVES du pays (défaut : pays du compte), triées par nom, 500 max ; 400 COUNTRY_UNKNOWN. */
export async function fetchMyCities(params: { countryIso?: string | null; q?: string } = {}): Promise<MeCity[]> {
  const { data } = await apiClient.get<MeCity[]>('/api/church/me/cities', {
    params: {
      ...(params.countryIso ? { countryIso: params.countryIso } : {}),
      ...(params.q && params.q.trim().length >= 2 ? { q: params.q.trim() } : {}),
    },
  });
  return Array.isArray(data) ? data : [];
}

/** RG-PAYS-20 — « Je n'ai pas d'assemblée » : pose pays + ville (+ fiche de suivi si `consent`). */
export async function putNoAssembly(payload: NoAssemblyRequest): Promise<MeResponse> {
  const { data } = await apiClient.put<MeResponse>('/api/church/me/no-assembly', payload);
  return data;
}

/** RG-PAYS-33 — « Ne plus être recontacté » : fiche → NE_SOUHAITE_PAS, `contactConsent` devient faux. */
export async function optOutFollowUp(): Promise<MeResponse> {
  const { data } = await apiClient.post<MeResponse>('/api/church/me/follow-up/opt-out');
  return data;
}

/**
 * Codes d'erreur du lot conf-pays traduits sous `countryErrors.*` (contrat §1.1, §12). Tout autre code retombe
 * sur le message serveur, puis sur `fallbackKey`.
 */
export const COUNTRY_ERROR_CODES = [
  'COUNTRY_UNKNOWN',
  'CITY_NOT_IN_COUNTRY',
  'COUNTRY_LOCKED_BY_ASSEMBLY',
  'CITY_LOCKED_BY_ASSEMBLY',
  'JOIN_CONSENT_REQUIRED',
  'FOLLOW_UP_OPTED_OUT',
  'FOLLOW_UP_STATUS_FORBIDDEN',
  'UNAUTHORIZED_ACCESS',
  'RESOURCE_NOT_FOUND',
] as const;

export function countryErrorMessage(
  e: unknown,
  t: (key: string, options?: any) => string,
  fallbackKey = 'errors.tryAgain',
): string {
  const response = (e as any)?.response;
  if (!response) return t('errors.serverUnreachable');
  const code = response.data?.error;
  if (typeof code === 'string' && (COUNTRY_ERROR_CODES as readonly string[]).includes(code)) {
    return t(`countryErrors.${code}`);
  }
  return (typeof response.data?.message === 'string' && response.data.message) || t(fallbackKey);
}
