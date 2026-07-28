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

// --- Goal & pledges (UC-DIR-08/09) ------------------------------------------

export async function getActiveGoal() {
  const { data } = await apiClient.get<ActiveGoal>('/api/church/goals/active');
  return data;
}

export async function getMyPledges(year?: number) {
  const { data } = await apiClient.get<PledgeResponse[]>(`/api/church/goals/me/pledges${yq(year)}`);
  return data;
}

export async function createPledge(payload: {
  categoryId: string;
  year?: number;
  targetAmount?: number;
  targetCount?: number;
}) {
  const { data } = await apiClient.post<PledgeResponse>('/api/church/goals/pledges', payload);
  return data;
}

export async function updatePledge(
  id: string,
  payload: { targetAmount?: number; targetCount?: number },
) {
  const { data } = await apiClient.patch<PledgeResponse>(
    `/api/church/goals/pledges/${id}`,
    payload,
  );
  return data;
}

// --- Submission (UC-DIR-11) --------------------------------------------------

export async function submitMyPledges(year?: number) {
  const { data } = await apiClient.post<SubmitResponse>(`/api/church/goals/me/submit${yq(year)}`);
  return data;
}

// --- Progress (UC-DIR-12/13/14) ----------------------------------------------

export async function listProgress(pledgeId: string) {
  const { data } = await apiClient.get<ProgressResponse[]>(
    `/api/church/goals/pledges/${pledgeId}/progress`,
  );
  return data;
}

export async function addProgress(
  pledgeId: string,
  payload: { amount?: number; count?: number; progressDate?: string; note?: string },
) {
  const { data } = await apiClient.post<ProgressResponse>(
    `/api/church/goals/pledges/${pledgeId}/progress`,
    payload,
  );
  return data;
}

export async function updateProgress(
  id: string,
  payload: { amount?: number; count?: number; note?: string },
) {
  const { data } = await apiClient.patch<ProgressResponse>(
    `/api/church/goals/progress/${id}`,
    payload,
  );
  return data;
}

export async function deleteProgress(id: string) {
  await apiClient.delete(`/api/church/goals/progress/${id}`);
}

// --- Agrégats & engagements de foi (Lot 4.2 — UC-LDR-04/05, UC-COO-04/05) -----

/** Niveaux portant des engagements de foi. */
export type FaithLevelPath = 'cities' | 'zones' | 'countries' | 'continents';
/** Niveaux agrégeables ('units' : agrégat seulement, pas de foi — Lot 4.5). */
export type AggregateLevelPath = FaithLevelPath | 'units';

/**
 * Quelle valeur l'emporte : AGGREGATE (enfants), FAITH (foi du niveau) ou — au niveau
 * ASSEMBLY (Feature A) — DIRECT (l'engagement du dirigeant l'emporte sur l'agrégat des membres).
 */
export type AggregationSource = 'AGGREGATE' | 'DIRECT' | 'FAITH';

