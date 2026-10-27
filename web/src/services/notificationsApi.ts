import { apiClient } from './apiClient';

/**
 * Notifications in-app de l'utilisateur courant (Lot 4.4 — UC-MBR-09).
 * D-WEB-06 (JP 27/10) — Parité mobile → web (décision n°3) : port de `mobile/services/notificationsApi.ts`,
 * lu par `components/NotificationGate.tsx`.
 */

/** Mirrors com.excellence.back.notification.user.dto.UserNotificationResponse */
export interface UserNotification {
  id: string;
  title: string;
  message: string;
  /** `GOAL_REMINDER`, `DONATION_DIGEST`, `DONATION_REMINDER`… (UserNotification#source). */
  source: string;
  /**
   * Entité liée à la notification (additif, toutes sources). D-HIE-06 (JP 28/10) : pour
   * `SUPERVISION_REQUEST`, l'id de la demande de supervision (RG-HIE-24).
   */
  refEntityId?: string | null;
  createdAt: string;
}

export async function getUnreadNotifications(): Promise<UserNotification[]> {
  const { data } = await apiClient.get<UserNotification[]>('/api/church/me/notifications/unread');
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/api/church/me/notifications/${encodeURIComponent(id)}/read`);
}
