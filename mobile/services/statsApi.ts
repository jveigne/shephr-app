import { apiClient } from './apiClient';
import type { DeclarationStatus } from './donationApi';

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

/**
 * Lot T6/T8 (J-1, 14/09) — toutes les vues d'agrégat acceptent `?status=DECLARE|VERIFIE`.
 *
 * **Omis, le comportement est exactement celui d'avant le lot** (tout ce qui a été déclaré) : les
 * écrans qui n'ont pas besoin du statut n'ont rien à changer. `VERIFIE` donne les totaux
 * OFFICIELS — les seuls présentables devant un conseil d'assemblée — et `DECLARE` la file de
 * travail du trésorier. `undefined` est omis par axios : on ne passe jamais `status=` vide.
 */
interface StatusParam {
  status?: DeclarationStatus;
}

interface PeriodParams extends StatusParam {
  from?: string;
  to?: string;
}

export async function getSummary(
  unitId?: string,
  status?: DeclarationStatus,
): Promise<DonationSummary> {
  const { data } = await apiClient.get<DonationSummary>(
    '/api/church/donations/stats/summary',
    { params: { unitId, status } },
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

export async function getByMonth(
  unitId?: string,
  status?: DeclarationStatus,
): Promise<DonationByMonthStat[]> {
  const { data } = await apiClient.get<DonationByMonthStat[]>(
    '/api/church/donations/stats/by-month',
    { params: { unitId, status } },
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
  status?: DeclarationStatus;
} = {}): string {
  const q = new URLSearchParams({ format: 'csv' });
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.unitId) q.set('unitId', params.unitId);
  if (params.status) q.set('status', params.status);
  return `/api/church/donations/export?${q.toString()}`;
}
