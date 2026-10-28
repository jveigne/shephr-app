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

/** `idToken` = `credential` rendu par Google Identity Services (`aud` = client ID Web, RG-PAY-40). */
export async function loginWithGoogleToken(idToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/google', { idToken, app: APP });
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

export async function loginWithAppleToken(payload: AppleLoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/apple', { ...payload, app: APP });
  return data;
}
