import { apiClient } from './apiClient';

// Mirrors com.excellence.back.goals.* DTOs.
//
// Chantier « Objectifs individuels » (JP 16/08) — RG-BQ-01/02 : seul un MEMBRE déclare, et il
// déclare pour LUI-MÊME. Tout niveau au-dessus (assemblée, ville, région, nation, continent) n'est
// plus qu'une SOMME. Conséquences sur ce fichier : plus de `PledgeKind`, plus d'`AggregationSource`,
// plus d'engagement de foi, plus d'engagement déclaré au nom d'une assemblée. Le SEUL chemin
// d'écriture d'un engagement est `/api/church/goals/member/**`.

export type PledgeUnitType = 'CURRENCY' | 'COUNT';

/**
 * Niveaux de l'arbre. `MEMBER` est le seul niveau d'ÉCRITURE (RG-BQ-01) ; les autres valeurs ne
 * servent plus qu'aux lectures agrégées (`/cities/{id}/aggregate`, etc.).
 */
export type GoalLevel = 'MEMBER' | 'ASSEMBLY' | 'CITY' | 'REGION' | 'NATION' | 'CONTINENT';

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

// Mirrors com.excellence.back.goals.pledge.dto.PledgeResponse
export interface PledgeResponse {
  id: string;
  goalId: string;
  categoryId: string;
  categoryCode: string;
  /** Toujours `MEMBER` depuis le chantier du 16/08 — un engagement appartient à une personne. */
  level: 'MEMBER';
  /** Toujours l'`userId` du déclarant. */
  targetEntityId: string;
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
  /**
   * Lot G2 — server-driven : `!locked && (secretariat || !deadlinePassed)`.
   * ⚠ SOURCE DE VÉRITÉ de l'écran : ne jamais recalculer la fenêtre d'édition côté client
   * (le SECRETARIAT et le LEADER passent outre la date limite, un calcul local les bloquerait).
   */
  editable: boolean | null;
}

// Mirrors com.excellence.back.goals.pledge.dto.CreatePledgeRequest
export interface CreatePledgeRequest {
  categoryId: string;
  year?: number;
  targetAmount?: number;
  targetCount?: number;
}

// Mirrors com.excellence.back.goals.pledge.dto.SubmitResponse
export interface SubmitResponse {
  goalId: string;
  /** Assemblée du déclarant (informatif). */
  unitId: string | null;
  year: number;
  lockedPledges: number;
  submittedAt: string;
}

// Mirrors com.excellence.back.goals.progress.dto.ProgressResponse
export interface ProgressResponse {
  id: string;
  pledgeId: string;
  amount: number | null;
  count: number | null;
  progressDate: string;
  note: string | null;
  recordedById: string | null;
  /** Auteur de l'avancement (Lot G1.b). */
  recordedByName: string | null;
  createdAt: string;
  /** Lot G2 — server-driven : date limite d'écriture (deadline de l'année). */
  editableUntil: string | null;
  /** Lot G2 — server-driven : `secretariat || (auteur && !deadlinePassed)`. */
  editable: boolean | null;
}

// Mirrors com.excellence.back.goals.progress.dto.AddProgressRequest
export interface AddProgressRequest {
  amount?: number;
  count?: number;
  progressDate?: string;
  note?: string;
}

// Mirrors com.excellence.back.goals.progress.dto.UpdateProgressRequest
export interface UpdateProgressRequest {
  amount?: number;
  count?: number;
  note?: string;
}


// --- Goal actif ---------------------------------------------------------------

export async function getActiveGoal(): Promise<ActiveGoal> {
  const { data } = await apiClient.get<ActiveGoal>('/api/church/goals/active');
  return data;
}

// --- Progress (UC-DIR-12/13/14) ----------------------------------------------
// Un avancement ne se pose que sur SES propres engagements (403 sinon) ; le secrétariat passe outre.

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

// --- Agrégats de niveau (lecture seule) --------------------------------------

/** Chemin d'URL des niveaux agrégeables. */
export type AggregateLevelPath = 'cities' | 'zones' | 'countries' | 'continents';

/**
 * Mirrors com.excellence.back.goals.query.dto.AggregateLineResponse
 *
 * <p>RG-BQ-02 — UNE valeur par ligne : la somme des engagements des membres du sous-arbre.
 * Plus de `source`, plus de `membersSum`, plus d'`aggregateOfChildren`, plus de `faithPledges`.
 */
