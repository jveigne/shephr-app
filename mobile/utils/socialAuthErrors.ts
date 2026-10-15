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
  'PRIVILEGED_ACCOUNT_REQUIRES_PASSWORD',
  'ACCOUNT_DISABLED',
  'PROVIDER_NOT_CONFIGURED',
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
