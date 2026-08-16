import { apiClient } from './apiClient';

// Mirrors com.excellence.back.goals.* DTOs.
//
// Chantier « objectifs individuels » (JP 16/08) — RG-BQ-01 à RG-BQ-13 :
// seul un MEMBRE déclare, et il déclare POUR LUI-MÊME. Tout niveau au-dessus (assemblée, ville,
// région, nation, continent) n'est plus qu'une SOMME. Conséquences sur ce fichier :
//   · plus de `PledgeKind` ni d'engagement de foi (endpoints supprimés côté backend) ;
//   · plus d'`AggregationSource` : une ligne d'agrégat porte UNE valeur, il n'y a plus de MAX
//     à départager ni de `membersSum` / `aggregateOfChildren` concurrents ;
//   · plus d'engagement déclaré « au nom de l'assemblée » : le SEUL chemin d'écriture est
//     `/api/church/goals/member/**` ;
//   · le suivi de soumission change de maille — ce n'est plus un booléen d'assemblée mais un
//     compteur de PERSONNES (`submittedMembers` / `totalMembers`, + `lateMembers`).
// ⚠ La date limite CONTINUE de bloquer l'écriture (422 DEADLINE_PASSED) — RG-BQ-07 dans sa
// version définitive. L'éditabilité reste server-driven (`editable` / `editableUntil`).

export type PledgeUnitType = 'CURRENCY' | 'COUNT';

/**
 * Niveaux de l'arbre. `MEMBER` est le seul niveau d'ÉCRITURE (un engagement appartient à une
 * personne) ; les autres ne servent qu'aux LECTURES agrégées.
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
  /**
   * Deadline effective par année — `Record<number, string>` côté serveur, donc des clés
   * numériques SÉRIALISÉES en chaînes dans le JSON (d'où l'indexation par `String(year)`).
   * Clé absente = aucune deadline pour cette année.
   */
  yearDeadlines: Record<string, string> | null;
}

/** `?year=` si l'année est fournie (sinon le backend retombe sur l'année courante). */
const yq = (year?: number) => (year != null ? `?year=${year}` : '');

export interface PledgeResponse {
  id: string;
  goalId: string;
  categoryId: string;
  categoryCode: string;
  /** Toujours `MEMBER` : un engagement appartient à une personne (RG-BQ-01). */
  level: 'MEMBER';
  /** = `userId` du déclarant (RG-BQ-01). */
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
   * ⚠ SOURCE DE VÉRITÉ de l'écran : ne pas recalculer la règle côté front (le SECRETARIAT et le
   * LEADER passent outre la date limite, un calcul local les bloquerait à tort).
   */
  editable: boolean | null;
}

export interface SubmitResponse {
  goalId: string;
  /** Assemblée du déclarant (informatif) — null si non rattaché. */
  unitId: string | null;
  year: number;
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
  recordedById: string | null;
  /** Auteur de l'avancement (Lot G1.b). */
  recordedByName: string | null;
  createdAt: string;
  /** Lot G2 — server-driven : date limite d'écriture (deadline de l'année). */
  editableUntil: string | null;
  /** Lot G2 — server-driven : modifiable/supprimable par l'appelant courant (remplace la règle 24 h). */
  editable: boolean | null;
}

// --- Goal & référentiel --------------------------------------------------------

