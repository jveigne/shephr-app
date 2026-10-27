import { apiClient } from './apiClient';

/**
 * Campagnes in-app (23/07 — porté de CMFIPraise) : `GET /api/notifications`, endpoint PUBLIC,
 * ciblage par app (TargetApp.Shephr), version, pays et ministère (optionnel). Types :
 * APP_UPDATE (mise à jour d'un binaire, liens stores), INFO, PROMO.
 *
 * D-WEB-06 (JP 27/10) — Parité mobile → web (décision n°3) : port de `mobile/services/appNotificationsApi.ts`.
 * `version` est omis : il n'influe que sur `forceUpdate` (AppNotificationServiceImpl), propre aux binaires ;
 * le web écarte de toute façon les campagnes APP_UPDATE.
 */

export type CampaignType = 'APP_UPDATE' | 'INFO' | 'PROMO';
export type CampaignImagePosition = 'TOP' | 'BACKGROUND' | 'NONE';

/** Mirrors com.excellence.back.notification.dto.NotificationResponseDTO (sous-ensemble lu par la porte) */
export interface CampaignNotification {
  id: string;
  title: string;
  message: string;
  type: CampaignType;
  forceUpdate: boolean;
  iosUrl: string | null;
  androidUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imagePosition: CampaignImagePosition;
  priority: number;
}

/** Campagnes actives pour Shephr — triées par priorité côté backend. */
export async function getCampaigns(ministryId: string | null | undefined): Promise<CampaignNotification[]> {
  const { data } = await apiClient.get<CampaignNotification[]>('/api/notifications', {
    params: {
      app: 'Shephr',
      country: 'UNKNOWN',
      ...(ministryId ? { ministry: ministryId } : {}),
    },
  });
  return data;
}