export interface AggregateLine {
  categoryId: string;
  categoryCode: string;
  /** `null` sur `/me/aggregate` (agrégat de périmètre, sans niveau porteur). */
  level: GoalLevel | null;
  entityId: string | null;
  effectiveAmount: number | null;
  effectiveCount: number | null;
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

/**
 * Agrégat de MON sous-arbre, sans nœud géographique porteur — `level`/`entityId` reviennent `null`.
 *
 * <p>Chantier « objectifs individuels » (JP 16/08) : c'est le seul agrégat d'un DIRIGEANT_UNITE,
 * qui ne porte ni ville, ni région, ni nation. Le backend borne l'accès aux dirigeants
 * SOUS-COORDINATEURS (`GoalQueryServiceImpl.requireSubCoordinatorLeader` : DIRIGEANT_UNITE,
 * DIRIGEANT, DIRIGEANT_SENIOR, superAdmin exclu) — au-delà, 403.
 */
export async function getMyPerimeterAggregate(year?: number): Promise<AggregateLine[]> {
  const { data } = await apiClient.get<AggregateLine[]>(
    `/api/church/goals/me/aggregate${yq(year)}`,
  );
  return data;
}

// --- Objectifs d'UNE personne ------------------------------------------------

/**
 * Mirrors com.excellence.back.goals.member.dto.MemberGoalsResponse
 *
 * <p>Un seul volet depuis le 16/08 : ses engagements personnels. Le volet « engagement de
 * l'assemblée qu'elle dirige » n'existe plus (un dirigeant déclare comme tout le monde).
 * Le backend borne la lecture au périmètre de l'appelant — un 403 signifie « pas dans votre
 * périmètre », pas « pas d'engagement ». Liste vide = « aucun engagement déclaré ».
 */
export interface MemberGoalsResponse {
  memberId: string;
  fullName: string;
  year: number;
  memberPledges: PledgeResponse[];
}

export async function fetchMemberGoals(memberId: string, year?: number): Promise<MemberGoalsResponse> {
  const { data } = await apiClient.get<MemberGoalsResponse>(
    `/api/church/goals/member/${memberId}/goals${yq(year)}`,
  );
  return data;
}

/**
 * Mirrors com.excellence.back.goals.query.dto.MembersAggregateResponse$MemberStatusItem
 * Une entrée par PERSONNE rattachée — y compris celles qui n'ont RIEN déclaré.
 */
export interface MemberStatusItem {
  userId: string;
  fullName: string;
  hasPledges: boolean;
  submitted: boolean;
  /** Non soumis alors que la date limite est passée. */
  late: boolean;
}

/**
 * Mirrors com.excellence.back.goals.query.dto.MembersAggregateResponse$MemberObjectiveItem
 * Construit à partir des ENGAGEMENTS : n'y figure que qui a déclaré.
 */
export interface MemberObjectiveItem {
  userId: string;
  fullName: string;
  amount: number | null;
  count: number | null;
  locked: boolean;
  late: boolean;
}

export interface MembersAggregateLine {
  categoryId: string;
  categoryCode: string;
  /** Σ des engagements des membres de l'assemblée (RG-BQ-02). */
  effectiveAmount: number | null;
  effectiveCount: number | null;
  members: MemberObjectiveItem[];
}

/**
 * Mirrors com.excellence.back.goals.query.dto.MembersAggregateResponse
 *
 * <p>⚠ `roster` et `lines[].members` ne sont PAS redondants : `roster` part des PERSONNES (il
 * contient donc les non-déclarants, ceux qu'un dirigeant doit relancer) tandis que `members` part
 * des ENGAGEMENTS. Le compteur « 7/12 » et la liste des retardataires se lisent sur `roster`.
 */
export interface MembersAggregateResponse {
  unitId: string;
  year: number;
  totalMembers: number;
  membersWithPledges: number;
  submittedMembers: number;
  lateMembers: number;
  roster: MemberStatusItem[];
  lines: MembersAggregateLine[];
}

/** Mes engagements personnels de MEMBRE — seul chemin de LECTURE de mes engagements. */
export async function fetchMyMemberPledges(year?: number): Promise<PledgeResponse[]> {
  const { data } = await apiClient.get<PledgeResponse[]>(
    `/api/church/goals/member/me/pledges${yq(year)}`,
  );
  return data;
}

/**
 * Crée / remplace MON engagement personnel sur une catégorie — seul chemin d'ÉCRITURE (RG-BQ-01).
 * Erreurs 422 : NO_ASSEMBLY_ATTACHMENT, PLEDGE_LOCKED, DEADLINE_PASSED, YEAR_NOT_OPEN,
 * CATEGORY_GOAL_MISMATCH.
 */
export async function saveMemberPledge(payload: CreatePledgeRequest): Promise<PledgeResponse> {
  const { data } = await apiClient.post<PledgeResponse>(
    '/api/church/goals/member/me/pledges',
    payload,
  );
  return data;
}

/**
 * RG-BQ-06 — chaque personne soumet SES engagements ; la soumission verrouille. Pour les corriger
 * ensuite, il faut passer par le secrétariat (`unlockMember`).
 * Erreurs 422 : NO_PLEDGE_TO_SUBMIT, ALREADY_SUBMITTED, DEADLINE_PASSED, NO_ASSEMBLY_ATTACHMENT.
 */
export async function submitMyMemberPledges(year?: number): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>(
    `/api/church/goals/member/me/submit${yq(year)}`,
  );
  return data;
}