export async function getActiveGoal() {
  const { data } = await apiClient.get<ActiveGoal>('/api/church/goals/active');
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

// --- Agrégats (lecture seule — RG-BQ-02 : tout agrégat est une SOMME) ----------

/** Niveaux agrégeables, du bas vers le haut. */
export type AggregateLevelPath = 'units' | 'cities' | 'zones' | 'countries' | 'continents';
/** Nœuds portables par un dirigeant sous-coordinateur (ville / région). */
export type PerimeterLevelPath = 'cities' | 'zones';

/**
 * Une ligne d'agrégat = UNE valeur (RG-BQ-02) : la somme des engagements des membres du
 * sous-arbre. Plus de `source`, plus de `membersSum`, plus de `aggregateOfChildren`.
 * Mirrors com.excellence.back.goals.query.dto.AggregateLineResponse
 */
export interface AggregateLine {
  categoryId: string;
  categoryCode: string;
  /** `null` sur `/me/aggregate` (agrégat de périmètre, sans entité porteuse). */
  level: GoalLevel | null;
  entityId: string | null;
  /** Catégorie CURRENCY — Σ des engagements des membres du sous-arbre. */
  effectiveAmount: number | null;
  /** Catégorie COUNT — Σ des engagements des membres du sous-arbre. */
  effectiveCount: number | null;
}

export async function getAggregate(level: AggregateLevelPath, entityId: string, year?: number) {
  const { data } = await apiClient.get<AggregateLine[]>(
    `/api/church/goals/${level}/${entityId}/aggregate${yq(year)}`,
  );
  return data;
}

// --- Espace membre : MES objectifs (SEUL chemin d'écriture d'un engagement) ----

/** Engagements personnels du membre connecté (par catégorie, pour l'année). */
export async function fetchMyMemberPledges(year?: number) {
  const { data } = await apiClient.get<PledgeResponse[]>(
    `/api/church/goals/member/me/pledges${yq(year)}`,
  );
  return data;
}

/**
 * Crée / met à jour MON objectif personnel sur une catégorie — POST idempotent.
 * Erreurs 422 : NO_ASSEMBLY_ATTACHMENT, PLEDGE_LOCKED, DEADLINE_PASSED, YEAR_NOT_OPEN,
 * CATEGORY_GOAL_MISMATCH.
 * Mirrors com.excellence.back.goals.pledge.dto.CreatePledgeRequest
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
 * Soumission INDIVIDUELLE (RG-BQ-06) : chacun soumet SES engagements, qui se verrouillent.
 * Il n'y a plus de soumission d'assemblée. Erreurs 422 : NO_PLEDGE_TO_SUBMIT, ALREADY_SUBMITTED,
 * DEADLINE_PASSED, NO_ASSEMBLY_ATTACHMENT.
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

/**
 * Objectifs d'UNE personne — ouverts depuis la liste des membres ou le drill-down (RG-BQ-05).
 *
 * <p>Un seul volet depuis le chantier « objectifs individuels » : ses engagements personnels.
 * Le volet « engagement de l'assemblée qu'elle dirige » n'existe plus (un dirigeant déclare
 * comme tout le monde, dans SON assemblée — RG-BQ-11). Liste vide = « aucun engagement déclaré ».
 * Le backend borne la lecture au périmètre de l'appelant : un 403 signifie « hors périmètre ».
 * Mirrors com.excellence.back.goals.member.dto.MemberGoalsResponse
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
 * Une personne qui a DÉCLARÉ sur cette catégorie (construit à partir des ENGAGEMENTS).
 * Mirrors com.excellence.back.goals.query.dto.MemberObjectiveItem
 */
export interface MemberObjectiveItem {
  userId: string;
  fullName: string;
  amount: number | null;
  count: number | null;
  /** A soumis ses objectifs : seul le secrétariat peut les rouvrir. */
  locked: boolean;
  /** Non soumis alors que la date limite est passée. */
  late: boolean;
}

/**
 * Une PERSONNE de l'assemblée, qu'elle ait déclaré ou non.
 * Mirrors com.excellence.back.goals.query.dto.MemberStatusItem
 */
export interface MemberStatusItem {
  userId: string;
  fullName: string;
  hasPledges: boolean;
  submitted: boolean;
  late: boolean;
}

/** Mirrors com.excellence.back.goals.query.dto.MembersAggregateLine */
export interface MembersAggregateLine {
  categoryId: string;
  categoryCode: string;
  /** Σ des engagements des membres (CURRENCY). */
  effectiveAmount: number | null;
  /** Σ des engagements des membres (COUNT). */
  effectiveCount: number | null;
  /** ⚠ Construit à partir des ENGAGEMENTS : n'y figure que qui a déclaré. */
  members: MemberObjectiveItem[];
}

/**
 * Objectifs des membres d'une assemblée + compteurs de soumission à la maille PERSONNE.
 *
 * <p>⚠ `roster` et `lines[].members` ne sont PAS redondants : `roster` part des PERSONNES (il
 * contient donc les non-déclarants — ceux qu'un dirigeant doit relancer), `members` part des
 * ENGAGEMENTS. Le compteur « 7/12 » et la liste des retardataires se lisent sur `roster`.
 * Mirrors com.excellence.back.goals.query.dto.MembersAggregateResponse
 */
export interface MembersAggregateResponse {
  unitId: string;
  year: number;
  /** Comptes actifs rattachés (goalUnitId), hors superAdmin. */
  totalMembers: number;
  /** Ont au moins un engagement pour l'année. */
  membersWithPledges: number;
  /** Ont soumis (tous leurs engagements verrouillés). */
  submittedMembers: number;
  /** Non soumis alors que la date limite est passée (0 sinon). */
  lateMembers: number;
  /** UNE entrée par membre, y compris ceux qui n'ont RIEN déclaré. */
  roster: MemberStatusItem[];
  lines: MembersAggregateLine[];
}

/**
 * Objectifs des membres d'une assemblée (vue NOMINATIVE).
 *
 * <p>Réservé aux dirigeants dont le périmètre Goals couvre l'assemblée : un simple membre reçoit
 * 403 même sur la sienne (il a `/me/assembly`, anonyme).
 */
export async function fetchMembersAggregate(unitId: string, year?: number) {
  const { data } = await apiClient.get<MembersAggregateResponse>(
    `/api/church/goals/units/${unitId}/members-aggregate${yq(year)}`,
  );
  return data;
}

/** Mirrors com.excellence.back.goals.query.dto.MyAssemblyGoalLine */
export interface MyAssemblyGoalLine {
  categoryId: string;
  categoryCode: string;
  /** Σ des engagements des membres actifs. */
  effectiveAmount: number | null;
  effectiveCount: number | null;
  /** Σ des derniers états déclarés. */
  achievedAmount: number | null;
  achievedCount: number | null;
}

/**
 * Total de MON assemblée, ANONYME — l'exception de RG-BQ-05 pour le simple membre : il voit le
 * total de son assemblée, jamais le détail nominatif. Ce DTO ne porte aucun nom de personne.
 * Erreur 422 : USER_NO_GOAL_UNIT (appelant sans assemblée de rattachement).
 * Mirrors com.excellence.back.goals.query.dto.MyAssemblyGoalResponse
 */
export interface MyAssemblyGoalResponse {
  unitId: string;
  unitName: string | null;
  year: number;
  totalMembers: number;
  /** Le « 7 » de « 7/12 membres ont soumis ». */
  submittedMembers: number;
  lateMembers: number;
  lines: MyAssemblyGoalLine[];
}

export async function getMyAssemblyGoal(year?: number) {
  const { data } = await apiClient.get<MyAssemblyGoalResponse>(
    `/api/church/goals/me/assembly${yq(year)}`,
  );
  return data;
}

// --- Vues agrégées (Lot 4.3 — UC-DIR-13, UC-LDR-06, UC-SEC-01) ----------------

/** Avancement enrichi de sa catégorie — remplace N appels listProgress (UC-DIR-13). */
export interface MyProgressResponse extends ProgressResponse {
  categoryId: string;
  categoryCode: string;
}

/**
 * Statut d'une assemblée à la maille PERSONNE (RG-BQ-06).
 *
 * <p>Statut d'écran : `membersWithPledges === 0` → Non démarré · `submittedMembers < totalMembers`
 * → En cours · `totalMembers > 0 && submittedMembers === totalMembers` → Soumis ; badge
 * « en retard » si `lateMembers > 0`.
 * Mirrors com.excellence.back.goals.query.dto.ZoneUnitStatusResponse
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

export interface GlobalSummaryLine {
  categoryId: string;
  categoryCode: string;
  unitType: PledgeUnitType;
  effectiveAmount: number | null;
  effectiveCount: number | null;
  achieved: number;
}

/** Mirrors com.excellence.back.goals.query.dto.ContinentSummary */
export interface ContinentSummary {
  continentId: string;
  code: string | null;
  name: string;
  /** Nombre d'assemblées (maille inchangée). */
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  lines: GlobalSummaryLine[];
}

/** Mirrors com.excellence.back.goals.query.dto.GlobalSummaryResponse */
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
/**
 * 403 si `goalRole` n'est pas DIRIGEANT_UNITE / DIRIGEANT / DIRIGEANT_SENIOR.
 * `level` et `entityId` des lignes valent `null` (agrégat de périmètre).
 */
export async function getMyPerimeterAggregate(year?: number) {
  const { data } = await apiClient.get<AggregateLine[]>(`/api/church/goals/me/aggregate${yq(year)}`);
  return data;
}

export async function getMyUnits(year?: number) {
  const { data } = await apiClient.get<ZoneUnitStatus[]>(`/api/church/goals/me/units${yq(year)}`);
  return data;
}

// --- Lot 4.7 — drill-down dirigeant : détail (engagé + versé) d'une unité (lecture seule) ---
/**
 * Détail d'une assemblée par catégorie.
 *
 * <p>Sémantique revue par le chantier « objectifs individuels » : `targetAmount`/`targetCount`
 * ne sont plus une déclaration de dirigeant mais la SOMME DES MEMBRES, et `locked` signifie
 * « tous les engagements des membres de cette catégorie sont soumis » (`false` s'il n'y en a aucun).
 * Mirrors com.excellence.back.goals.query.dto.UnitPledgeDetailResponse
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
/** Mirrors com.excellence.back.goals.query.dto.NationStatus */
export interface Nation {
  countryId: string;
  /** Code ISO 3166-1 alpha-2 (pour la correspondance avec la carte). */
  code: string;
  name: string;
  continentId: string | null;
  continentCode: string | null;
  continentName: string | null;
  /** Nombre d'assemblées (maille inchangée). */
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  /** `submittedMembers / totalMembers` — maille PERSONNE, [0..1]. */
  submissionRate: number;
  /** Échéance passée ET au moins un membre non soumis. */
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

// --- Rappels Goals — la cible est une PERSONNE, plus une assemblée (RG-BQ-06) ---

/** Mirrors com.excellence.back.goals.reminder.dto.ReminderResponse */
export interface ReminderResponse {
  notificationId: string;
  sentToId: string;
  sentToName: string | null;
}

/**
 * Relance UNE PERSONNE qui n'a pas soumis ses objectifs.
 *
 * <p>Garde : même règle que le détail nominatif — si vous voyez ce que la personne a déclaré,
 * vous pouvez la relancer, sinon 403. Erreurs 422 : MEMBER_ALREADY_SUBMITTED,
 * REMINDER_ALREADY_SENT (anti-spam 24 h).
 * Mirrors com.excellence.back.goals.reminder.dto.SendReminderRequest (corps facultatif)
 */
export async function sendMemberReminder(memberId: string, message?: string) {
  const { data } = await apiClient.post<ReminderResponse>(
    `/api/church/goals/member/${memberId}/reminders`,
    message ? { message } : {},
  );
  return data;
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
/** Mirrors com.excellence.back.goals.query.dto.RegionSummary */
export interface RegionSummary {
  regionId: string;
  regionName: string;
  /** Nombre d'assemblées (maille inchangée). */
  totalUnits: number;
  totalMembers: number;
  submittedMembers: number;
  lateMembers: number;
  /** `submittedMembers / totalMembers` — maille PERSONNE, [0..1]. */
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
