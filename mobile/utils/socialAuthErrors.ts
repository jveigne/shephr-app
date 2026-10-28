import { SocialSignInError } from '@/services/socialSignIn';

/**
 * Connexion Google / Apple — refus traduits.
 *
 * Contrat backend (`/api/auth/oauth/...`) : statut HTTP + `{ code }`. On lit aussi `error`,
 * le champ que d'autres contrôleurs du même backend utilisent pour leur code.
 * Les annulations ne passent jamais ici : `services/socialSignIn` les rend sous forme de `null`.
 */
const BACKEND_CODES = [
  'INVALID_TOKEN',
  'EMAIL_NOT_VERIFIED',
  // D-ABO-14 (JP 23/10) : plus levé par le serveur (Google / Apple ouverts aux comptes à rôle) ;
  // traduction conservée pour un serveur plus ancien. Aucun bouton n'est masqué selon le rôle.
  'PRIVILEGED_ACCOUNT_REQUIRES_PASSWORD',
  'ACCOUNT_DISABLED',
  'PROVIDER_NOT_CONFIGURED',
  // D-MKT-05, JP 28/10 (RG-MKT-56) : traduits, le `message` français du serveur n'est plus affiché.
  'ACCOUNT_LINK_AMBIGUOUS',
  'TOO_MANY_REQUESTS',
];

const SDK_CODES = ['PLAY_SERVICES_NOT_AVAILABLE'];

export function socialAuthErrorMessage(e: any, t: (key: string, options?: any) => string): string {
  if (e instanceof SocialSignInError) {
    return SDK_CODES.includes(e.code) ? t(`auth.social.errors.${e.code}`) : t('auth.social.errors.generic');
  }
  if (e?.isAxiosError || e?.response || e?.request) {
    // Sans réponse, la requête n'a pas atteint le backend (URL / réseau).
    if (!e.response) return t('errors.serverUnreachable');
    const code = e.response.data?.code ?? e.response.data?.error;
    if (code && BACKEND_CODES.includes(code)) return t(`auth.social.errors.${code}`);
    // 503 PROVIDER_UNAVAILABLE : le backend n'a pas pu joindre Google / Apple — à réessayer.
    if (code === 'PROVIDER_UNAVAILABLE') return t('errors.serverUnreachableShort');
    if (e.response.status === 503) return t('auth.social.errors.PROVIDER_NOT_CONFIGURED');
    return e.response.data?.message ?? t('auth.social.errors.generic');
  }
  return t('auth.social.errors.generic');
}

/**
 * D-MKT-05, JP 28/10 — issue d'un refus de `/api/auth/oauth/link/confirm` ou `/link/resend`
 * (RG-MKT-55) : `retry` = message, la saisie reste ouverte (champ vidé sur code faux) ;
 * `close` = message puis fermeture (recommencer avec Google / Apple).
 */
export interface LinkConfirmError {
  message: string;
  action: 'retry' | 'close';
  /** Code faux : le champ est vidé. */
  clearCode: boolean;
}

export function linkConfirmErrorMessage(
  e: any,
  t: (key: string, options?: any) => string,
  provider: string,
): LinkConfirmError {
  const retry = (message: string, clearCode = false): LinkConfirmError => ({ message, action: 'retry', clearCode });
  const close = (message: string): LinkConfirmError => ({ message, action: 'close', clearCode: false });
  if (!e?.response) {
    return retry(e?.isAxiosError || e?.request ? t('errors.serverUnreachable') : t('auth.social.linkConfirm.errors.generic'));
  }
  const status = e.response.status;
  const code = e.response.data?.code ?? e.response.data?.error;
  if (code === 'LINK_CODE_INVALID' || status === 422) {
    return retry(t('auth.social.linkConfirm.errors.LINK_CODE_INVALID'), true);
  }
  if (code === 'LINK_CHALLENGE_INVALID' || status === 410) {
    return close(t('auth.social.linkConfirm.errors.LINK_CHALLENGE_INVALID', { provider }));
  }
  if (code === 'TOO_MANY_REQUESTS' || status === 429) {
    return retry(t('auth.social.linkConfirm.errors.TOO_MANY_REQUESTS'));
  }
  // 403 ACCOUNT_DISABLED, 409 ACCOUNT_LINK_AMBIGUOUS : la liaison ne se fera pas.
  if (code === 'ACCOUNT_DISABLED' || code === 'ACCOUNT_LINK_AMBIGUOUS') {
    return close(t(`auth.social.errors.${code}`));
  }
  return retry(t('auth.social.linkConfirm.errors.generic'));
}

/** `Retry-After` (secondes) d'un 429 de `/link/resend`, sinon `null`. */
export function retryAfterSeconds(e: any): number | null {
  if (e?.response?.status !== 429) return null;
  const raw = Number(e.response.headers?.['retry-after']);
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : null;
}