/**
 * Détail NOMINATIF d'une assemblée — réservé aux dirigeants dont le périmètre Goals la couvre.
 * ⚠ Un simple membre reçoit 403, même sur sa propre assemblée : lui, c'est `getMyAssemblyGoal`.
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

/** Mirrors com.excellence.back.goals.reminder.dto.SendReminderRequest (corps FACULTATIF). */
export interface SendReminderRequest {
  /** max 2000 ; absent → message serveur par défaut (avec la date limite). */
  message?: string;
}

/** Mirrors com.excellence.back.goals.reminder.dto.ReminderResponse */
export interface ReminderResponse {
  notificationId: string;
  sentToId: string;
  sentToName: string;
}

/**
 * Relance une PERSONNE qui n'a pas soumis (la cible n'est plus une assemblée depuis le 16/08).
 * Même garde que le détail nominatif : si vous voyez ce qu'elle a déclaré, vous pouvez la relancer.
 * Erreurs 422 : MEMBER_ALREADY_SUBMITTED, REMINDER_ALREADY_SENT (anti-spam 24 h).
 */
export async function sendMemberReminder(
  memberId: string,
  payload?: SendReminderRequest,
): Promise<ReminderResponse> {
  const { data } = await apiClient.post<ReminderResponse>(
    `/api/church/goals/member/${memberId}/reminders`,
    payload ?? {},
  );
  return data;
}

/**
 * Déverrouille les engagements d'une personne pour l'année (SECRETARIAT / superAdmin) — l'unique
 * recours back-office de RG-BQ-08 : on rouvre, la personne corrige elle-même.
 */
export async function unlockMember(memberId: string, year?: number): Promise<void> {
  await apiClient.post(`/api/church/goals/member/${memberId}/unlock${yq(year)}`);
}

/**
 * Palier A1 (JP 14/08) — engagement de MON assemblée, en lecture seule.
 * Mirrors com.excellence.back.goals.query.dto.MyAssemblyGoalResponse
 *
 * ⚠ Volontairement SANS donnée nominative : c'est ce qui distingue cet endpoint de
 * `fetchMembersAggregate`, réservé aux dirigeants. Un simple membre voit le total engagé de son
 * assemblée et le compteur de soumission (« 7/12 »), pas qui a déclaré quoi.
 */
export interface MyAssemblyGoalLine {
  categoryId: string;
  categoryCode: string;
  /** Σ des engagements des membres actifs (RG-BQ-02). */
  effectiveAmount: number | null;
  effectiveCount: number | null;
  /** Réalisé (versé / atteint) — Σ des derniers états déclarés. */
  achievedAmount: number | null;
  achievedCount: number | null;
}

export interface MyAssemblyGoalResponse {
  unitId: string;
  unitName: string | null;
  year: number;
  totalMembers: number;
  /** Compteur « 7/12 » — la seule information de soumission visible d'un simple membre. */
  submittedMembers: number;
  lateMembers: number;
  lines: MyAssemblyGoalLine[];
}

/** Erreur 422 : USER_NO_GOAL_UNIT (compte sans assemblée de rattachement). */
export async function getMyAssemblyGoal(year?: number): Promise<MyAssemblyGoalResponse> {
  const { data } = await apiClient.get<MyAssemblyGoalResponse>(
    `/api/church/goals/me/assembly${yq(year)}`,
  );
  return data;
}

// --- Vues agrégées (Lot 4.3 — UC-DIR-13, UC-LDR-06) --------------------------

/** Avancement enrichi de sa catégorie — remplace N appels listProgress (UC-DIR-13). */
export interface MyProgressResponse extends ProgressResponse {
  categoryId: string;
  categoryCode: string;
}

