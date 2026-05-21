import { apiClient } from './apiClient';

export type UnitType = 'CENTER' | 'ASSEMBLY';

export interface MyUnitResponse {
  unitId: string;
  unitName: string;
  type: UnitType;
  ministryId: string;
  ministryName: string;
  localityId: string;
  localityName: string;
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
