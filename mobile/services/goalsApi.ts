import { apiClient } from './apiClient';

// Mirrors com.excellence.back.goals.* DTOs (Lot 4.1 — UC-DIR-08→14).

export type PledgeUnitType = 'CURRENCY' | 'COUNT';
export type PledgeKind = 'DIRECT' | 'FAITH';
export type GoalLevel = 'UNIT' | 'ZONE' | 'COUNTRY' | 'CONTINENT';

export interface GoalCategory {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  unitType: PledgeUnitType;
  unitLabel: string | null;
  displayOrder: number;
  iconCode: string | null;
}

export interface ActiveGoal {
  goalId: string;
  name: string;
  nameEn: string;
  description: string | null;
  descriptionEn: string | null;
  startDate: string;
  endDate: string;
  submissionDeadline: string | null;
  defaultCurrency: string;
  categories: GoalCategory[];
  // Annualisation (Lot 4.6) :
  currentYear: number;
  openYears: number[];
  // Lot G1.c :
  /** Années affichées dans les sélecteurs (orthogonal à openYears = droit d'écriture). */
  visibleYears: number[];
  /** Objectif final « Quinquennat » (année jalon de fin + date) — null si aucun jalon. */
  quinquennat: { year: number; date: string | null } | null;
  // Lot G2 :
  /** Deadline effective par année (clé = année) — clé absente si aucune deadline. */
  yearDeadlines: Record<string, string> | null;
}

/** `?year=` si l'année est fournie (sinon le backend retombe sur l'année courante). */
const yq = (year?: number) => (year != null ? `?year=${year}` : '');

export interface PledgeResponse {
  id: string;
  goalId: string;
  categoryId: string;
  categoryCode: string;
  level: GoalLevel;
  targetEntityId: string;
  kind: PledgeKind;
  year: number;
  targetAmount: number | null;
  targetCount: number | null;
  locked: boolean;
  lockedAt: string | null;
  /** Déclarant de l'engagement (Lot G1.b). */
  createdById: string | null;
  createdByName: string | null;
  /** Lot G2 — server-driven : date limite d'écriture (deadline de l'année). */
  editableUntil: string | null;
  /** Lot G2 — server-driven : modifiable par l'appelant courant. */
  editable: boolean | null;
}

export interface CreatePledgeRequest {
  categoryId: string;
  year?: number;
  targetAmount?: number;
  targetCount?: number;
}

export interface UpdatePledgeRequest {
  targetAmount?: number;
  targetCount?: number;
}

export interface SubmitResponse {
  goalId: string;
  unitId: string;
  lockedPledges: number;
  submittedAt: string;
}

export interface ProgressResponse {
  id: string;
  pledgeId: string;
  amount: number | null;
  count: number | null;
  progressDate: string;
  note: string | null;
  recordedById: string;
  /** Auteur de l'avancement (Lot G1.b). */
  recordedByName: string | null;
  createdAt: string;
  /** Lot G2 — server-driven : date limite d'écriture (deadline de l'année). */
  editableUntil: string | null;
  /** Lot G2 — server-driven : modifiable/supprimable par l'appelant courant (remplace la règle 24 h). */
  editable: boolean | null;
}

export interface AddProgressRequest {
  amount?: number;
  count?: number;
  progressDate?: string;
  note?: string;
}

export interface UpdateProgressRequest {
  amount?: number;
  count?: number;
  note?: string;
}


// --- Goal & pledges (UC-DIR-08/09) ------------------------------------------

export async function getActiveGoal(): Promise<ActiveGoal> {
  const { data } = await apiClient.get<ActiveGoal>('/api/church/goals/active');
  return data;
}

export async function getMyPledges(year?: number): Promise<PledgeResponse[]> {
  const { data } = await apiClient.get<PledgeResponse[]>(
    `/api/church/goals/me/pledges${yq(year)}`,
  );
  return data;
}

export async function createPledge(
  payload: CreatePledgeRequest,
): Promise<PledgeResponse> {
  const { data } = await apiClient.post<PledgeResponse>(
    '/api/church/goals/pledges',
    payload,
  );
  return data;
}

export async function updatePledge(
  id: string,
  payload: UpdatePledgeRequest,
): Promise<PledgeResponse> {
  const { data } = await apiClient.patch<PledgeResponse>(
    `/api/church/goals/pledges/${id}`,
    payload,
  );
  return data;
}

// --- Submission (UC-DIR-11) --------------------------------------------------

export async function submitMyPledges(year?: number): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>(
    `/api/church/goals/me/submit${yq(year)}`,
  );
  return data;
}

// --- Progress (UC-DIR-12/13/14) ----------------------------------------------

export async function listProgress(
  pledgeId: string,
): Promise<ProgressResponse[]> {
  const { data } = await apiClient.get<ProgressResponse[]>(
    `/api/church/goals/pledges/${pledgeId}/progress`,
  );
  return data;
}

