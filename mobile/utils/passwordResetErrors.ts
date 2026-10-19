/**
 * Mot de passe oublié — refus du backend classés pour l'écran (plan §B3, contrat §4).
 *
 * L'appli s'appuie sur `code`, jamais sur `message` (figé en français côté serveur). Une réponse
 * SANS `code` vient du `GlobalExceptionHandler` (panne imprévue, format `ApiError`) : elle n'est
 * pas un `INVALID_REQUEST`, même quand son statut vaut 400.
 */
export type PasswordResetErrorKind =
  | 'INVALID_REQUEST'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'TOO_MANY_REQUESTS'
  | 'NETWORK'
  | 'UNKNOWN';

export interface PasswordResetError {
  kind: PasswordResetErrorKind;
  /** `TOO_MANY_REQUESTS` seulement : en-tête `Retry-After`, en secondes (au moins 1). */
  retryAfterSeconds?: number;
}

const KNOWN_CODES: PasswordResetErrorKind[] = [
  'INVALID_REQUEST',
  'INVALID_CODE',
  'CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'TOO_MANY_REQUESTS',
];

export function classifyPasswordResetError(e: any): PasswordResetError {
  // Sans réponse, la requête n'a pas atteint le backend (URL / réseau).
  if (!e?.response) return { kind: e?.isAxiosError || e?.request ? 'NETWORK' : 'UNKNOWN' };
  const code = e.response.data?.code;
  if (!code || !KNOWN_CODES.includes(code)) return { kind: 'UNKNOWN' };
  if (code === 'TOO_MANY_REQUESTS') {
    const raw = Number(e.response.headers?.['retry-after']);
    // En-tête absent ou illisible : on bloque une minute plutôt que pas du tout.
    return { kind: code, retryAfterSeconds: Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60 };
  }
  return { kind: code };
}

/**
 * Message à afficher. `remainingSeconds` : pour `TOO_MANY_REQUESTS`, le temps qu'il reste à
 * attendre (décompté par l'écran), arrondi à la minute supérieure.
 */
export function passwordResetErrorMessage(
  err: PasswordResetError,
  t: (key: string, options?: any) => string,
  remainingSeconds?: number,
): string {
  switch (err.kind) {
    case 'NETWORK':
      return t('errors.serverUnreachable');
    case 'UNKNOWN':
      return t('passwordReset.errors.generic');
    case 'TOO_MANY_REQUESTS': {
      const seconds = remainingSeconds ?? err.retryAfterSeconds ?? 60;
      return t('passwordReset.errors.TOO_MANY_REQUESTS', {
        minutes: Math.max(1, Math.ceil(seconds / 60)),
      });
    }
    default:
      return t(`passwordReset.errors.${err.kind}`);
  }
}
