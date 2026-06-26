import { apiClient } from './apiClient';

// Lectures scopées de la structure org (Lot 3.2 backend) — utilisées pour libeller
// le périmètre Goals d'un leader (noms de zone / pays). Listes filtrées au périmètre
// visible de l'utilisateur par le backend.

export interface ZoneSummary {
  id: string;
  countryId: string;
  countryName: string;
  name: string;
}

export interface CountrySummary {
  id: string;
  code: string;
  name: string;
}

export async function listZones(): Promise<ZoneSummary[]> {
  const { data } = await apiClient.get<ZoneSummary[]>('/api/church/admin/zones');
  return data;
}

export async function listCountries(): Promise<CountrySummary[]> {
  const { data } = await apiClient.get<CountrySummary[]>('/api/church/admin/countries');
  return data;
}