export async function addProgress(
  pledgeId: string,
  payload: AddProgressRequest,
): Promise<ProgressResponse> {
  const { data } = await apiClient.post<ProgressResponse>(
    `/api/church/goals/pledges/${pledgeId}/progress`,
    payload,
  );
  return data;
}

export async function updateProgress(
  id: string,
  payload: UpdateProgressRequest,
): Promise<ProgressResponse> {
  const { data } = await apiClient.patch<ProgressResponse>(
    `/api/church/goals/progress/${id}`,
    payload,
  );
  return data;
}

export async function deleteProgress(id: string): Promise<void> {
  await apiClient.delete(`/api/church/goals/progress/${id}`);
}

// --- Agrégats & engagements de foi (Lot 4.2 — UC-LDR-04/05, UC-COO-04/05) -----

/** Chemin d'URL des niveaux agrégeables. */
export type AggregateLevelPath = 'zones' | 'countries' | 'continents';

export type AggregationSource = 'AGGREGATE' | 'FAITH';

export interface AggregateLine {
  categoryId: string;
  categoryCode: string;
  level: GoalLevel;
  entityId: string;
  /** Somme des engagements effectifs des enfants (DIRECT unités / effectifs zones…). */
  aggregateOfChildren: number | null;
  /** Engagement effectif = MAX(agrégat enfants, meilleure foi du niveau) — RG-08. */
  effectiveAmount: number | null;
  effectiveCount: number | null;
  source: AggregationSource;
}

export interface FaithPledgeResponse {
  id: string;
  categoryId: string;
  categoryCode: string;
  targetAmount: number | null;
  targetCount: number | null;
  createdById: string;
  createdByName: string | null;
}

export async function getAggregate(
  level: AggregateLevelPath,
  entityId: string,
  year?: number,
): Promise<AggregateLine[]> {
  const { data } = await apiClient.get<AggregateLine[]>(
    `/api/church/goals/${level}/${entityId}/aggregate${yq(year)}`,
  );
  return data;
}

export async function listFaithPledges(
  level: AggregateLevelPath,
  entityId: string,
  year?: number,
): Promise<FaithPledgeResponse[]> {
  const { data } = await apiClient.get<FaithPledgeResponse[]>(
    `/api/church/goals/${level}/${entityId}/faith-pledges${yq(year)}`,
  );
  return data;
}

export async function createFaithPledge(
  level: AggregateLevelPath,
  entityId: string,
  payload: { categoryId: string; year?: number; targetAmount?: number; targetCount?: number },
): Promise<PledgeResponse> {
  const { data } = await apiClient.post<PledgeResponse>(
    `/api/church/goals/${level}/${entityId}/faith-pledges`,
    payload,
  );
  return data;
}

export async function updateFaithPledge(
  id: string,
  payload: { targetAmount?: number; targetCount?: number },
): Promise<PledgeResponse> {
  const { data } = await apiClient.patch<PledgeResponse>(
    `/api/church/goals/faith-pledges/${id}`,
    payload,
  );
  return data;
}

export async function deleteFaithPledge(id: string): Promise<void> {
  await apiClient.delete(`/api/church/goals/faith-pledges/${id}`);
}

// --- Vues agrégées manquantes (Lot 4.3 — UC-DIR-13, UC-LDR-06) ---------------

/** Avancement enrichi de sa catégorie — remplace N appels listProgress (UC-DIR-13). */
export interface MyProgressResponse extends ProgressResponse {
  categoryId: string;
  categoryCode: string;
}

export interface ZoneUnitStatus {
  unitId: string;
  unitName: string;
  unitType: string | null;
  localityName: string | null;
  pledgeCount: number;
  submitted: boolean;
  submittedAt: string | null;
  /** Deadline dépassée et unité non soumise. */
  late: boolean;
  /** L'unité a un DIRIGEANT goal rattaché. */
  hasLeader: boolean;
  /** Nom du DIRIGEANT goal de l'unité — null si sans dirigeant (Lot G1.b). */
  leaderName: string | null;
}

export async function getMyProgress(year?: number): Promise<MyProgressResponse[]> {
  const { data } = await apiClient.get<MyProgressResponse[]>(`/api/church/goals/me/progress${yq(year)}`);
  return data;
}

export async function getZoneUnits(zoneId: string, year?: number): Promise<ZoneUnitStatus[]> {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(
    `/api/church/goals/zones/${zoneId}/units${yq(year)}`,
  );
  return data;
}

// Lot G2 : la règle locale « 24 h » (ex-isProgressEditable) est SUPPRIMÉE — l'éditabilité est
// server-driven via `ProgressResponse.editable` / `editableUntil` (deadline de l'année).