/**
 * Mirrors com.excellence.back.goals.query.dto.ZoneUnitStatusResponse
 *
 * <p>RG-BQ-06 — maille PERSONNE : une assemblée ne « soumet » plus, ce sont ses membres qui
 * soumettent. Statut d'écran : `membersWithPledges === 0` → non démarré ;
 * `submittedMembers < totalMembers` → en cours ; tous soumis → soumis ; `lateMembers > 0` → retard.
 */
export interface ZoneUnitStatus {
  unitId: string;
  unitName: string;
  unitType: string | null;
  localityName: string | null;
  /** Comptes actifs rattachés (goalUnitId), hors superAdmin. */
  totalMembers: number;
  /** Ont au moins un engagement pour l'année. */
  membersWithPledges: number;
  /** Ont soumis (tous leurs engagements verrouillés). */
  submittedMembers: number;
  /** Non soumis alors que la date limite est passée (0 sinon). */
  lateMembers: number;
  /** L'unité a un DIRIGEANT goal rattaché. */
  hasLeader: boolean;
  /** Nom du DIRIGEANT goal de l'unité — null si sans dirigeant (Lot G1.b). */
  leaderName: string | null;
}

/** Avancements de MES objectifs personnels (seul chemin depuis le 16/08). */
export async function getMyMemberProgress(year?: number): Promise<MyProgressResponse[]> {
  const { data } = await apiClient.get<MyProgressResponse[]>(
    `/api/church/goals/member/me/progress${yq(year)}`,
  );
  return data;
}

// `getZoneUnits` (GET /goals/zones/{id}/units) a été SUPPRIMÉ le 16/08 : plus aucun appelant depuis
// que la liste d'assemblées vient du SOUS-ARBRE (`getMyUnits`) et non de la zone géographique.
// L'endpoint existe toujours côté backend — le rétablir ici si un écran « assemblées d'une région
// que je ne dirige pas » réapparaît.

/** Lot 3.5 — assemblées du SOUS-ARBRE du dirigeant (indépendant du niveau de ses nœuds de périmètre). */
export async function getMyUnits(year?: number): Promise<ZoneUnitStatus[]> {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(`/api/church/goals/me/units${yq(year)}`);
  return data;
}

// --- Lot 4.7 — drill-down dirigeant : détail (engagé + versé) d'une unité (lecture seule) ---
/**
 * Mirrors com.excellence.back.goals.query.dto.UnitPledgeDetailResponse
 *
 * <p>Sémantique révisée le 16/08 : `targetAmount`/`targetCount` ne sont plus la déclaration d'un
 * dirigeant mais la SOMME des engagements des membres ; `locked` signifie « tous les engagements
 * des membres pour cette catégorie sont soumis » (false s'il n'y en a aucun).
 */
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

/** Mirrors com.excellence.back.goals.query.dto.GlobalSummaryResponse$ContinentSummary */
export interface ContinentSummary {
  continentId: string;
  code: string | null;
  name: string;
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  lines: GlobalSummaryLine[];
}

/**
 * Mirrors com.excellence.back.goals.query.dto.GlobalSummaryResponse
 * RG-BQ-06 — `submittedUnits` a disparu : la soumission se compte en PERSONNES.
 */
export interface GlobalSummary {
  goalId: string;
  goalName: string;
  /** Nombre d'assemblées (maille inchangée). */
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  totals: GlobalSummaryLine[];
  continents: ContinentSummary[];
}
export async function getGlobalSummary(year?: number): Promise<GlobalSummary> {
  const { data } = await apiClient.get<GlobalSummary>(`/api/church/goals/global/summary${yq(year)}`);
  return data;
}

/** Mirrors com.excellence.back.goals.query.dto.NationsStatusResponse$NationStatus */
export interface NationStatus {
  countryId: string;
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  continentId: string | null;
  continentCode: string | null;
  continentName: string | null;
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  /** [0..1], maille PERSONNE. */
  submissionRate: number;
  /** Échéance passée ET au moins un membre non soumis. */
  late: boolean;
}
export async function getNations(year?: number): Promise<{ deadlinePast: boolean; nations: NationStatus[] }> {
  const { data } = await apiClient.get<{ deadlinePast: boolean; nations: NationStatus[] }>(
    `/api/church/goals/global/nations${yq(year)}`,
  );
  return data;
}

// --- Lot V1 — vue COORDINATEUR : cumuls par Région + somme totale Nation ---
/** Mirrors com.excellence.back.goals.query.dto.NationRegionsSummaryResponse$RegionSummary */
export interface RegionSummary {
  regionId: string;
  regionName: string;
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  /** [0..1], maille PERSONNE. */
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
