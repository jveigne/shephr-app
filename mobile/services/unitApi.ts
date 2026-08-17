import { apiClient } from './apiClient';

/**
 * ⚠ Vestige : `CENTER` n'existe plus côté backend depuis le Chantier B (toute unité est une
 * assemblée de maison). L'union large est conservée le temps que les écrans du module Dons
 * (`leaderApi`, `(tabs)/leader/unit/[unitId]`) s'en débarrassent — hors périmètre de ce lot.
 * Les DTO à jour, eux, portent le littéral `'ASSEMBLY'`.
 */
export type UnitType = 'CENTER' | 'ASSEMBLY';

// Mirrors com.excellence.back.org.unit.dto.MyUnitResponse
export interface MyUnitResponse {
  unitId: string;
  unitName: string;
  type: 'ASSEMBLY';
  ministryId: string;
  ministryName: string;
  localityId: string | null;
  localityName: string | null;
}

export interface JoinUnitRequest {
  joinCode: string;
}

export async function joinUnit(payload: JoinUnitRequest): Promise<MyUnitResponse> {
  const { data } = await apiClient.post<MyUnitResponse>(
    '/api/church/units/join',
    payload,
  );
  return data;
}

export async function getMyUnit(): Promise<MyUnitResponse> {
  const { data } = await apiClient.get<MyUnitResponse>('/api/church/units/me');
  return data;
}

export async function leaveUnit(): Promise<void> {
  await apiClient.post('/api/church/units/leave');
}

// Mirrors com.excellence.back.org.unit.dto.ChangeMyAssemblyRequest
export interface ChangeMyAssemblyRequest {
  unitId: string;
}

/**
 * RG-BQ-13 (JP 16/08) — changer d'assemblée SOI-MÊME, sans demande ni valideur.
 *
 * <p>Pose `goalUnitId` ET `donationUnitId` sur l'assemblée cible ; ne touche pas à `goalUnitIds`
 * (les assemblées qu'on dirige — déménager ne fait pas démissionner). **Les engagements suivent la
 * personne**, années passées comprises : rien à faire côté front, le total de l'ancienne assemblée
 * baisse et celui de la nouvelle monte à la lecture suivante.
 *
 * <p>Après succès, appeler `refreshMe()` : deux champs du `MeResponse` changent d'un coup.
 *
 * <p>Erreurs : 404 (assemblée inconnue ou inactive) · 422 `ASSEMBLY_MINISTRY_MISMATCH` (seule
 * frontière : changer de ministère est un acte d'administration).
 */
export async function changeMyAssembly(unitId: string): Promise<MyUnitResponse> {
  const { data } = await apiClient.put<MyUnitResponse>('/api/church/units/me/assembly', { unitId });
  return data;
}
