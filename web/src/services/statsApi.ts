import { apiClient } from './apiClient';

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

export interface DonationSummary {
  currentMonth: CurrencyTotal[];
  lastMonth: CurrencyTotal[];
  yearToDate: CurrencyTotal[];
}

export interface DonationByMonthStat {
  year: number;
  month: number;
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

export async function getSummary(unitId?: string) {
  const { data } = await apiClient.get<DonationSummary>(
    '/api/church/donations/stats/summary',
    { params: { unitId } },
  );
  return data;
}

export async function getByMonth(unitId?: string) {
  const { data } = await apiClient.get<DonationByMonthStat[]>(
    '/api/church/donations/stats/by-month',
    { params: { unitId } },
  );
  return data;
}

export async function getByUnit(params: { from?: string; to?: string } = {}) {
  const { data } = await apiClient.get<DonationByUnitStat[]>(
    '/api/church/donations/stats/by-unit',
    { params },
  );
  return data;
}

export async function getByCategory(params: { from?: string; to?: string; unitId?: string } = {}) {
  const { data } = await apiClient.get<DonationByCategoryStat[]>(
    '/api/church/donations/stats/by-category',
    { params },
  );
  return data;
}

export interface ExportParams {
  from?: string;
  to?: string;
  unitId?: string;
}

/**
 * Downloads the donations CSV. Uses apiClient so the Bearer token is attached
 * (the endpoint is LEADER+SUPER_ADMIN — a plain <a href> can't carry the header).
 * `GET /api/church/donations/export` (module DONATIONS).
 */
export async function downloadDonationsCsv(params: ExportParams = {}): Promise<Blob> {
  const { data } = await apiClient.get('/api/church/donations/export', {
    params: { format: 'csv', ...params },
    responseType: 'blob',
  });
  return data as Blob;
}
