import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { EventResponse, EventType, OrgLevel, Page, ScopeNode, StatsLevel } from '../services/eventsApi';
import { toLocalDate } from './format';

// ---------------------------------------------------------------------------------------------
//  Évènements (lot E8) — fonctions pures partagées par /events (espace ministère) et /my-actions
//  (espace membre) : dates locales, libellés, périodes, messages d'erreur, invalidation du cache.
// ---------------------------------------------------------------------------------------------

/**
 * Clés react-query du module. Le CATALOGUE (types actifs, nœuds où je déclare) ne bouge pas quand
 * on écrit un évènement ; les DONNÉES (agenda, « Mes actions », détail, statistiques) si.
 */
export const EVENT_KEYS = {
  types: ['events', 'catalog', 'types'] as const,
  scopes: ['events', 'catalog', 'scopes'] as const,
  data: ['events', 'data'] as const,
};

/**
 * Après une écriture, toutes les DONNÉES du module sont périmées : agenda, « Mes actions », détail
 * ET statistiques (RG-ACT-04 : une déclaration compte dès sa création).
 */
export function invalidateEvents(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: EVENT_KEYS.data });
}

/**
 * `clientId` d'une saisie (RG-EVT-07) : UUID v4, généré UNE fois par formulaire et réutilisé tel
 * quel si l'envoi est rejoué (un rejeu ne crée pas de doublon). `crypto.randomUUID` n'existe qu'en
 * contexte sécurisé (https, localhost) : en http sur le réseau local, on le construit à partir de
 * `getRandomValues`, disponible partout.
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Nombre saisi (participants, invités, conversions, restaurations, baptêmes) : entier ≥ 0 tenant dans un
 * `Integer` Java.
 * `null` si le champ est vide, `undefined` s'il est invalide.
 */
export function parseCount(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n <= 2_147_483_647 ? n : undefined;
}

// ---------------- Compteurs (D-EVT-15) ----------------

/**
 * D-EVT-15 (JP 14/10, retour de l'évangéliste) : compteurs d'un évènement d'un type ÉVANGÉLIQUE,
 * dans l'ordre d'affichage — `conversions` (ex-« âmes gagnées », `soulsWon`), `restorations`,
 * `baptisms`. Tous facultatifs (RG-ACT-03). Pour un type non évangélique, le serveur les ignore
 * (enregistrés `null`) : on ne les affiche ni ne les envoie. `participants` vaut pour tous les types,
 * comme `guests` (D-EVT-17).
 */
export const EVANGELISM_COUNTERS = ['conversions', 'restorations', 'baptisms'] as const;
export type EvangelismCounter = (typeof EVANGELISM_COUNTERS)[number];
export type EventCountKey = 'participants' | 'guests' | EvangelismCounter;

/**
 * Compteurs proposés pour un type : participants et invités toujours (D-EVT-17), les trois
 * évangéliques s'il l'est.
 */
export const countKeysFor = (evangelism: boolean): EventCountKey[] =>
  evangelism ? ['participants', 'guests', ...EVANGELISM_COUNTERS] : ['participants', 'guests'];

/**
 * D-EVT-17 (JP 14/10, « il faut rajouter le nombre d'invités, différencier participants et
 * invités ») : les invités sont la part EXTÉRIEURE des participants, donc inclus dedans. Quand les
 * deux sont renseignés, invités ≤ participants (sinon 422 EVENT_GUESTS_EXCEED_PARTICIPANTS) ; un
 * seul renseigné ne contraint rien. Contrôlé avant envoi : le bouton reste inactif tant que c'est faux.
 */
export const guestsExceedParticipants = (
  participants: number | null | undefined,
  guests: number | null | undefined,
): boolean => participants != null && guests != null && guests > participants;

/**
 * « 40 participants dont 12 invités · 3 conversions » : les compteurs RENSEIGNÉS parmi `keys`, dans
 * l'ordre ; chaîne vide si aucun ne l'est (un compteur vide n'est pas un zéro). D-EVT-17 : les
 * invités se rattachent aux participants (« dont ») ; seuls, ils s'affichent « 12 invités ».
 */
export function fmtCounts(
  values: Partial<Record<EventCountKey, number | null>>,
  keys: readonly EventCountKey[],
  t: TFunction,
  lang: string,
): string {
  const shown = keys.filter((k) => values[k] != null);
  const label = (k: EventCountKey, key: string = k) =>
    t(`events.counts.${key}`, { count: values[k]!, n: fmtCount(values[k]!, lang) });
  return shown
    .filter((k) => !(k === 'guests' && shown.includes('participants')))
    .map((k) =>
      k === 'participants' && shown.includes('guests') ? `${label(k)} ${label('guests', 'guestsOf')}` : label(k),
    )
    .join(' · ');
}

