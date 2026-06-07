import { apiClient } from './apiClient';

// Notifications in-app de l'utilisateur courant (Lot 4.4 — UC-MBR-09).

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  source: string;
  createdAt: string;
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
