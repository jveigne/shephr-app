/**
 * Mot de passe oublié — refus du backend classés pour l'écran (plan §B3, contrat §4).
 * D-WEB-05 (JP 27/10) : port de `mobile/utils/passwordResetErrors.ts`.
 *
 * L'interface s'appuie sur `code`, jamais sur `message` (figé en français côté serveur). Une
 * réponse SANS `code` vient du `GlobalExceptionHandler` (panne imprévue, format `ApiError`) : elle
 * n'est pas un `INVALID_REQUEST`, même quand son statut vaut 400.
 */
import type { TFunction } from 'i18next';

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

interface AxiosLikeError {
  isAxiosError?: boolean;
  request?: unknown;
  response?: { data?: { code?: string }; headers?: Record<string, unknown> };
}

export function classifyPasswordResetError(e: unknown): PasswordResetError {
  const err = e as AxiosLikeError | null | undefined;
  // Sans réponse, la requête n'a pas atteint le backend (URL / réseau / CORS).
  if (!err?.response) return { kind: err?.isAxiosError || err?.request ? 'NETWORK' : 'UNKNOWN' };
  const code = err.response.data?.code as PasswordResetErrorKind | undefined;
  if (!code || !KNOWN_CODES.includes(code)) return { kind: 'UNKNOWN' };
  if (code === 'TOO_MANY_REQUESTS') {
    // Sur le web, `Retry-After` n'est lisible que s'il est exposé en CORS (Access-Control-Expose-Headers) :
    // absent, illisible ou masqué, on bloque une minute plutôt que pas du tout.
    const raw = Number(err.response.headers?.['retry-after']);
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
  t: TFunction,
  remainingSeconds?: number,
): string {
  if (err.kind === 'TOO_MANY_REQUESTS') {
    const seconds = remainingSeconds ?? err.retryAfterSeconds ?? 60;
    return t('forgotPassword.errors.TOO_MANY_REQUESTS', {
      minutes: Math.max(1, Math.ceil(seconds / 60)),
    });
  }
  return t(`forgotPassword.errors.${err.kind}`);
}