/** Valeurs saisies des compteurs, préremplies depuis l'évènement modifié ou clôturé. */
export function initialCountValues(event?: EventResponse): Record<EventCountKey, string> {
  const v = (n: number | null | undefined) => (n != null ? String(n) : '');
  return {
    participants: v(event?.participants),
    guests: v(event?.guests),
    conversions: v(event?.conversions),
    restorations: v(event?.restorations),
    baptisms: v(event?.baptisms),
  };
}

/**
 * D-EVT-16 (JP 14/10, « pour un évènement évangélique, il faut rajouter le nom du prédicateur ») :
 * texte libre de 120 caractères au plus (`EventDtos.PREACHER_MAX`), facultatif, comme les fruits de
 * D-EVT-15 réservé à un type ÉVANGÉLIQUE : on ne le propose ni ne l'envoie pour un autre type (le
 * serveur l'ignorerait), et il n'existe alors jamais dans `EventResponse`.
 */
export const EVENT_PREACHER_MAX = 120;

/** Note libre d'un évènement : 280 caractères au plus (contrat §3.3, « 1-2 lignes » de la spec §3). */
export const EVENT_NOTE_MAX = 280;

// ---------------- Dates (toujours LOCALES : contrat §1.4) ----------------

export const todayLocal = (): string => toLocalDate(new Date());

export function addDaysLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + days));
}

/** Mois local courant « yyyy-MM » — envoyé à `GET /me` (sinon le serveur compte le mois UTC). */
export const currentMonthLocal = (): string => todayLocal().slice(0, 7);

/** « À clôturer » (contrat §4) : programmé dont la date (locale) est passée. */
export const isToClose = (e: EventResponse): boolean =>
  e.status === 'PLANNED' && e.eventDate < todayLocal();

const dateLocale = (lang: string) => (lang.startsWith('en') ? 'en-GB' : 'fr-FR');

/**
 * Page demandée devenue hors bornes (une clôture ou une suppression a vidé la dernière page) :
 * renvoie la nouvelle dernière page (base 0), sinon `null`. Seule la réponse à CETTE page compte
 * (`number === page`) — une page précédente gardée en placeholder ne déclenche rien.
 */
export function lastPageIfPast(data: Page<unknown> | undefined, page: number): number | null {
  if (!data || page === 0 || data.number !== page || page < data.totalPages) return null;
  return Math.max(0, data.totalPages - 1);
}

/** « 14 oct. 2026 » / « 14 Oct 2026 ». */
export function fmtEventDate(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Date d'un évènement, avec sa date de fin s'il dure plusieurs jours (retraite). */
export function fmtEventDates(e: Pick<EventResponse, 'eventDate' | 'endDate'>, lang: string): string {
  const start = fmtEventDate(e.eventDate, lang);
  return e.endDate && e.endDate !== e.eventDate ? `${start} → ${fmtEventDate(e.endDate, lang)}` : start;
}

/** « octobre 2026 » pour un mois « yyyy-MM ». */
export function fmtMonth(month: string, lang: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocale(lang), { month: 'long', year: 'numeric' });
}

export const fmtCount = (n: number, lang: string): string => new Intl.NumberFormat(dateLocale(lang)).format(n);

// ---------------- Libellés ----------------

/** RG-EVT-01 / §6.4 du plan : `nameEn` en anglais, à défaut `name`. */
export function typeLabel(t: Pick<EventType, 'name' | 'nameEn'>, lang: string): string {
  return lang.startsWith('en') ? t.nameEn ?? t.name : t.name;
}

/** Libellé d'un évènement : le libellé libre d'un type « Autre » prime sur le nom du type. */
export function eventTypeLabel(e: EventResponse, lang: string): string {
  return e.customLabel ?? typeLabel({ name: e.typeName, nameEn: e.typeNameEn }, lang);
}

/** Clé i18n du niveau d'un nœud (vocabulaire Chantier B : Nation, Région, Ville, Assemblée). */
export const levelKey = (level: OrgLevel | StatsLevel): string => `events.level.${level}`;

/**
 * Options de sélecteur de nœud : le nom, et en ligne secondaire le niveau suivi du parent quand il
 * figure dans la liste (« Ville · Bruxelles-Capitale ») — « Béthel » peut exister dans deux villes.
 */
