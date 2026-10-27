import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { SupervisionOverview, SupervisionRequestView } from '../services/leadersApi';

// ---------------------------------------------------------------------------------------------
//  Demandes de supervision descendantes — helpers partagés par la page 2 « Mon leadership »
//  (`pages/HierarchyLeadership.tsx`) et la modale de `components/NotificationGate.tsx`
//  (D-HIE-02..07, JP 28/10, lot HIE).
// ---------------------------------------------------------------------------------------------

/** Codes 422 traduits sous `hierarchy.leadership.errors.<CODE>` (plan §8) ; sinon repli générique. */
const KNOWN_CODES = new Set([
  'QUERY_TOO_SHORT',
  'NO_MINISTRY',
  'SUPERVISION_SELF',
  'SUPERVISION_OUT_OF_MINISTRY',
  'SUPERVISION_DESIGNEE_NOT_A_LEADER',
  'SUPERVISION_REQUESTER_NOT_A_LEADER',
  'SUPERVISION_CYCLE',
  'SUPERVISION_ALREADY_LINKED',
  'SUPERVISION_REQUEST_DUPLICATE',
  'SUPERVISION_REQUEST_NOT_PENDING',
  'SUPERVISION_REQUEST_NOT_ACCEPTED',
]);

/** Code métier de l'`ApiError` (`error`), null sinon (un 403 « acteur non éligible » n'en a pas). */
export function supervisionErrorCode(err: unknown): string | null {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;
}

export function supervisionErrorMessage(err: unknown, t: TFunction): string {
  const code = supervisionErrorCode(err);
  return code && KNOWN_CODES.has(code)
    ? t(`hierarchy.leadership.errors.${code}`)
    : t('hierarchy.leadership.errors.generic');
}

/**
 * RG-HIE-28 (D-HIE-03) — valider REMPLACE le superviseur actuel : confirmation explicite quand j'ai
 * déjà un superviseur et que ce n'est pas le demandeur. Renvoie son nom, null si rien à confirmer.
 */
export function replacedSupervisorName(
  overview: SupervisionOverview | null | undefined,
  request: SupervisionRequestView,
): string | null {
  const current = overview?.supervisor ?? null;
  return current && current.id !== request.requester.id ? current.fullName : null;
}

/**
 * Après une mutation : l'aperçu renvoyé par le serveur devient la vérité ; l'arbre, la déclaration
 * montante et les notifications non lues (marquées lues par le serveur à la sortie de PENDING,
 * RG-HIE-25) sont relus.
 */
export function applySupervisionOverview(queryClient: QueryClient, data: SupervisionOverview) {
  queryClient.setQueryData(['leaders', 'supervision'], data);
  void queryClient.invalidateQueries({ queryKey: ['leaders', 'hierarchy'] });
  void queryClient.invalidateQueries({ queryKey: ['leaders', 'discipleship'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
}
