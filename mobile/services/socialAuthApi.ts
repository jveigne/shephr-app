import { apiClient } from '@/services/apiClient';
import type { AuthResponse } from '@/services/authApi';

/**
 * Connexion simplifiée Google / Apple — endpoints COMMUNS à CMFIPraise et Shephr
 * (`/api/auth/oauth/...`, publics). L'app envoie la preuve d'identité obtenue du fournisseur ;
 * le backend la vérifie, trouve ou crée le compte et répond EXACTEMENT comme
 * `POST /api/church/auth/login` quand `app = "SHEPHR"` : la session s'ouvre donc par le même
 * chemin que le login mot de passe (`applySession` dans `AuthContext`).
 *
 * Erreurs : statut HTTP + `{ code }` — voir `utils/socialAuthErrors.ts`.
 */
const APP = 'SHEPHR' as const;

/**
 * Mirrors com.excellence.back.auth.federated.LinkConfirmationRequired — D-MKT-05, JP 28/10.
 * Réponse 202 de `/api/auth/oauth/google|apple` quand le compte a été trouvé par son identifiant
 * (`username`) sans que cette adresse ait jamais été prouvée : rien n'est lié, aucune session ;
 * un code à 6 chiffres part à l'adresse masquée. `challengeId` est un secret : il reste EN
 * MÉMOIRE (état du composant) — jamais route, AsyncStorage ni journal (RG-MKT-55).
 */
export interface LinkConfirmationRequired {
  status: 'LINK_CONFIRMATION_REQUIRED';
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

/** 200 `AuthResponse` (session ouverte) ou 202 `LinkConfirmationRequired` — D-MKT-05. */
export type SocialLoginResponse = AuthResponse | LinkConfirmationRequired;

export function isLinkConfirmation(r: SocialLoginResponse): r is LinkConfirmationRequired {
  return 'status' in r && (r as LinkConfirmationRequired).status === 'LINK_CONFIRMATION_REQUIRED';
}

export async function loginWithGoogleToken(idToken: string): Promise<SocialLoginResponse> {
  const { data } = await apiClient.post<SocialLoginResponse>('/api/auth/oauth/google', {
    idToken,
    app: APP,
  });
  return data;
}

export interface AppleLoginPayload {
  identityToken: string;
  authorizationCode: string;
  /** Nonce en clair ; Apple a reçu son SHA-256 (hex), le backend refait le calcul et compare. */
  rawNonce: string;
  /** Fournis par Apple à la PREMIÈRE autorisation seulement : envoyés quand on les a. */
  givenName?: string;
  familyName?: string;
  email?: string;
}

export async function loginWithAppleToken(payload: AppleLoginPayload): Promise<SocialLoginResponse> {
  const { data } = await apiClient.post<SocialLoginResponse>('/api/auth/oauth/apple', {
    ...payload,
    app: APP,
  });
  return data;
}

/**
 * D-MKT-05, JP 28/10 — `POST /api/auth/oauth/link/confirm` : le code reçu par e-mail relie le
 * compte Google / Apple du défi (et lui seul) puis ouvre la session (même réponse que le login).
 * Erreurs : 400 INVALID_REQUEST, 403 ACCOUNT_DISABLED, 409 ACCOUNT_LINK_AMBIGUOUS,
 * 410 LINK_CHALLENGE_INVALID, 422 LINK_CODE_INVALID, 429 TOO_MANY_REQUESTS (+ Retry-After).
 */
export async function confirmFederatedLink(challengeId: string, code: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/link/confirm', {
    challengeId,
    code,
  });
  return data;
}

/** D-MKT-05 — `POST /api/auth/oauth/link/resend` : nouveau code (l'ancien meurt), TTL inchangé. */
export async function resendFederatedLinkCode(
  challengeId: string,
): Promise<{ maskedEmail: string; resendInSeconds: number }> {
  const { data } = await apiClient.post<{ maskedEmail: string; resendInSeconds: number }>(
    '/api/auth/oauth/link/resend',
    { challengeId },
  );
  return data;
}