export function scopeOptions(
  scopes: ScopeNode[],
  tr: (key: string) => string,
): { id: string; label: string; sub: string }[] {
  const byId = new Map(scopes.map((s) => [s.id, s]));
  return scopes.map((s) => {
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    const level = tr(levelKey(s.level));
    return { id: s.id, label: s.name, sub: parent ? `${level} · ${parent.name}` : level };
  });
}

// ---------------- Périodes (D-EVT-06 : mois / année / plage libre) ----------------

/** 5 ans, bissextiles comprises : au-delà, 400 INVALID_PERIOD (contrat §1.3, [HYPOTHÈSE] §5.2). */
export const MAX_PERIOD_DAYS = 1827;

export type PeriodMode = 'month' | 'year' | 'range';

export interface Period {
  mode: PeriodMode;
  /** « yyyy-MM » (mode month). */
  month: string;
  /** Mode year. */
  year: number;
  /** Bornes incluses (mode range). */
  from: string;
  to: string;
}

export function defaultPeriod(mode: PeriodMode = 'year'): Period {
  const today = todayLocal();
  return {
    mode,
    month: today.slice(0, 7),
    year: Number(today.slice(0, 4)),
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
  };
}

/** Bornes [from, to] de la période, ou `null` si la plage libre est incomplète ou invalide. */
export function periodBounds(p: Period): { from: string; to: string } | null {
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    return { from: `${p.month}-01`, to: toLocalDate(new Date(y, m, 0)) };
  }
  if (p.mode === 'year') return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
  return periodRangeError(p) ? null : { from: p.from, to: p.to };
}

/** Clé i18n de l'erreur d'une plage libre, ou `null` si elle est valide. */
export function periodRangeError(p: Period): string | null {
  if (p.mode !== 'range') return null;
  if (!p.from || !p.to) return 'events.period.incomplete';
  if (p.from > p.to) return 'events.period.reversed';
  const [fy, fm, fd] = p.from.split('-').map(Number);
  const [ty, tm, td] = p.to.split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
  return days > MAX_PERIOD_DAYS ? 'events.period.tooLong' : null;
}

/** Les 12 derniers mois, du plus récent au plus ancien (sélecteur du mode « mois »). */
export function recentMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) =>
    toLocalDate(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7),
  );
}

/** Les 5 dernières années (un quinquennat : la plage maximale du serveur). */
export function recentYears(): number[] {
  const y = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => y - i);
}

// ---------------- Erreurs ----------------

interface ApiErrorBody {
  error?: string;
  message?: string;
  validationErrors?: Record<string, string> | null;
}

const errorBody = (err: unknown): ApiErrorBody | undefined =>
  (err as { response?: { data?: ApiErrorBody } })?.response?.data;

/** Code machine de l'erreur (`ApiError.error`, contrat §1.3). */
export const errCode = (err: unknown): string | null => errorBody(err)?.error ?? null;

/** Codes traduits sous `events.errors.*` ; les autres retombent sur le message du serveur. */
const KNOWN_CODES = new Set([
  'EVENT_DATE_IN_FUTURE',
  'EVENT_NOT_YET_HELD',
  'EVENT_LABEL_REQUIRED',
  'EVENT_TYPE_INACTIVE',
  'EVENT_INVALID_TRANSITION',
  'EVENT_END_BEFORE_START',
  'EVENT_SCOPE_REQUIRED',
  'EVENT_GUESTS_EXCEED_PARTICIPANTS',
  'INVALID_PERIOD',
  'INVALID_SCOPE',
  'MODULE_ACCESS_DENIED',
  'UNAUTHORIZED_ACCESS',
  'RESOURCE_NOT_FOUND',
  'SERVICE_UNAVAILABLE',
]);

/**
 * Message lisible d'une erreur d'API : code connu → traduction ; 400 de validation → détail des
 * champs renvoyé par le serveur ; sinon `message` du serveur, à défaut le libellé générique.
 */
export function eventErrorMessage(err: unknown, tr: (key: string) => string): string {
  const body = errorBody(err);
  const code = body?.error ?? null;
  if (code && KNOWN_CODES.has(code)) return tr(`events.errors.${code}`);
  if (body?.validationErrors && Object.keys(body.validationErrors).length > 0) {
    return Object.values(body.validationErrors).join(' · ');
  }
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) return tr('events.errors.UNAUTHORIZED_ACCESS');
  if (status == null) return tr('events.errors.network');
  return body?.message ?? tr('common.error');
}
