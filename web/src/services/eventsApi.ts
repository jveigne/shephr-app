import { apiClient } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Évènements & recensement des actions d'évangélisation (plan du 14/10, lot E8 — §6.2).
//  D-EVT-05 (JP 14/10) : tout le contrôleur est sous @RequiresModule("EVENTS") — sans abonnement,
//  403 MODULE_ACCESS_DENIED ; le front n'appelle jamais ces routes dans ce cas (RG-06).
//  D-EVT-01 : un seul objet `Event` ; une « action d'évangélisation » est un évènement d'un type
//  `evangelism = true`. Les droits (`canEdit`, `canFlag`, `canPlan`) sont calculés par le serveur
//  à chaque appel : jamais recalculés ici (un 403 reste possible et s'affiche proprement).
//  Contrat de référence : cmfipraise-backend/docs/shephr/14_10_2026/02_Contrat_API_Evenements.md.
//  Dates : LocalDate « yyyy-MM-dd », mois « yyyy-MM », Instant ISO-8601 UTC.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/church/events';

/** Mirrors com.excellence.back.org.tree.OrgLevel — Nation · Région/État · Ville · Assemblée (Chantier B). */
export type OrgLevel = 'COUNTRY' | 'ZONE' | 'LOCALITY' | 'UNIT';

/** Mirrors com.excellence.back.events.EventStatus — D-EVT-02 : « exécutée » = DONE. */
export type EventStatus = 'PLANNED' | 'DONE' | 'CANCELLED';

/** Mirrors com.excellence.back.events.EventDtos.StatsLevel — MINISTRY = racine virtuelle « tout mon ministère ». */
export type StatsLevel = 'MINISTRY' | OrgLevel;

/**
 * Mirrors com.excellence.back.events.EventDtos.EventTypeDto — type ACTIF du catalogue du ministère
 * (RG-EVT-01). `name` / `nameEn` sont des données (pas des clés i18n) ; `nameEn` null → `name`.
 */
