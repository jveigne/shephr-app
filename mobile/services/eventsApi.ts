import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '@/services/apiClient';

// Évènements & recensement des actions d'évangélisation (plan 14/10, §5.2 — lot E6). Tous les
// endpoints sont sous /api/church/events et gatés @RequiresModule("EVENTS") (D-EVT-05) : sans
// abonnement, 403 MODULE_ACCESS_DENIED — la tuile est de toute façon masquée (RG-06).
// Contrat de référence : cmfipraise-backend/docs/shephr/14_10_2026/02_Contrat_API_Evenements.md.
// Dates LocalDate = 'yyyy-MM-dd' ; Instant = ISO ; mois = 'yyyy-MM'.

/** Mirrors com.excellence.back.org.tree.OrgLevel — Nation · Région/État · Ville · Assemblée (Chantier B). */
export type OrgLevel = 'COUNTRY' | 'ZONE' | 'LOCALITY' | 'UNIT';

/** Mirrors com.excellence.back.events.EventStatus — D-EVT-02 : « exécutée » = DONE. */
export type EventStatus = 'PLANNED' | 'DONE' | 'CANCELLED';

/**
 * Mirrors com.excellence.back.events.EventDtos.EventTypeDto — type ACTIF du catalogue du
 * ministère (RG-EVT-01). `name` / `nameEn` sont des DONNÉES (pas des clés i18n) ; `nameEn` null →
 * afficher `name`.
 */
