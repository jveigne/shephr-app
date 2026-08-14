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
export type AggregateLevelPath = 'cities' | 'zones' | 'countries' | 'continents';

/** DIRECT = l'engagement du dirigeant l'emporte sur l'agrégat des membres (niveau ASSEMBLY). */
export type AggregationSource = 'AGGREGATE' | 'DIRECT' | 'FAITH';

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
  /** Feature A — agrégat des engagements des fidèles (niveau ASSEMBLY uniquement). */
  membersSum?: number | null;
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

// --- Feature A — objectifs personnels des MEMBRES + agrégat des fidèles -------

/** Engagement d'un fidèle dans l'agrégat d'assemblée. */
/**
 * Objectifs d'UNE personne (JP 31/07) — ouverts depuis la liste des membres.
 *
 * <p>Deux volets : ses engagements PERSONNELS, et l'engagement de l'assemblée dont elle est
 * dirigeante (absent si elle n'en dirige aucune). Le backend borne la lecture au périmètre de
 * l'appelant — un 403 signifie « pas dans votre périmètre », pas « pas d'engagement ».
 */
export interface MemberGoalsResponse {
  memberId: string;
  fullName: string;
  year: number;
  memberPledges: PledgeResponse[];
  assemblyName: string | null;
  assemblyPledges: PledgeResponse[];
}

export async function fetchMemberGoals(memberId: string, year?: number): Promise<MemberGoalsResponse> {
  const { data } = await apiClient.get<MemberGoalsResponse>(
    `/api/church/goals/member/${memberId}/goals${yq(year)}`,
  );
  return data;
}

export interface MemberPledgeEntry {
  userId: string;
  fullName: string;
  amount: number | null;
  count: number | null;
  /** Le membre a soumis ses objectifs : seul le secrétariat peut les rouvrir (JP 28/07). */
  locked: boolean;
}

export interface MembersAggregateLine {
  categoryId: string;
  categoryCode: string;
  /** Somme des engagements des fidèles de l'assemblée. */
  membersSum: number | null;
  /** Engagement DIRECT du dirigeant (montant / nombre selon la catégorie). */
  leaderAmount: number | null;
  leaderCount: number | null;
  /** Retenu = MAX(agrégat des fidèles, engagement du dirigeant, foi). */
  effectiveAmount: number | null;
  effectiveCount: number | null;
  source: AggregationSource;
  members: MemberPledgeEntry[];
}

export interface MembersAggregateResponse {
  unitId: string;
  year: number;
  lines: MembersAggregateLine[];
}

/** Mes engagements personnels de MEMBRE (même forme que les pledges existants). */
export async function fetchMyMemberPledges(year?: number): Promise<PledgeResponse[]> {
  const { data } = await apiClient.get<PledgeResponse[]>(
    `/api/church/goals/member/me/pledges${yq(year)}`,
  );
  return data;
}

/**
 * Crée / remplace mon engagement personnel de MEMBRE sur une catégorie.
 * Erreurs 422 : NO_ASSEMBLY_ATTACHMENT, PLEDGE_LOCKED, DEADLINE_PASSED.
 */
export async function saveMemberPledge(payload: CreatePledgeRequest): Promise<PledgeResponse> {
  const { data } = await apiClient.post<PledgeResponse>(
    '/api/church/goals/member/me/pledges',
    payload,
  );
  return data;
}

/**
 * Décision JP 28/07 — le membre soumet LUI-MÊME ses objectifs de l'année : ils sont verrouillés,
 * indépendamment de la soumission de son assemblée. Pour les corriger ensuite, il doit passer par
 * le secrétariat. Erreurs 422 : NO_PLEDGE_TO_SUBMIT, ALREADY_SUBMITTED, DEADLINE_PASSED.
 */
export async function submitMyMemberPledges(year?: number): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>(
    `/api/church/goals/member/me/submit${yq(year)}`,
  );
  return data;
}

/**
 * Agrégat des fidèles d'une assemblée (périmètre GOAL habituel + le membre pour SA propre
 * assemblée) : agrégat / engagement du dirigeant / retenu (MAX) + détail par fidèle.
 */
