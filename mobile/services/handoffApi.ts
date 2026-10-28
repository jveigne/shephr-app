import { apiClient } from '@/services/apiClient';

/**
 * Jeton de passage app → web (D-PAY-05, JP 28/10 ; plan 28/10 `03_Plan_Offres_Paiement_Connexion.md`
 * §5.1 / §7.2). Un compte connecté sur l'app demande un jeton à usage UNIQUE (120 s, haché côté
 * serveur) ; « En savoir plus » ouvre `/offres` avec ce jeton dans le FRAGMENT (`#handoff=…`,
 * RG-PAY-12), et la page web l'échange contre une session. Le jeton ne porte aucune URL
 * (RG-PAY-11) : la destination est fixée ici, par `offersUrl`.
 *
 * Ne JAMAIS journaliser le jeton ni l'URL qui le porte.
 */

/** Mirrors com.excellence.back.auth.handoff.HandoffCreated — D-PAY-05, JP 28/10. */
export interface HandoffCreated {
  /** 43 caractères base64url, rendu une seule fois en clair (RG-PAY-02). */
  handoffToken: string;
  /** ISO-8601 UTC (création + 120 s, RG-PAY-04). */
  expiresAt: string;
}

/** RG-PAY-12 (D-PAY-05, JP 28/10) : au-delà de 3 s, on ouvre le lien simple. */
export const HANDOFF_TIMEOUT_MS = 3000;

/**
 * `POST /api/church/auth/handoff` (authentifié, corps vide) → `201 HandoffCreated`.
 * Le jeton de session est passé explicitement : le jeton de passage est lié au compte affiché par
 * l'app à ce moment, même si le stockage change pendant l'appel (cf. intercepteur d'`apiClient`).
 * Erreurs : 401 / 403 `HANDOFF_ACCOUNT_DISABLED` / 429 — l'appelant retombe sur le lien simple.
 */
export async function createHandoff(sessionToken: string): Promise<HandoffCreated> {
  const { data } = await apiClient.post<HandoffCreated>('/api/church/auth/handoff', undefined, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    timeout: HANDOFF_TIMEOUT_MS,
  });
  return data;
}