export interface EventTypeDto {
  id: string;
  /** Clé technique majuscules : "CAMPAIGN", "OTHER"… */
  code: string;
  name: string;
  nameEn: string | null;
  /** true : compté dans les statistiques d'évangélisation (D-EVT-03). */
  evangelism: boolean;
  /** true (type « Autre ») : `customLabel` obligatoire (422 EVENT_LABEL_REQUIRED sinon). */
  requiresLabel: boolean;
  orderIndex: number;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.ScopeNode — nœud de l'arbre où l'on peut déclarer
 * (RG-EVT-02). `parentId` = parent direct S'IL figure dans la liste, sinon null.
 */
export interface ScopeNode {
  level: OrgLevel;
  id: string;
  name: string;
  parentId: string | null;
  /** On peut aussi y programmer (RG-EVT-03). */
  canPlan: boolean;
}

/** Mirrors com.excellence.back.events.EventDtos.EventScopesResponse */
export interface EventScopesResponse {
  /** Au moins un nœud de déclaration (RG-ACT-01) ; false → pas de formulaire. */
  canDeclare: boolean;
  canPlan: boolean;
  /** Nœud par défaut d'une déclaration (RG-EVT-02) ; null → choix obligatoire. */
  defaultScope: ScopeNode | null;
  /** Triés niveau (COUNTRY d'abord) puis nom ; tout le ministère pour LEADER / SECRETARIAT. */
  scopes: ScopeNode[];
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventCreateRequest — RG-ACT-03 : seuls `typeId` et
 * `eventDate` sont requis côté métier ; `clientId` (RG-EVT-07, idempotence) et `status` sont posés
 * par le client. `scopeLevel` + `scopeId` vont ensemble ; absents → nœud par défaut (RG-EVT-02).
 * Textes : le serveur retire les espaces de bord et lit une chaîne vide comme null.
 */
export interface EventCreateRequest {
  /** UUID v4 généré UNE fois par saisie : rejouer la même création renvoie l'existant (200). */
  clientId: string;
  typeId: string;
  eventDate: string;
  /** DONE = déclaration terrain (RG-ACT-04) ; PLANNED = programmation (RG-EVT-03). */
  status: 'DONE' | 'PLANNED';
  /** ≤ 120 — obligatoire si le type `requiresLabel`, ignoré sinon. */
  customLabel?: string;
  endDate?: string;
  scopeLevel?: OrgLevel;
  scopeId?: string;
  /** ≤ 200 */
  title?: string;
  /** ≤ 200 */
  place?: string;
  participants?: number;
  /** ≥ 0 — D-EVT-15 : type évangélique seulement, IGNORÉ (enregistré null) sinon. */
  conversions?: number;
  /** ≥ 0 — idem. */
  restorations?: number;
  /** ≥ 0 — idem. */
  baptisms?: number;
  /** ≤ 280 */
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
  /** Type évangélique. */
  evangelism: boolean;
  /** Libellé libre (type « Autre ») — à afficher à la place du nom du type. */
  customLabel: string | null;
  title: string | null;
  status: EventStatus;
  eventDate: string;
  endDate: string | null;
  scopeLevel: OrgLevel;
  scopeId: string;
  scopeName: string | null;
  place: string | null;
  participants: number | null;
  /** D-EVT-15 (JP 14/10) — toujours null pour un type non évangélique. */
  conversions: number | null;
  restorations: number | null;
  baptisms: number | null;
  note: string | null;
  /** RG-ACT-07 : informatif, ne retire jamais du total. */
  toVerify: boolean;
  toVerifyById: string | null;
  /** Entre dans les statistiques : DONE + type évangélique (D-EVT-03). */
  counted: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string | null;
  doneAt: string | null;
  canEdit: boolean;
  canFlag: boolean;
}

/** Mirrors org.springframework.data.domain.Page — seuls les champs utiles (§5 du contrat). */
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
  /** Mois effectivement compté, 'yyyy-MM'. */
  month: string;
  /** Mes évènements COMPTÉS (DONE, type évangélique) de ce mois. */
  monthCount: number;
  /** … de l'année de ce mois. */
  yearCount: number;
  /** Mes évènements non supprimés, tous statuts et types, récent en haut. */
  events: Page<EventResponse>;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventUpdateRequest — `PATCH /{id}` (lot E7).
 * REMPLACEMENT COMPLET des champs descriptifs (§3.7 du contrat) : un champ facultatif absent ou
 * null est EFFACÉ — renvoyer les valeurs actuelles pour les garder. Exception : `scopeLevel` +
 * `scopeId` absents = nœud INCHANGÉ. Le statut ne change jamais ici (`done` / `cancel`).
 */
export interface EventUpdateRequest {
  typeId: string;
  eventDate: string;
  /** ≤ 120 — obligatoire si le type `requiresLabel`. */
  customLabel: string | null;
  endDate: string | null;
  scopeLevel?: OrgLevel;
  scopeId?: string;
  /** ≤ 200 */
  title: string | null;
  /** ≤ 200 */
  place: string | null;
  participants: number | null;
  /**
   * D-EVT-15 : les compteurs suivent le `typeId` ENVOYÉ — vers un type non évangélique, le serveur
   * les remet à null (ignorés, pas refusés) ; revenir à un type évangélique ne les restaure pas.
   */
  conversions: number | null;
  restorations: number | null;
  baptisms: number | null;
  /** ≤ 280 */
  note: string | null;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.EventDoneRequest — « Marquer comme réalisé »
 * (D-EVT-02, RG-EVT-06). Un champ ABSENT garde sa valeur ; `note: ''` efface la note.
 */
export interface EventDoneRequest {
  participants?: number;
  /** D-EVT-15 : type évangélique seulement, ignorés sinon. */
  conversions?: number;
  restorations?: number;
  baptisms?: number;
  /** ≤ 280 */
  note?: string;
}

/** Mirrors com.excellence.back.events.EventDtos.StatsLevel — MINISTRY = racine virtuelle « tout mon ministère ». */
export type StatsLevel = 'MINISTRY' | OrgLevel;

/** Mirrors com.excellence.back.events.EventDtos.StatsScope — `id` = ministère quand `level` = MINISTRY. */
export interface StatsScope {
  level: StatsLevel;
  id: string;
  name: string | null;
}

/**
 * Mirrors com.excellence.back.events.EventDtos.StatsTotals — sommes des évènements comptés ; un
 * compteur non renseigné vaut 0 (D-EVT-15).
 */
export interface StatsTotals {
  count: number;
  participants: number;
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

/** Mirrors com.excellence.back.events.EventDtos.MonthStats — `month` 'yyyy-MM'. */
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
 * Mirrors com.excellence.back.events.EventDtos.EventStatsResponse (§5.3 du plan, §6 du contrat).
 * Ne porte que sur les évènements COMPTÉS de [from, to] (D-EVT-03 : DONE, type évangélique ;
 * « à vérifier » ne retire rien, RG-ACT-07). `total.count = ownLevelCount + Σ children.count`
 * (D-EVT-04 : un évènement compte une fois, au nœud où il est rattaché).
 */
export interface EventStatsResponse {
  scope: StatsScope;
  from: string;
  to: string;
  total: StatsTotals;
  /** Types évangéliques, ordre du catalogue : tous les actifs (même à 0) + les désactivés ayant compté. */
  byType: TypeStats[];
  /** Un élément par mois de la période, mois vides à 0. */
  byMonth: MonthStats[];
  /** Sous-niveaux visibles, triés par nom, à 0 compris ; [] pour une assemblée. */
  children: ChildStats[];
  /** Comptés rattachés à la racine ELLE-MÊME (0 pour MINISTRY). */
  ownLevelCount: number;
  /** Agenda du sous-arbre, tous types, hors période : PLANNED à venir (date UTC du serveur). */
  plannedUpcoming: number;
  /** … PLANNED passés non clôturés. */
  toCloseCount: number;
}

/** Paramètres de `GET /api/church/events` (§3.5 du contrat). Nœud absent = tout mon périmètre de lecture. */
export interface EventListParams {
  scopeLevel?: OrgLevel;
  scopeId?: string;
  /** Bornes INCLUSES sur `eventDate`. */
  from?: string;
  to?: string;
  status?: EventStatus;
  evangelism?: boolean;
  /**
   * Défaut serveur true : + évènements des ancêtres, en lecture (recette §9.3 n°4). Sans effet pour
   * un simple membre (D-EVT-14, JP 14/10) : toujours son assemblée seule.
   */
  includeAncestors?: boolean;
  /** En majuscules (Sort.Direction). Défaut serveur DESC. */
  order?: 'ASC' | 'DESC';
  page?: number;
  size?: number;
}

/**
 * Codes de refus traduits sous `events.errors.*` (§1.3 du contrat) : les 422 métier, plus le
 * hors-périmètre (403 UNAUTHORIZED_ACCESS) et la ressource inconnue (404), dont le message serveur
 * est technique et en anglais. Tout autre code retombe sur le message serveur.
 * Lot E7 : + EVENT_NOT_YET_HELD (« Marquer comme réalisé » avant la date, RG-EVT-05).
 * Revue E9 : + les 400 qualifiés INVALID_PERIOD / INVALID_SCOPE, comme le web — un refus
 * définitif de la file hors-ligne (§3.3) ou une période de statistiques refusée se lit traduit.
 */
export const EVENT_ERROR_CODES = [
  'EVENT_DATE_IN_FUTURE',
  'EVENT_NOT_YET_HELD',
  'EVENT_LABEL_REQUIRED',
  'EVENT_TYPE_INACTIVE',
  'EVENT_END_BEFORE_START',
  'EVENT_SCOPE_REQUIRED',
  'EVENT_INVALID_TRANSITION',
  'INVALID_PERIOD',
  'INVALID_SCOPE',
  'UNAUTHORIZED_ACCESS',
  'RESOURCE_NOT_FOUND',
];

const BASE = '/api/church/events';

/** Types actifs du ministère, triés `orderIndex` puis nom. `[]` : aucun type configuré. */
export async function listEventTypes(): Promise<EventTypeDto[]> {
  const { data } = await apiClient.get<EventTypeDto[]>(`${BASE}/types`);
  return data;
}

/** Où je peux déclarer / programmer, et le nœud par défaut (RG-EVT-02). */
export async function getMyEventScopes(): Promise<EventScopesResponse> {
  const { data } = await apiClient.get<EventScopesResponse>(`${BASE}/me/scopes`);
  return data;
}

/**
 * Déclarer (DONE) ou programmer (PLANNED). 201 à la création, 200 au rejeu du même `clientId`
 * (RG-EVT-07) : les deux sont un succès. `config` permet à la saisie terrain de raccourcir le
 * délai d'attente — passé ce délai la déclaration part dans la file hors-ligne, sans risque de
 * doublon puisque le rejeu est idempotent —, et au vidage de la file d'épingler le jeton de
 * l'auteur (`headers.Authorization`) : un élément ne part jamais sous l'identité d'un autre compte.
 */
export async function createEvent(
  payload: EventCreateRequest,
  config?: Pick<AxiosRequestConfig, 'timeout' | 'headers'>,
): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(BASE, payload, config);
  return data;
}

/**
 * « Mes actions ». `month` = mois LOCAL 'yyyy-MM' (le défaut serveur est le mois UTC, §1.4 du
 * contrat). `size` plafonné à 100 côté serveur.
 */
export async function getMyEvents(month: string, page = 0, size = 20): Promise<MyEventsResponse> {
  const { data } = await apiClient.get<MyEventsResponse>(`${BASE}/me`, {
    params: { month, page, size },
  });
  return data;
}

// ---------------- Lot E7 — agenda, détail, clôture, statistiques ----------------
// Hors file hors-ligne (plan §6.3) : modifier, clôturer, annuler, « à vérifier » et supprimer
// exigent le réseau ; une erreur se dit à l'écran, rien n'est rejoué en arrière-plan.

/** Agenda / liste d'un nœud et de son sous-arbre (+ ancêtres par défaut), paginé (`size` ≤ 100). */
export async function listEvents(params: EventListParams): Promise<Page<EventResponse>> {
  const { data } = await apiClient.get<Page<EventResponse>>(BASE, { params });
  return data;
}

/** Détail + flags `canEdit` / `canFlag`. 404 si inconnu OU supprimé. */
export async function getEvent(id: string): Promise<EventResponse> {
  const { data } = await apiClient.get<EventResponse>(`${BASE}/${id}`);
  return data;
}

/** Modifier (RG-ACT-06, RG-EVT-04) — remplacement complet, voir `EventUpdateRequest`. */
export async function updateEvent(id: string, payload: EventUpdateRequest): Promise<EventResponse> {
  const { data } = await apiClient.patch<EventResponse>(`${BASE}/${id}`, payload);
  return data;
}

/** PLANNED → DONE (RG-EVT-06). 422 EVENT_NOT_YET_HELD si la date est encore à venir (RG-EVT-05). */
export async function markEventDone(id: string, payload: EventDoneRequest): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(`${BASE}/${id}/done`, payload);
  return data;
}

/** PLANNED → CANCELLED (RG-EVT-06) ; un DONE ne s'annule pas, il se supprime. */
export async function cancelEvent(id: string): Promise<EventResponse> {
  const { data } = await apiClient.post<EventResponse>(`${BASE}/${id}/cancel`);
  return data;
}

/** Pose / retire « à vérifier » — informatif, ne change jamais le comptage (RG-ACT-07). */
export async function setEventToVerify(id: string, toVerify: boolean): Promise<EventResponse> {
  const { data } = await apiClient.put<EventResponse>(`${BASE}/${id}/to-verify`, { toVerify });
  return data;
}

/** Soft delete (204) : l'évènement sort des listes, du détail et des statistiques. */
export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

/**
 * Statistiques (§5.3) — `from` / `to` REQUIS (≤ 1827 jours). Nœud absent = mon périmètre le plus
 * large (nation, ou ministère entier) ; descendre = rappeler avec le nœud de l'enfant.
 */
export async function getEventStats(params: {
  from: string;
  to: string;
  scopeLevel?: OrgLevel;
  scopeId?: string;
}): Promise<EventStatsResponse> {
  const { data } = await apiClient.get<EventStatsResponse>(`${BASE}/stats`, { params });
  return data;
}
