import { apiClient } from './apiClient';
import type { UnitType } from './unitApi';
import type { CurrencyTotal } from './statsApi';

export interface LeaderUnitView {
  unitId: string;
  unitName: string;
  type: UnitType;
  localityId: string;
  localityName: string;
}

export interface LeaderMemberView {
  userId: string;
  fullName: string;
  email: string;
  unitId: string;
  unitName: string;
  active: boolean;
  donationTotals: CurrencyTotal[];
}

export async function listMyUnits(): Promise<LeaderUnitView[]> {
  const { data } = await apiClient.get<LeaderUnitView[]>(
    '/api/church/leader/units',
  );
  return data;
}

export async function listMyMembers(params: {
  from?: string;
  to?: string;
} = {}): Promise<LeaderMemberView[]> {
  const { data } = await apiClient.get<LeaderMemberView[]>(
    '/api/church/leader/members',
    { params },
  );
  return data;
}