export interface EventType {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  /** D-EVT-03 : compté dans les statistiques d'évangélisation. */
  evangelism: boolean;
  /** Type « Autre » : `customLabel` obligatoire. */
  requiresLabel: boolean;
  orderIndex: number;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.ScopeNode — nœud où l'on peut déclarer (RG-EVT-02).
 * `parentId` = parent direct S'IL figure dans la liste, sinon null (racine du sélecteur).
 */
export interface ScopeNode {
  level: OrgLevel;
  id: string;
  name: string;
  parentId: string | null;
  /** RG-EVT-03 : on peut aussi y programmer — toujours vrai depuis D-EVT-13 (JP 14/10 : programmer = déclarer). */
  canPlan: boolean;
}

/** Mirrors com.excellence.back.events.EventDtos.EventScopesResponse */
export interface EventScopes {
  /** RG-ACT-01 : au moins un nœud de déclaration ; false → « Déclarer » masqué. */
  canDeclare: boolean;
  /** RG-EVT-03 : au moins un nœud de programmation ; false → « Programmer » masqué. D-EVT-13 : = canDeclare. */
  canPlan: boolean;
  /** RG-EVT-02 : nœud par défaut d'une déclaration ; null → choix obligatoire (LEADER / SECRETARIAT / superAdmin sans assemblée). */
  defaultScope: ScopeNode | null;
  /** Triés par niveau (nation d'abord) puis nom ; tout le ministère pour LEADER / SECRETARIAT. */
  scopes: ScopeNode[];
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventCreateRequest — RG-ACT-03 : seuls `typeId` et
 * `eventDate` sont requis côté métier ; `clientId` (RG-EVT-07, idempotence) et `status` sont posés
 * par le client. `scopeLevel` + `scopeId` vont ensemble ; absents → nœud par défaut (RG-EVT-02).
 */
export interface EventCreateRequest {
  clientId: string;
  typeId: string;
  eventDate: string;
  status: 'DONE' | 'PLANNED';
  customLabel?: string | null;
  endDate?: string | null;
  scopeLevel?: OrgLevel | null;
  scopeId?: string | null;
  title?: string | null;
  place?: string | null;
  /**
   * D-EVT-16 (JP 14/10) : nom du prédicateur, texte libre ≤ 120 (`EventDtos.PREACHER_MAX`) ; trim,
   * vide → null ; type évangélique seulement — ignoré (enregistré null) sinon.
   */
  preacher?: string | null;
  participants?: number | null;
  /**
   * D-EVT-17 (JP 14/10) : invités = part EXTÉRIEURE des participants (inclus dans `participants`),
   * tout type ; ≤ `participants` quand les deux sont renseignés, sinon 422 EVENT_GUESTS_EXCEED_PARTICIPANTS.
   */
  guests?: number | null;
  /** D-EVT-15 (JP 14/10) : type évangélique seulement — ignorés (enregistrés null) sinon. */
  conversions?: number | null;
  restorations?: number | null;
  baptisms?: number | null;
  note?: string | null;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventUpdateRequest — REMPLACEMENT COMPLET des champs
 * descriptifs (un champ absent est effacé) ; `scopeLevel` + `scopeId` absents = nœud inchangé.
 */
export interface EventUpdateRequest {
  typeId: string;
  eventDate: string;
  customLabel: string | null;
  endDate: string | null;
  scopeLevel?: OrgLevel | null;
  scopeId?: string | null;
  title: string | null;
  place: string | null;
  /** D-EVT-16 (JP 14/10) : suit le `typeId` ENVOYÉ — remis à null vers un type non évangélique. */
  preacher: string | null;
  participants: number | null;
  /** D-EVT-17 (JP 14/10) : tout type ; contrôlé contre `participants` envoyé (422 EVENT_GUESTS_EXCEED_PARTICIPANTS). */
  guests: number | null;
  /** D-EVT-15 : suivent le `typeId` ENVOYÉ — remis à null par le serveur vers un type non évangélique. */
  conversions: number | null;
  restorations: number | null;
  baptisms: number | null;
  note: string | null;
}

/** Mirrors com.excellence.back.events.EventDtos.EventDoneRequest — un champ absent GARDE sa valeur ; note "" l'efface. */
export interface EventDoneRequest {
  /** D-EVT-16 (JP 14/10) : saisissable après coup ; "" l'efface ; ignoré pour un type non évangélique. */
  preacher?: string;
  participants?: number;
  /**
   * D-EVT-17 (JP 14/10) : tout type ; contrôlé sur l'état RÉSULTANT (valeur envoyée, sinon celle
   * stockée) — 422 EVENT_GUESTS_EXCEED_PARTICIPANTS si invités > participants.
   */
  guests?: number;
  /** D-EVT-15 : ignorés pour un type non évangélique. */
  conversions?: number;
  restorations?: number;
  baptisms?: number;
  note?: string;
}

/** Mirrors com.excellence.back.events.EventDtos.EventResponse */
export interface EventResponse {
  id: string;
  clientId: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  typeNameEn: string | null;
  evangelism: boolean;
  /** Libellé libre (type « Autre ») — affiché à la place du nom du type. */
  customLabel: string | null;
  title: string | null;
  status: EventStatus;
  eventDate: string;
  endDate: string | null;
  scopeLevel: OrgLevel;
  scopeId: string;
  scopeName: string | null;
  place: string | null;
  /** D-EVT-16 (JP 14/10) : nom du prédicateur — toujours null pour un type non évangélique. */
  preacher: string | null;
  participants: number | null;
  /** D-EVT-17 (JP 14/10) : invités, inclus dans `participants` ; tout type. */
  guests: number | null;
  /** D-EVT-15 (JP 14/10) : toujours null pour un type non évangélique. */
  conversions: number | null;
  restorations: number | null;
  baptisms: number | null;
  note: string | null;
  /** RG-ACT-07 : informatif, ne retire jamais du total. */
  toVerify: boolean;
  toVerifyById: string | null;
  /** D-EVT-03 : DONE + type évangélique (« à vérifier » n'y change rien). */
  counted: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string | null;
  doneAt: string | null;
  /** RG-ACT-06 / RG-EVT-04 : modifier, supprimer, marquer réalisé, annuler (selon statut). */
  canEdit: boolean;
  /** Poser / retirer « à vérifier » (dirigeants du périmètre et SECRETARIAT). */
  canFlag: boolean;
}

/** Page Spring Data — seuls les champs utiles (contrat §5). */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  /** Page courante, base 0. */
  number: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

/** Mirrors com.excellence.back.events.EventDtos.MyEventsResponse — « Mes actions » (spec §6.1). */
export interface MyEventsResponse {
  /** Mois effectivement compté, « yyyy-MM ». */
  month: string;
  /** Mes évènements COMPTÉS (D-EVT-03) du mois / de son année. */
  monthCount: number;
  yearCount: number;
  /** Tous statuts et types, eventDate ↓ puis createdAt ↓ (récent en haut). */
  events: Page<EventResponse>;
}

/** Mirrors com.excellence.back.events.EventDtos.StatsScope — `id` = ministère quand `level` = MINISTRY. */
export interface StatsScope {
  level: StatsLevel;
  id: string;
  name: string | null;
}

/** Mirrors com.excellence.back.events.EventDtos.StatsTotals — sommes des évènements comptés, vides = 0 (D-EVT-15). */
export interface StatsTotals {
  count: number;
  participants: number;
  /** D-EVT-17 (JP 14/10) : somme des invités, comme `participants`. */
  guests: number;
  conversions: number;
  restorations: number;
  baptisms: number;
}

/** Mirrors com.excellence.back.events.EventDtos.TypeStats */
export interface TypeStats extends StatsTotals {
  typeId: string;
  code: string;
  name: string;
  nameEn: string | null;
}

/** Mirrors com.excellence.back.events.EventDtos.MonthStats — `month` « yyyy-MM ». */
export interface MonthStats extends StatsTotals {
  month: string;
}

/** Mirrors com.excellence.back.events.EventDtos.ChildStats — sous-niveau visible, sous-arbre inclus. */
export interface ChildStats extends StatsTotals {
  level: OrgLevel;
  id: string;
  name: string | null;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventStatsResponse (§5.3). Totaux, types, mois et
 * enfants ne portent que sur les évènements COMPTÉS de [from, to] (D-EVT-03). D-EVT-04 :
 * `total.count = ownLevelCount + Σ children[].count`. `plannedUpcoming` / `toCloseCount` : agenda du
 * sous-arbre, tous types, indépendamment de la période. D-EVT-06 : aucune cible, aucun objectif.
 */
export interface EventStats {
  scope: StatsScope;
  from: string;
  to: string;
  total: StatsTotals;
  byType: TypeStats[];
  /** Un élément par mois de la période, mois vides à 0. */
  byMonth: MonthStats[];
  /**
   * Triés par nom, à 0 compris ; [] pour une assemblée. D-OFF-12 (JP 27/10, plan 05 §3.5) : null sur
   * une VILLE sans `EVENEMENTS_SUIVI` (offre Néhémie) — le total reste gratuit, la ventilation par
   * assemblée non (`childrenLocked`).
   */
  children: ChildStats[] | null;
  /**
   * D-OFF-12 (JP 27/10) : vrai quand le serveur retient la descente sous la ville faute de
   * `EVENEMENTS_SUIVI` — le front affiche le verrou Néhémie à la place des enfants. Facultatif : un
   * serveur antérieur au lot ne l'envoie pas.
   */
  childrenLocked?: boolean;
  ownLevelCount: number;
  plannedUpcoming: number;
  toCloseCount: number;
}

/** Filtres de `GET /api/church/events` (contrat §3.5). Nœud absent = tout mon périmètre de lecture. */
export interface EventListParams {
  scopeLevel?: OrgLevel;
  scopeId?: string;
  from?: string;
  to?: string;
  status?: EventStatus;
  evangelism?: boolean;
  includeAncestors?: boolean;
  order?: 'ASC' | 'DESC';
  page?: number;
  size?: number;
}

/** Types actifs du ministère, triés `orderIndex` puis nom. `[]` = aucune déclaration possible. */
export async function listEventTypes(): Promise<EventType[]> {
  const { data } = await apiClient.get<EventType[]>(`${BASE}/types`);
  return data;
}

export async function getMyEventScopes(): Promise<EventScopes> {
  const { data } = await apiClient.get<EventScopes>(`${BASE}/me/scopes`);
  return data;
}

/** RG-EVT-07 : idempotent sur `clientId` — 201 à la création, 200 (même corps) au rejeu. */
export async function createEvent(body: EventCreateRequest): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(BASE, body);
  return data;
}

/** « Mes actions » — `month` = mois LOCAL (contrat §1.4), sinon le serveur prend le mois UTC. */
export async function getMyEvents(params: { month: string; page?: number; size?: number }): Promise<MyEventsResponse> {
  const { data } = await apiClient.get<MyEventsResponse>(`${BASE}/me`, { params });
  return data;
}

export async function listEvents(params: EventListParams): Promise<Page<EventResponse>> {
  const { data } = await apiClient.get<Page<EventResponse>>(BASE, { params });
  return data;
}

/**
 * `from` / `to` REQUIS ; nœud absent = mon périmètre le plus large (nation, ou ministère).
 * D-OFF-12 (JP 27/10) : gratuit jusqu'à la ville (toutes les villes comptées) et sur sa propre
 * assemblée ; l'intérieur d'une ville (descente, assemblée d'autrui) exige `EVENEMENTS_SUIVI` —
 * 403 `MODULE_ACCESS_DENIED` enrichi (`cityEventsAccessDenied`) sur une `UNIT` sans droit.
 */
export async function getEventStats(params: {
  from: string;
  to: string;
  scopeLevel?: OrgLevel;
  scopeId?: string;
}): Promise<EventStats> {
  const { data } = await apiClient.get<EventStats>(`${BASE}/stats`, { params });
  return data;
}

export async function getEvent(id: string): Promise<EventResponse> {
  const { data } = await apiClient.get<EventResponse>(`${BASE}/${id}`);
  return data;
}

export async function updateEvent(id: string, body: EventUpdateRequest): Promise<EventResponse> {
  const { data } = await apiClient.patch<EventResponse>(`${BASE}/${id}`, body);
  return data;
}

/** RG-EVT-06 : PLANNED → DONE ; 422 EVENT_NOT_YET_HELD si la date est encore à venir. */
export async function markEventDone(id: string, body: EventDoneRequest): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(`${BASE}/${id}/done`, body);
  return data;
}

/** RG-EVT-06 : PLANNED → CANCELLED (un DONE ne s'annule pas : il se supprime). */
export async function cancelEvent(id: string): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(`${BASE}/${id}/cancel`);
  return data;
}

/** RG-ACT-07 : marqueur informatif, ne change ni le statut ni le comptage. */
export async function setEventToVerify(id: string, toVerify: boolean): Promise<EventResponse> {
  const { data } = await apiClient.put<EventResponse>(`${BASE}/${id}/to-verify`, { toVerify });
  return data;
}

/** Soft delete (204) : l'évènement disparaît des listes, du détail et des statistiques. */
export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

// ---------------------------------------------------------------------------------------------
//  Évènements de la CHAÎNE (lot HIE, D-HIE-09, JP 28/10) — offre Caleb (`HIERARCHIE_SUIVI`, droit
//  personnel). Comptage D-EVT-03 (DONE, non supprimés, type évangélique) sur les assemblées de
//  `scopeOf(appelant)` (supervisor_id récursif, jamais la géographie) ; un évènement de ville / région
//  / nation n'est jamais compté (D-EVT-04). Sans droit : 403 `MODULE_ACCESS_DENIED` `details {
//  moduleCode: 'HIERARCHIE_SUIVI', nodeId: null, canSubscribe }` (`hierarchyAccessDenied`) → verrou.
//  `GET /stats` (géographie, D-OFF-12) n'est pas touché.
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.events.EventDtos.EventHierarchyUnitStats — une ligne par assemblée, même à 0. */
export interface EventHierarchyUnitStats extends StatsTotals {
  unitId: string;
  unitName: string;
  cityName: string | null;
  /** Dirigeant propriétaire de l'assemblée dans l'arbre de la hiérarchie. */
  leaderId: string | null;
  leaderName: string | null;
  /** Dirigeants entre l'appelant et l'assemblée (du plus haut au plus bas). */
  supervisorChain: string[];
  /** Dernier évènement COMPTÉ de la période (« yyyy-MM-dd »), null sinon. */
  lastEventDate: string | null;
}

/** Mirrors com.excellence.back.events.EventDtos.EventHierarchyLeaderStats — somme par dirigeant (RG-HIE-39). */
export interface EventHierarchyLeaderStats extends StatsTotals {
  leaderId: string | null;
  leaderName: string | null;
  unitCount: number;
}

/** Mirrors com.excellence.back.events.EventDtos.EventHierarchyStats */
export interface EventHierarchyStats {
  /** `CHAIN` (compte membre qui détiendrait le droit) : listes vides, aucune erreur — écart B6 du plan. */
  mode: 'SUBTREE' | 'MINISTRY' | 'CHAIN';
  from: string;
  to: string;
  /** Somme des assemblées. */
  total: StatsTotals;
  byType: TypeStats[];
  byMonth: MonthStats[];
  /** Ordre de `scopeOf.unitIds`. */
  units: EventHierarchyUnitStats[];
  /** Tri : nombre décroissant puis nom. */
  byLeader: EventHierarchyLeaderStats[];
}

/**
 * `from` / `to` REQUIS (400 INVALID_PERIOD) ; `unitIds` facultatif, intersecté avec la chaîne (ids
 * hors chaîne ignorés sans erreur, RG-HIE-37), envoyé répété (`unitIds=a&unitIds=b`).
 */
export async function getEventHierarchyStats(from: string, to: string, unitIds?: string[]): Promise<EventHierarchyStats> {
  const params = new URLSearchParams({ from, to });
  for (const id of unitIds ?? []) params.append('unitIds', id);
  const { data } = await apiClient.get<EventHierarchyStats>(`${BASE}/hierarchy/stats`, { params });
  return {
    ...data,
    byType: data?.byType ?? [],
    byMonth: data?.byMonth ?? [],
    units: data?.units ?? [],
    byLeader: data?.byLeader ?? [],
  };
}
