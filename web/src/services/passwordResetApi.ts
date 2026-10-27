import { apiClient } from './apiClient';
import type { AuthResponse } from './authApi';

/**
 * Mot de passe oublié — endpoints COMMUNS à CMFIPraise et Shephr (`/api/auth/password/...`,
 * publics, plan `mot-de-passe-oublie-plan.md` §B3). `fromApp = "SHEPHR"` (MAJUSCULES exactes) :
 * le compte est résolu comme à la connexion Shephr (username, insensible à la casse) et l'e-mail
 * part de `no-reply@shephr.org`.
 *
 * D-WEB-05 (JP 27/10) — Parité mobile → web (décision n°3) : port de
 * `mobile/services/passwordResetApi.ts`, mêmes endpoints, même contrat.
 *
 * Les deux routes durent au moins 500 ms (temps constant côté serveur) : l'écran garde son
 * indicateur de chargement pendant ce temps.
 *
 * Erreurs : statut HTTP + `{ code }` — voir `utils/passwordResetErrors.ts`.
 * `/auth/password/` figure dans `CREDENTIAL_ENDPOINTS` (apiClient) : un refus n'est pas une session expirée.
 */
const FROM_APP = 'SHEPHR' as const;

/** Mirrors com.excellence.back.auth.passwordreset.ForgotPasswordResponse */
export interface ForgotPasswordResponse {
  /** Délai avant de pouvoir redemander un code (60 s). */
  resendAfterSeconds: number;
  /** Durée de validité du code (15 min). */
  codeValidityMinutes: number;
}

/**
 * Demande l'envoi d'un code. Réponse TOUJOURS 202 avec le même corps, que le compte existe ou
 * non (et même quand le délai de 60 s ou un plafond bloque l'envoi) : l'écran ne peut donc rien
 * en déduire et n'affiche jamais « compte introuvable ».
 *
 * @param identifier ce que la personne saisit pour se connecter, espaces de bord retirés. Le même
 *   identifiant doit être renvoyé tel quel à `resetPassword` : le code est lié à la demande.
 * @param language langue de l'interface (`fr` / `en`) : celle de l'e-mail.
 */
export async function requestPasswordReset(
  identifier: string,
  language: 'fr' | 'en',
): Promise<ForgotPasswordResponse> {
  const { data } = await apiClient.post<ForgotPasswordResponse>('/api/auth/password/forgot', {
    identifier,
    fromApp: FROM_APP,
    language,
  });
  return data;
}

/** Mirrors com.excellence.back.auth.passwordreset.ResetPasswordRequest (sans `fromApp`, ajouté ici). */
export interface ResetPasswordPayload {
  identifier: string;
  /** Exactement 6 chiffres, en chaîne (zéros de tête compris). */
  code: string;
  /** 6 caractères au moins, jamais nettoyé côté serveur. */
  newPassword: string;
}

/**
 * Change le mot de passe avec le code reçu. En succès, la réponse est EXACTEMENT celle de
 * `POST /api/church/auth/login` (`AuthResponseDTO`) : la session s'ouvre par le même chemin que
 * le login (`useAuth().establishSession`).
 */
export async function resetPassword(payload: ResetPasswordPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/auth/password/reset', {
    ...payload,
    fromApp: FROM_APP,
  });
  return data;
}
