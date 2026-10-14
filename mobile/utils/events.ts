import type { EventResponse, EventTypeDto } from '@/services/eventsApi';
import { fmtIsoDay, type Translate } from '@/utils/meetingReport';
import { toLocalDate } from '@/utils/format';

// ---------------------------------------------------------------------------------------------
//  Évènements (lot E7, plan 14/10 §6.3) — fonctions pures partagées par l'onglet « Évènements »,
//  le détail, la programmation et « Mes actions » : dates LOCALES, libellés, périodes.
//  Miroir fonctionnel de `web/src/utils/events.ts` (les deux surfaces ne partagent pas de code).
// ---------------------------------------------------------------------------------------------

/** Langue d'affichage anglaise ? `language` du LanguageContext ('fr' | 'en', parfois 'en-GB'). */
export const isEnglishLang = (language: string | null | undefined): boolean =>
  (language ?? '').toLowerCase().startsWith('en');

/** RG-EVT-01 / §6.4 du plan : `nameEn` en anglais, à défaut `name`. */
export const typeLabel = (type: Pick<EventTypeDto, 'name' | 'nameEn'>, english: boolean): string =>
  (english && type.nameEn) || type.name;

/** Libellé d'un évènement : le libellé libre d'un type « Autre » prime sur le nom du type (§3.1). */
export const eventLabel = (
  e: Pick<EventResponse, 'customLabel' | 'typeName' | 'typeNameEn'>,
  english: boolean,
): string => e.customLabel || typeLabel({ name: e.typeName, nameEn: e.typeNameEn }, english);

/** Saisie numérique facultative : chiffres seuls, vide = non renseigné (jamais un 0 implicite). */
export const digitsOnly = (raw: string): string => raw.replace(/[^0-9]/g, '');

/** '' → undefined, sinon le nombre (la saisie est déjà réduite aux chiffres, 6 au plus). */
export const countOrUndefined = (raw: string): number | undefined => (raw === '' ? undefined : Number(raw));

// ---------------- Dates (toujours LOCALES : contrat §1.4) ----------------

export const todayLocal = (): string => toLocalDate(new Date());

/** Mois LOCAL 'yyyy-MM' — le défaut serveur de `GET /me` serait le mois UTC (§1.4 du contrat). */
export const monthLocal = (): string => todayLocal().slice(0, 7);

export function addDaysLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + days));
}

/** « À clôturer » (contrat §4) : programmé dont la date LOCALE est passée — RG-EVT-05. */
export const isToClose = (e: Pick<EventResponse, 'status' | 'eventDate'>): boolean =>
  e.status === 'PLANNED' && e.eventDate < todayLocal();

/** Date d'un évènement, avec sa date de fin s'il dure plusieurs jours (retraite). */
export function fmtEventDates(e: Pick<EventResponse, 'eventDate' | 'endDate'>, t: Translate): string {
  const start = fmtIsoDay(e.eventDate, t);
  return e.endDate && e.endDate !== e.eventDate ? `${start} → ${fmtIsoDay(e.endDate, t)}` : start;
}

/** « octobre 2026 » pour un mois 'yyyy-MM'. */
export function fmtMonth(month: string, t: Translate): string {
  const [y, m] = month.split('-').map(Number);
  const name = t('common.monthsLong').split(',')[m - 1];
  return name ? `${name} ${y}` : month;
}

// ---------------- Périodes (D-EVT-06 : mois / année / plage libre) ----------------

/** 5 ans, bissextiles comprises : au-delà, 400 INVALID_PERIOD (contrat §1.3, [HYPOTHÈSE] §5.2). */
export const MAX_PERIOD_DAYS = 1827;

export type PeriodMode = 'month' | 'year' | 'range';

export interface Period {
  mode: PeriodMode;
  /** 'yyyy-MM' (mode month). */
  month: string;
  /** Mode year. */
  year: number;
  /** Bornes incluses 'yyyy-MM-dd' (mode range). */
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

/** Clé i18n de l'erreur d'une plage libre, ou null si elle est valide (ou si ce n'est pas une plage). */
export function periodRangeError(p: Period): string | null {
  if (p.mode !== 'range') return null;
  if (p.from > p.to) return 'events.period.reversed';
  const [fy, fm, fd] = p.from.split('-').map(Number);
  const [ty, tm, td] = p.to.split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
  return days > MAX_PERIOD_DAYS ? 'events.period.tooLong' : null;
}

/** Bornes [from, to] de la période, ou null si la plage libre est invalide. */
export function periodBounds(p: Period): { from: string; to: string } | null {
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    return { from: `${p.month}-01`, to: toLocalDate(new Date(y, m, 0)) };
  }
  if (p.mode === 'year') return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
  return periodRangeError(p) ? null : { from: p.from, to: p.to };
}

/** Mois ou année voisins (`delta` = ±1) ; sans effet sur une plage libre. */
export function shiftPeriod(p: Period, delta: number): Period {
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    return { ...p, month: toLocalDate(new Date(y, m - 1 + delta, 1)).slice(0, 7) };
  }
  if (p.mode === 'year') return { ...p, year: p.year + delta };
  return p;
}

/**
 * La période suivante commencerait-elle dans le futur ? Les réalisés et les statistiques ne
 * portent que sur le passé (RG-EVT-05) : la flèche « suivant » s'arrête au mois / à l'année courants.
 */
export function isCurrentOrLater(p: Period): boolean {
  const today = todayLocal();
  if (p.mode === 'month') return p.month >= today.slice(0, 7);
  if (p.mode === 'year') return p.year >= Number(today.slice(0, 4));
  return true;
}
