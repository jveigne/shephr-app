import Constants from 'expo-constants';
import { apiClient } from './apiClient';

// Campagnes in-app (23/07 — porté de CMFIPraise) : GET /api/notifications, endpoint PUBLIC,
// ciblage par app (TargetApp.Shephr), version, pays et ministère (optionnel). Types :
// APP_UPDATE (mise à jour, éventuellement FORCÉE, avec liens stores), INFO, PROMO.

export type CampaignType = 'APP_UPDATE' | 'INFO' | 'PROMO';
export type CampaignImagePosition = 'TOP' | 'BACKGROUND' | 'NONE';

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
export async function getCampaigns(params: {
  country?: string | null;
  ministryId?: string | null;
}): Promise<CampaignNotification[]> {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const { data } = await apiClient.get<CampaignNotification[]>('/api/notifications', {
    params: {
      app: 'Shephr',
      version,
      country: params.country ?? 'UNKNOWN',
      ...(params.ministryId ? { ministry: params.ministryId } : {}),
    },
  });
  return data;
}
