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

export async function loginWithGoogleToken(idToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/google', {
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

export async function loginWithAppleToken(payload: AppleLoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/oauth/apple', {
    ...payload,
    app: APP,
  });
  return data;
}
