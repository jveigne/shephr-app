import { apiClient } from '@/services/apiClient';

// Notifications in-app de l'utilisateur courant (Lot 4.4 — UC-MBR-09).

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  source: string;
  createdAt: string;
  /**
   * Lot HIE (JP 28/10, RG-HIE-24) : identifiant de l'objet visé — pour `SUPERVISION_REQUEST`, l'id
   * de la demande de supervision. Additif, toutes sources ; absent d'un serveur antérieur.
   */
  refEntityId?: string | null;
}

export async function getUnreadNotifications(): Promise<UserNotification[]> {
  const { data } = await apiClient.get<UserNotification[]>(
    '/api/church/me/notifications/unread',
  );
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/api/church/me/notifications/${id}/read`);
}
