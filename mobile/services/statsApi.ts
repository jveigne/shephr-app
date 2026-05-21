import { apiClient } from './apiClient';

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

export interface DonationByUnitStat {
  unitId: string;
  unitName: string;
  currency: string;
  total: number;
  count: number;
}

export interface DonationByCategoryStat {
  category: string;
  currency: string;
  total: number;
  count: number;
}

export interface DonationByMonthStat {
  year: number;
  month: number;
  currency: string;
  total: number;
  count: number;
}

export interface DonationByUserStat {
  userId: string;
  userFullName: string;
  currency: string;
  total: number;
  count: number;
}

export interface DonationSummary {
  currentMonth: CurrencyTotal[];
  lastMonth: CurrencyTotal[];
  yearToDate: CurrencyTotal[];
}

interface PeriodParams {
  from?: string;
  to?: string;
}

export async function getSummary(unitId?: string): Promise<DonationSummary> {
  const { data } = await apiClient.get<DonationSummary>(
    '/api/church/donations/stats/summary',
    { params: { unitId } },
  );
  return data;
}

export async function getByUnit(params: PeriodParams = {}): Promise<DonationByUnitStat[]> {
  const { data } = await apiClient.get<DonationByUnitStat[]>(
    '/api/church/donations/stats/by-unit',
    { params },
  );
  return data;
}

export async function getByCategory(
  params: PeriodParams & { unitId?: string } = {},
): Promise<DonationByCategoryStat[]> {
  const { data } = await apiClient.get<DonationByCategoryStat[]>(
    '/api/church/donations/stats/by-category',
    { params },
  );
  return data;
}

export async function getByMonth(unitId?: string): Promise<DonationByMonthStat[]> {
  const { data } = await apiClient.get<DonationByMonthStat[]>(
    '/api/church/donations/stats/by-month',
    { params: { unitId } },
  );
  return data;
}

export async function getByUser(
  unitId: string,
  params: PeriodParams = {},
): Promise<DonationByUserStat[]> {
  const { data } = await apiClient.get<DonationByUserStat[]>(
    '/api/church/donations/stats/by-user',
    { params: { unitId, ...params } },
  );
  return data;
}

export function buildExportUrl(params: {
  from?: string;
  to?: string;
  unitId?: string;
} = {}): string {
  const q = new URLSearchParams({ format: 'csv' });
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.unitId) q.set('unitId', params.unitId);
  return `/api/church/donations/export?${q.toString()}`;
}
