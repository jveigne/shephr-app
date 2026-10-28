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
  // D-MKT-05, JP 28/10 (RG-MKT-56) : plus de message générique pour ces deux refus.
  ACCOUNT_LINK_AMBIGUOUS: 'linkAmbiguous',
  TOO_MANY_REQUESTS: 'tooManyRequests',
};

export function socialAuthErrorMessage(e: unknown, t: TFunction): string {
  const err = e as { isAxiosError?: boolean; request?: unknown; response?: { status?: number; data?: { code?: string; error?: string } } };
  if (err?.isAxiosError || err?.response || err?.request) {
    // Sans réponse, la requête n'a pas atteint le backend (réseau).
    if (!err.response) return t('login.social.errors.unavailable');
    const code = err.response.data?.code ?? err.response.data?.error;
    if (code && KEY_OF[code]) return t(`login.social.errors.${KEY_OF[code]}`);
    if (err.response.status === 503) return t('login.social.errors.notConfigured');
    if (err.response.status === 429) return t('login.social.errors.tooManyRequests');
  }
  return t('login.social.errors.generic');
}

/**
 * Saisie du code de confirmation (D-MKT-05, JP 28/10 — RG-MKT-55 / 56) : message traduit et suite à
 * donner. `close` = le défi est mort ou le refus est définitif (410, 409, 403) : la modale se ferme et
 * le message s'affiche sous le formulaire de /login ; sinon la modale reste ouverte (422 : champ vidé).
 */
export function linkConfirmErrorMessage(
  e: unknown,
  t: TFunction,
  provider: string,
): { message: string; close: boolean; clearCode: boolean } {
  const err = e as { response?: { status?: number; data?: { code?: string; error?: string } } };
  const status = err?.response?.status;
  const code = err?.response?.data?.code ?? err?.response?.data?.error;
  if (!err?.response) return { message: t('login.social.linkConfirm.errors.generic'), close: false, clearCode: false };
  if (code === 'LINK_CODE_INVALID' || status === 422) {
    return { message: t('login.social.linkConfirm.errors.codeInvalid'), close: false, clearCode: true };
  }
  if (code === 'LINK_CHALLENGE_INVALID' || status === 410) {
    return { message: t('login.social.linkConfirm.errors.challengeInvalid', { provider }), close: true, clearCode: true };
  }
  if (code === 'TOO_MANY_REQUESTS' || status === 429) {
    return { message: t('login.social.linkConfirm.errors.tooManyRequests'), close: false, clearCode: false };
  }
  if (code === 'ACCOUNT_LINK_AMBIGUOUS') return { message: t('login.social.errors.linkAmbiguous'), close: true, clearCode: true };
  if (code === 'ACCOUNT_DISABLED') return { message: t('login.social.errors.accountDisabled'), close: true, clearCode: true };
  return { message: t('login.social.linkConfirm.errors.generic'), close: false, clearCode: false };
}
