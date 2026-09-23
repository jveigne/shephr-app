import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

/** Formats servis par `DonationExportController` — un format inconnu y vaut 400, jamais un défaut. */
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportParams {
  from?: string;
  to?: string;
  unitId?: string;
  status?: DeclarationStatus;
}

export function buildExportUrl(format: ExportFormat = 'csv', params: ExportParams = {}): string {
  const q = new URLSearchParams({ format });
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.unitId) q.set('unitId', params.unitId);
  if (params.status) q.set('status', params.status);
  return `/api/church/donations/export?${q.toString()}`;
}

const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * Télécharge l'export et le remet à la personne.
 *
 * <p>⚠ L'endpoint est GARDÉ (`treasuryAccessService.requireTreasurer`) : il faut le Bearer. Un
 * `Linking.openURL` sur l'URL nue partirait donc SANS jeton et récolterait un 401 — c'est pourquoi
 * on passe par `apiClient`, qui l'injecte, et qu'on manipule ensuite les octets nous-mêmes.
 *
 * <p>Deux chemins, parce que « remettre un fichier » n'a pas le même sens partout :
 * sur le web, un lien de téléchargement ; sur mobile, un fichier écrit dans le cache puis proposé
 * à la feuille de partage (enregistrer, envoyer, ouvrir dans une autre app).
 *
 * <p>Le nom du fichier vient du serveur (`Content-Disposition`) quand il est lisible — sur le web
 * cet en-tête n'est exposé que si le serveur le permet, d'où le repli sur un nom construit ici.
 */
export async function downloadExport(
  format: ExportFormat = 'csv',
  params: ExportParams = {},
): Promise<void> {
  const url = buildExportUrl(format, params);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `donations-${today}.${format}`;

  if (Platform.OS === 'web') {
    const { data } = await apiClient.get<Blob>(url, { responseType: 'blob' });
    const href = URL.createObjectURL(new Blob([data], { type: EXPORT_MIME[format] }));
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Libérer l'objet tout de suite couperait le téléchargement dans certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return;
  }

  const { data } = await apiClient.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
  // API `File`/`Paths` d'expo-file-system 19 : `write` prend les octets tels quels — pas de
  // détour par du base64, qui doublerait la taille en mémoire pour un export volumineux.
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(new Uint8Array(data));
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('SHARING_UNAVAILABLE');
  }
  await Sharing.shareAsync(file.uri, { mimeType: EXPORT_MIME[format], UTI: format });
}
