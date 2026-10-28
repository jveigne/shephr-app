import { apiClient } from './apiClient';
import type { AuthResponse } from './authApi';

/**
 * Connexion Google / Apple sur le web — D-PAY-06, JP 28/10 (lève l'exception D-WEB-01 sur ce point).
 * Port de `mobile/services/socialAuthApi.ts` : mêmes routes publiques `/api/auth/oauth/...`, communes
 * à CMFIPraise et Shephr ; avec `app = "SHEPHR"`, le backend répond EXACTEMENT comme
 * `POST /api/church/auth/login` (session Shephr) — la session s'ouvre donc par `establishSession`.
 * D-ABO-14 (JP 23/10) : ouverte à tous les comptes, rôles compris. D-PAY-08 : rien d'autre ne change
 * dans l'authentification. Erreurs : statut HTTP + `{ code }` — `utils/socialAuthErrors.ts`.
 */
const APP = 'SHEPHR' as const;

/**
 * Mirrors com.excellence.back.auth.federated.LinkConfirmationRequired — D-MKT-05, JP 28/10
 * (RG-MKT-41 / 49 / 55). Réponse 202 de `/api/auth/oauth/google|apple` quand le serveur a trouvé le
 * compte par son IDENTIFIANT (`username`) sans que cette adresse ait jamais été prouvée : rien n'est
 * lié, aucune session ; un code à 6 chiffres part à cette adresse. `challengeId` est un SECRET : il
 * reste en mémoire seulement (jamais URL, route, `localStorage`, journal).
 */
export interface LinkConfirmationRequired {
  status: 'LINK_CONFIRMATION_REQUIRED';
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

/** 200 `AuthResponse` (connexion) ou 202 `LinkConfirmationRequired` (défi) — D-MKT-05. */
export type SocialLoginResponse = AuthResponse | LinkConfirmationRequired;

export function isLinkConfirmation(r: SocialLoginResponse): r is LinkConfirmationRequired {
  return 'status' in r && (r as LinkConfirmationRequired).status === 'LINK_CONFIRMATION_REQUIRED';
}

/** `idToken` = `credential` rendu par Google Identity Services (`aud` = client ID Web, RG-PAY-40). */
export async function loginWithGoogleToken(idToken: string): Promise<SocialLoginResponse> {
  const { data } = await apiClient.post<SocialLoginResponse>('/api/auth/oauth/google', { idToken, app: APP });
  return data;
}

export interface AppleLoginPayload {
  identityToken: string;
  authorizationCode: string;
  /** Nonce en clair ; Apple a reçu son SHA-256 (hex), le backend refait le calcul et compare (RG-PAY-41). */
  rawNonce: string;
  /** Fournis par Apple à la PREMIÈRE autorisation seulement : envoyés quand on les a. */
  givenName?: string;
  familyName?: string;
  email?: string;
}

export async function loginWithAppleToken(payload: AppleLoginPayload): Promise<SocialLoginResponse> {
  const { data } = await apiClient.post<SocialLoginResponse>('/api/auth/oauth/apple', { ...payload, app: APP });
  return data;
}

/**
 * D-MKT-05 (RG-MKT-50) : `POST /api/auth/oauth/link/confirm` (public, Bearer ignoré ; `/auth/oauth/` est
 * dans `CREDENTIAL_ENDPOINTS`) → `AuthResponse` du login Shephr, identité liée, identifiant prouvé.
 * Refus : 400 `INVALID_REQUEST`, 403 `ACCOUNT_DISABLED`, 409 `ACCOUNT_LINK_AMBIGUOUS`,
 * 410 `LINK_CHALLENGE_INVALID`, 422 `LINK_CODE_INVALID`, 429 `TOO_MANY_REQUESTS`.
 */
export async function confirmFederatedLink(challengeId: string, code: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/link/confirm', { challengeId, code });
  return data;
}

/** D-MKT-05 (RG-MKT-47) : nouveau code (≥ 60 s, 3 renvois max) — 410 / 429 sinon. */
export async function resendFederatedLinkCode(challengeId: string): Promise<{ maskedEmail: string; resendInSeconds: number }> {
  const { data } = await apiClient.post<{ maskedEmail: string; resendInSeconds: number }>('/api/auth/oauth/link/resend', { challengeId });
  return data;
}