export interface AggregateLine {
  categoryId: string;
  categoryCode: string;
  level: GoalLevel;
  entityId: string;
  /** Somme des engagements effectifs des enfants (DIRECT unités / effectifs zones…). */
  aggregateOfChildren: number | null;
  /** Feature A (niveau ASSEMBLY) — agrégat des fidèles de l'assemblée ; absent ailleurs. */
  membersSum?: number | null;
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

export async function getAggregate(level: AggregateLevelPath, entityId: string, year?: number) {
  const { data } = await apiClient.get<AggregateLine[]>(
    `/api/church/goals/${level}/${entityId}/aggregate${yq(year)}`,
  );
  return data;
}

export async function listFaithPledges(level: FaithLevelPath, entityId: string, year?: number) {
  const { data } = await apiClient.get<FaithPledgeResponse[]>(
    `/api/church/goals/${level}/${entityId}/faith-pledges${yq(year)}`,
  );
  return data;
}

export async function createFaithPledge(
  level: FaithLevelPath,
  entityId: string,
  payload: { categoryId: string; year?: number; targetAmount?: number; targetCount?: number },
) {
  const { data } = await apiClient.post<PledgeResponse>(
    `/api/church/goals/${level}/${entityId}/faith-pledges`,
    payload,
  );
  return data;
}

export async function updateFaithPledge(
  id: string,
  payload: { targetAmount?: number; targetCount?: number },
) {
  const { data } = await apiClient.patch<PledgeResponse>(
    `/api/church/goals/faith-pledges/${id}`,
    payload,
  );
  return data;
}

export async function deleteFaithPledge(id: string) {
  await apiClient.delete(`/api/church/goals/faith-pledges/${id}`);
}

// --- Feature A — espace membre : objectifs personnels & agrégat des fidèles ---

/** Engagements personnels du membre connecté (par catégorie, pour l'année). */
export async function fetchMyMemberPledges(year?: number) {
  const { data } = await apiClient.get<PledgeResponse[]>(
    `/api/church/goals/member/me/pledges${yq(year)}`,
  );
  return data;
}

/**
 * Crée / met à jour l'objectif personnel du membre sur une catégorie.
 * Erreurs 422 : NO_ASSEMBLY_ATTACHMENT, PLEDGE_LOCKED, DEADLINE_PASSED.
 */
export async function saveMemberPledge(payload: {
  categoryId: string;
  year?: number;
  targetAmount?: number;
  targetCount?: number;
}) {
  const { data } = await apiClient.post<PledgeResponse>(
    '/api/church/goals/member/me/pledges',
    payload,
  );
  return data;
}

/**
 * Décision JP 28/07 — le membre est un porteur d'engagement à part entière : il SOUMET
 * lui-même ses objectifs de l'année (ils se verrouillent), indépendamment de la soumission
 * de son assemblée. Erreurs 422 : NO_PLEDGE_TO_SUBMIT, ALREADY_SUBMITTED, DEADLINE_PASSED.
 */
export async function submitMyMemberPledges(year?: number) {
  const { data } = await apiClient.post<SubmitResponse>(
    `/api/church/goals/member/me/submit${yq(year)}`,
  );
  return data;
}

/** Rouvre les objectifs d'un membre (SECRETARIAT / superAdmin) — 403 sinon. */
export async function unlockMemberPledges(memberId: string, year?: number) {
  await apiClient.post(`/api/church/goals/member/${memberId}/unlock${yq(year)}`);
}

export interface MemberPledgeEntry {
  userId: string;
  fullName: string;
  amount: number | null;
  count: number | null;
  /** Le membre a soumis ses objectifs : seul le secrétariat peut les rouvrir. */
  locked: boolean;
}

export interface MembersAggregateLine {
  categoryId: string;
  categoryCode: string;
  /** Agrégat des fidèles (somme des objectifs personnels des membres). */
  membersSum: number | null;
  /** Engagement direct du dirigeant de l'assemblée. */
  leaderAmount: number | null;
  leaderCount: number | null;
  /** Retenu = MAX(agrégat des fidèles, engagement du dirigeant). */
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

/**
 * Objectifs des membres d'une assemblée + valeurs agrégées (fidèles / dirigeant / retenu).
 * Accessible au périmètre GOAL habituel ET au membre pour sa propre assemblée.
 */
export async function fetchMembersAggregate(unitId: string, year?: number) {
  const { data } = await apiClient.get<MembersAggregateResponse>(
    `/api/church/goals/units/${unitId}/members-aggregate${yq(year)}`,
  );
  return data;
}

// --- Vues agrégées manquantes (Lot 4.3 — UC-DIR-13, UC-LDR-06, UC-SEC-01) ----

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
  /** L'unité a un DIRIGEANT goal rattaché (destinataire possible d'un rappel). */
  hasLeader: boolean;
  /** Nom du DIRIGEANT goal de l'unité — null si sans dirigeant (Lot G1.b). */
  leaderName: string | null;
}

export interface GlobalSummaryLine {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  effectiveAmount: number | null;
  effectiveCount: number | null;
  achieved: number;
}

export interface ContinentSummary {
  continentId: string;
  code: string | null;
  name: string;
  totalUnits: number;
  submittedUnits: number;
  lines: GlobalSummaryLine[];
}

export interface GlobalSummary {
  goalId: string;
  goalName: string;
  totalUnits: number;
  submittedUnits: number;
  totals: GlobalSummaryLine[];
  continents: ContinentSummary[];
}

export async function getMyProgress(year?: number) {
  const { data } = await apiClient.get<MyProgressResponse[]>(`/api/church/goals/me/progress${yq(year)}`);
  return data;
}

/** Avancements de MES objectifs personnels de membre (décision JP 28/07). */
export async function getMyMemberProgress(year?: number) {
  const { data } = await apiClient.get<MyProgressResponse[]>(
    `/api/church/goals/member/me/progress${yq(year)}`,
  );
  return data;
}

export async function getZoneUnits(zoneId: string, year?: number) {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(
    `/api/church/goals/zones/${zoneId}/units${yq(year)}`,
  );
  return data;
}

// --- Lot 3.5 — « Mon périmètre » : vue scopée au SOUS-ARBRE du dirigeant (≠ zone géographique) ---
export async function getMyPerimeterAggregate(year?: number) {
  const { data } = await apiClient.get<AggregateLine[]>(`/api/church/goals/me/aggregate${yq(year)}`);
  return data;
}

export async function getMyUnits(year?: number) {
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

export async function getUnitDetail(unitId: string, year?: number) {
  const { data } = await apiClient.get<UnitPledgeDetail[]>(
    `/api/church/goals/units/${unitId}/detail${yq(year)}`,
  );
  return data;
}

export async function getGlobalSummary(year?: number) {
  const { data } = await apiClient.get<GlobalSummary>(`/api/church/goals/global/summary${yq(year)}`);
  return data;
}

// --- Lot 7.1 — dashboard SECRETARIAT : carte du monde (#6) + nations en retard ---
export interface Nation {
  countryId: string;
  /** Code ISO 3166-1 alpha-2 (pour la correspondance avec la carte). */
  code: string;
  name: string;
  continentId: string | null;
  continentCode: string | null;
  continentName: string | null;
  totalUnits: number;
  submittedUnits: number;
  lateUnits: number;
  /** Taux de soumission [0..1]. */
  submissionRate: number;
  late: boolean;
}

export interface NationsStatus {
  goalId: string;
  goalName: string;
  deadlinePast: boolean;
  nations: Nation[];
}

export async function getNations(year?: number) {
  const { data } = await apiClient.get<NationsStatus>(`/api/church/goals/global/nations${yq(year)}`);
  return data;
}

// --- Lot 7.1 — évolution dans le temps (versé cumulé par mois) à chaque niveau ---
export type TimelineLevel = 'units' | 'cities' | 'zones' | 'countries' | 'continents';

export interface TimelinePoint {
  /** Période « yyyy-MM ». */
  period: string;
  cumulativeAmount: number | null;
  cumulativeCount: number | null;
}

export interface CategoryTimeline {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  targetAmount: number | null;
  targetCount: number | null;
  points: TimelinePoint[];
}

export async function getTimeline(level: TimelineLevel, entityId: string, year?: number) {
  const { data } = await apiClient.get<CategoryTimeline[]>(
    `/api/church/goals/${level}/${entityId}/timeline${yq(year)}`,
  );
  return data;
}

// --- Rappels Goals (Lot 4.4 — UC-LDR-07) -------------------------------------

export interface ReminderResponse {
  notificationId: string;
  sentToId: string;
  sentToName: string | null;
}

/** Relance le DIRIGEANT d'une unité non soumise (anti-spam 24 h côté backend). */
export async function sendReminder(unitId: string, message?: string) {
  const { data } = await apiClient.post<ReminderResponse>(
    `/api/church/goals/units/${unitId}/reminders`,
    message ? { message } : {},
  );
  return data;
}

/**
 * Lot P2 : rouvre (déverrouille) les engagements d'une assemblée soumise pour une année —
 * SECRETARIAT ou SUPER_ADMIN uniquement (vérifié côté backend). L'assemblée devra resoumettre.
 */
export async function unlockUnit(unitId: string, year?: number) {
  await apiClient.post(`/api/church/goals/units/${unitId}/unlock${yq(year)}`);
}

// Lot G2 : la règle locale « 24 h » (ex-isProgressEditable) est SUPPRIMÉE — l'éditabilité est
// server-driven via `ProgressResponse.editable` / `editableUntil` (deadline de l'année).

/** Lot G2 : édition de la date limite d'envoi d'une année — SECRETARIAT/SUPER_ADMIN. */
export async function updateYearDeadline(year: number, submissionDeadline: string | null) {
  const { data } = await apiClient.patch<{ year: number; submissionDeadline: string | null }>(
    `/api/church/goals/years/${year}`,
    { submissionDeadline },
  );
  return data;
}

// --- Lot V1 — vue COORDINATEUR : cumuls par Région + somme totale Nation (borné à la Région) ---
export interface RegionSummaryLine {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  effectiveAmount: number | null;
  effectiveCount: number | null;
  achieved: number;
}
export interface RegionSummary {
  regionId: string;
  regionName: string;
  totalUnits: number;
  submittedUnits: number;
  submissionRate: number;
  lines: RegionSummaryLine[];
}
export interface NationRegionsSummary {
  nationId: string;
  nationName: string | null;
  regionLabel: 'REGION' | 'STATE' | null;
  regions: RegionSummary[];
  totals: RegionSummaryLine[];
}
export async function getRegionsSummary(nationId: string, year?: number) {
  const { data } = await apiClient.get<NationRegionsSummary>(
    `/api/church/goals/nations/${nationId}/regions-summary${yq(year)}`,
  );
  return data;
}
