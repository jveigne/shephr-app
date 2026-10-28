import type { TFunction } from 'i18next';

/**
 * Connexion Google / Apple (web) — refus traduits par CODE. D-PAY-06 / RG-PAY-45, JP 28/10 ; port de
 * `mobile/utils/socialAuthErrors.ts`. Contrat backend (`/api/auth/oauth/...`) : statut HTTP + `{ code }`
 * (on lit aussi `error`, le champ d'autres contrôleurs). La fermeture de la popup par l'utilisateur ne
 * passe jamais ici (aucun message, voir `components/SocialSignInButtons.tsx`).
 */
const KEY_OF: Record<string, string> = {
  INVALID_TOKEN: 'invalidToken',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  ACCOUNT_DISABLED: 'accountDisabled',
  PROVIDER_NOT_CONFIGURED: 'notConfigured',
  PROVIDER_UNAVAILABLE: 'unavailable',
  INVALID_REQUEST: 'generic',
};

export function socialAuthErrorMessage(e: unknown, t: TFunction): string {
  const err = e as { isAxiosError?: boolean; request?: unknown; response?: { status?: number; data?: { code?: string; error?: string } } };
  if (err?.isAxiosError || err?.response || err?.request) {
    // Sans réponse, la requête n'a pas atteint le backend (réseau).
    if (!err.response) return t('login.social.errors.unavailable');
    const code = err.response.data?.code ?? err.response.data?.error;
    if (code && KEY_OF[code]) return t(`login.social.errors.${KEY_OF[code]}`);
    if (err.response.status === 503) return t('login.social.errors.notConfigured');
  }
  return t('login.social.errors.generic');
}