export async function fetchMembersAggregate(
  unitId: string,
  year?: number,
): Promise<MembersAggregateResponse> {
  const { data } = await apiClient.get<MembersAggregateResponse>(
    `/api/church/goals/units/${unitId}/members-aggregate${yq(year)}`,
  );
  return data;
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

/** Avancements de MES objectifs personnels de membre (décision JP 28/07). */
export async function getMyMemberProgress(year?: number): Promise<MyProgressResponse[]> {
  const { data } = await apiClient.get<MyProgressResponse[]>(
    `/api/church/goals/member/me/progress${yq(year)}`,
  );
  return data;
}

export async function getZoneUnits(zoneId: string, year?: number): Promise<ZoneUnitStatus[]> {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(
    `/api/church/goals/zones/${zoneId}/units${yq(year)}`,
  );
  return data;
}

/** Lot 3.5 — assemblées du SOUS-ARBRE du dirigeant (indépendant du niveau de ses nœuds de périmètre). */
export async function getMyUnits(year?: number): Promise<ZoneUnitStatus[]> {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(`/api/church/goals/me/units${yq(year)}`);
  return data;
}

// --- Lot 4.7 — drill-down dirigeant : détail (engagé + versé) d'une unité de son sous-arbre (lecture seule) ---
export interface UnitPledgeDetail {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  targetAmount: number | null;
  targetCount: number | null;
  achievedAmount: number | null;
  achievedCount: number | null;
  locked: boolean;
  /** Nom du DIRIGEANT goal de l'unité — identique sur chaque ligne (Lot G1.b). */
  leaderName: string | null;
}

export async function getUnitDetail(unitId: string, year?: number): Promise<UnitPledgeDetail[]> {
  const { data } = await apiClient.get<UnitPledgeDetail[]>(
    `/api/church/goals/units/${unitId}/detail${yq(year)}`,
  );
  return data;
}

// Lot G2 : la règle locale « 24 h » (ex-isProgressEditable) est SUPPRIMÉE — l'éditabilité est
// server-driven via `ProgressResponse.editable` / `editableUntil` (deadline de l'année).

// --- Lot V1 — vues ministère-large (Présentation générale / Secrétariat) ---
export interface GlobalSummaryLine {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  effectiveAmount: number | null;
  effectiveCount: number | null;
  achieved: number;
}
export interface GlobalSummary {
  goalId: string;
  goalName: string;
  totalUnits: number;
  submittedUnits: number;
  totals: GlobalSummaryLine[];
}
export async function getGlobalSummary(year?: number): Promise<GlobalSummary> {
  const { data } = await apiClient.get<GlobalSummary>(`/api/church/goals/global/summary${yq(year)}`);
  return data;
}
export interface NationStatus {
  countryId: string;
  name: string;
  totalUnits: number;
  submittedUnits: number;
  submissionRate: number;
  late: boolean;
}
export async function getNations(year?: number): Promise<{ deadlinePast: boolean; nations: NationStatus[] }> {
  const { data } = await apiClient.get<{ deadlinePast: boolean; nations: NationStatus[] }>(
    `/api/church/goals/global/nations${yq(year)}`,
  );
  return data;
}

// --- Lot V1 — vue COORDINATEUR : cumuls par Région + somme totale Nation ---
export interface RegionSummary {
  regionId: string;
  regionName: string;
  totalUnits: number;
  submittedUnits: number;
  submissionRate: number;
  lines: GlobalSummaryLine[];
}
export interface NationRegionsSummary {
  nationId: string;
  nationName: string | null;
  regionLabel: 'REGION' | 'STATE' | null;
  regions: RegionSummary[];
  totals: GlobalSummaryLine[];
}
export async function getRegionsSummary(nationId: string, year?: number): Promise<NationRegionsSummary> {
  const { data } = await apiClient.get<NationRegionsSummary>(
    `/api/church/goals/nations/${nationId}/regions-summary${yq(year)}`,
  );
  return data;
}
