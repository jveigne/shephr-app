import { apiClient } from './apiClient';

/**
 * Lot T11 (docs/notifications.md §2.3, décision J-2 du 14/09) — RELANCE GROUPÉE des
 * non-déclarants par le trésorier de leur périmètre.
 *
 * Symétrique exact du rappel groupé Goals (lot G3) : mêmes règles, mêmes retours, un seul
 * comportement à expliquer à l'utilisateur.
 *
 * - destinataires = les personnes du périmètre n'ayant **rien déclaré** sur la période ;
 * - anti-spam 24 h **par personne** : les déjà-relancés sont **sautés**, l'envoi ne casse pas ;
 * - garde serveur : être trésorier **et** que le nœud demandé soit dans son périmètre — 403 sinon.
 *   Le gating de l'écran ne remplace pas cette garde (point d'attention n°9 du CLAUDE.md).
 *
 * Il n'y a **rien à faire côté affichage** pour la relance elle-même : elle s'écrit en
 * `UserNotification`, que `components/NotificationGate.tsx` empile déjà à l'ouverture de l'app.
 */

/** Mirrors com.excellence.back.donation.notification.dto.ReminderScope */
export type ReminderScope = 'NODE';

/**
 * Mirrors com.excellence.back.donation.notification.dto.ReminderScopeResponse
 *
 * `/me` ne donne que des identifiants (`treasurerNodeIds`) et la liste nominative des trésoriers
 * est réservée au SECRÉTARIAT : c'est cette route qui rend à l'intéressé ses nœuds avec leur nom.
 */
export interface ReminderScopeResponse {
  id: string;
  name: string;
  /** NATION | REGION | CITY | ASSEMBLY */
  type: string;
  /** Assemblées couvertes — « un trésorier plus haut voit plus large », rendu lisible. */
  assemblyCount: number;
}

/** Mirrors com.excellence.back.donation.notification.dto.BulkReminderRequest */
export interface BulkReminderRequest {
  scope?: ReminderScope;
  scopeId: string;
  message?: string;
  /** `yyyy-MM-dd`. Absent : le premier jour du mois courant, côté serveur. */
  from?: string;
  /** `yyyy-MM-dd`. Absent : aujourd'hui, côté serveur. */
  to?: string;
}

/**
 * Mirrors com.excellence.back.donation.notification.dto.BulkReminderResponse
 *
 * Les trois compteurs sont le cœur du contrat : le trésorier doit pouvoir distinguer « je n'ai
 * relancé personne parce que tout le monde a donné » de « je n'ai relancé personne parce que je
 * viens de le faire ». Sans eux, un envoi sans effet visible passe pour une panne.
 *
 * ⚠️ Le rappel groupé Goals (lot G3) rend les mêmes concepts sous des noms ANGLAIS
 * (`sent` / `alreadyReminded` / `alreadySubmitted` / `sentToNames`). Divergence connue, à unifier
 * à la consolidation — voir le commentaire de `BulkReminderResponse.java` côté backend.
 */
export interface BulkReminderResponse {
  envoyes: number;
  dejaRelances: number;
  dejaDeclares: number;
  scopeName: string;
  from: string;
  to: string;
  envoyesA: string[];
}

/** Mes périmètres de relance — 403 pour qui n'est pas trésorier. */
export async function listReminderScopes(): Promise<ReminderScopeResponse[]> {
  const { data } = await apiClient.get<ReminderScopeResponse[]>(
    '/api/church/donations/reminders/scopes',
  );
  return data;
}

/** Relance les non-déclarants du périmètre. Ne lève pas pour un déjà-relancé : il est compté, pas envoyé. */
export async function sendBulkReminder(
  request: BulkReminderRequest,
): Promise<BulkReminderResponse> {
  const { data } = await apiClient.post<BulkReminderResponse>(
    '/api/church/donations/reminders/bulk',
    { scope: 'NODE', ...request },
  );
  return data;
}
