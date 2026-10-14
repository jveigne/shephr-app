import { EVENT_ERROR_CODES } from '../services/eventsApi';

/**
 * Lot E6 (plan 14/10) — refus d'une déclaration d'action, sous une forme qui SE CONSERVE.
 *
 * <p>Une déclaration refusée pendant le vidage de la file hors-ligne l'est souvent en arrière-plan
 * (démarrage, retour du réseau) : le refus doit survivre jusqu'à ce que la personne ouvre « Mes
 * actions ». On garde donc les faits bruts (statut, code, message serveur) et on ne traduit qu'à
 * l'affichage — un message traduit au moment du refus resterait dans la langue d'alors.
 */
export interface EventSendFailure {
  /** Statut HTTP ; null = pas de réponse (réseau coupé, délai dépassé). */
  status: number | null;
  /** Code machine (`response.data.error`, §1.3 du contrat). */
  code: string | null;
  /** Message serveur, technique et en anglais : dernier recours de l'affichage. */
  message: string | null;
  /** 400 de validation du corps (`validationErrors` présent). */
  validation: boolean;
}

/** Extrait les faits d'une erreur axios (ou de toute autre exception). */
export function toSendFailure(e: any): EventSendFailure {
  const response = e?.response;
  const data = response?.data;
  return {
    status: typeof response?.status === 'number' ? response.status : null,
    code: typeof data?.error === 'string' ? data.error : null,
    message: typeof data?.message === 'string' ? data.message : null,
    validation: !!data?.validationErrors && Object.keys(data.validationErrors).length > 0,
  };
}

/**
 * Message à montrer. Même ordre que `declarationErrorMessage` (dons) : traduction du code connu,
 * puis message serveur, puis `fallback` — jamais un générique muet quand le serveur a dit pourquoi.
 */
export function eventFailureMessage(
  failure: EventSendFailure,
  t: (key: string, options?: any) => string,
  fallback: string,
): string {
  if (failure.code && EVENT_ERROR_CODES.includes(failure.code)) {
    return t(`events.errors.${failure.code}`);
  }
  if (failure.validation) return t('events.errors.VALIDATION');
  return failure.message ?? fallback;
}

/**
 * Lot E7 (plan 14/10, §6.3) — message d'une opération EN LIGNE (agenda, détail, programmer,
 * modifier, clôturer, annuler, « à vérifier », supprimer, statistiques). Celles-ci ne passent pas
 * par la file hors-ligne : un échec se dit tout de suite, avec sa raison.
 *
 * <p>En plus de `eventFailureMessage` : pas de réseau (ces opérations l'exigent), panne passagère
 * (503) et module suspendu entre-temps (403 MODULE_ACCESS_DENIED) ont leur phrase ; `overrides`
 * remplace la traduction d'un code par une clé propre au contexte — un 404 sur un évènement
 * ouvert veut dire « supprimé entre-temps », pas « type inconnu ».
 */
export function eventActionMessage(
  e: unknown,
  t: (key: string, options?: any) => string,
  overrides: Partial<Record<string, string>> = {},
): string {
  const failure = toSendFailure(e);
  if (failure.status === null) return t('events.errors.network');
  const override = failure.code ? overrides[failure.code] : undefined;
  if (override) return t(override);
  if (failure.code === 'SERVICE_UNAVAILABLE' || failure.code === 'MODULE_ACCESS_DENIED') {
    return t(`events.errors.${failure.code}`);
  }
  return eventFailureMessage(failure, t, t('events.errors.generic'));
}

/** Code machine d'une erreur d'API (`response.data.error`), null sans réponse. */
export const eventErrorCode = (e: unknown): string | null => toSendFailure(e).code;
