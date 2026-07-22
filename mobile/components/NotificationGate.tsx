import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Image, Linking, Platform, AppState, type AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Card from './Card';
import Button from './Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getUnreadNotifications,
  markNotificationRead,
  type UserNotification,
} from '../services/notificationsApi';
import { getCampaigns, type CampaignNotification } from '../services/appNotificationsApi';

/**
 * Porte d'entrée des messages à l'ouverture — UNE seule modale à la fois, dans l'ordre :
 * 1) CAMPAGNES serveur (23/07, porté de CMFIPraise) : APP_UPDATE (mise à jour, forcée ou non,
 *    liens stores), INFO, PROMO — snooze 3 jours à la fermeture, re-check au premier plan ;
 * 2) RAPPELS personnels (UC-MBR-09, Lot 4.4) : non-lus empilés, « OK » = lu,
 *    « Plus tard » = réapparaît à la prochaine session.
 */
const CAMPAIGN_STORAGE_KEY = 'shephr.campaigns.state';
const CAMPAIGN_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours

type CampaignState = Record<string, { snoozedUntil: number }>;

export default function NotificationGate() {
  const { t } = useLanguage();
  const { isAuthenticated, me } = useAuth();
  const [campaign, setCampaign] = useState<CampaignNotification | null>(null);
  const [queue, setQueue] = useState<UserNotification[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  const loadCampaigns = useCallback(async () => {
    try {
      const campaigns = await getCampaigns({ ministryId: me?.ministryId ?? null });
      if (campaigns.length === 0) {
        setCampaign(null);
        return;
      }
      const raw = await AsyncStorage.getItem(CAMPAIGN_STORAGE_KEY);
      const state: CampaignState = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      // Le backend trie par priorité — première non-snoozée (un forceUpdate ignore le snooze).
      const toShow = campaigns.find((c) => {
        if (c.forceUpdate) return true;
        const entry = state[c.id];
        return !entry || entry.snoozedUntil <= now;
      });
      setCampaign(toShow ?? null);
    } catch {
      // silencieux : un échec de chargement ne doit pas bloquer l'app
    }
  }, [me?.ministryId]);

  const loadReminders = useCallback(async () => {
    try {
      setQueue(await getUnreadNotifications());
    } catch {
      // silencieux : un échec de chargement ne doit pas bloquer l'app
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadCampaigns();
      loadReminders();
    } else {
      setCampaign(null);
      setQueue([]);
      setDismissed(false);
    }
  }, [isAuthenticated, loadCampaigns, loadReminders]);

  // Re-check des campagnes quand l'app revient au premier plan (comme CMFIPraise).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active' && isAuthenticated) {
        loadCampaigns();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [isAuthenticated, loadCampaigns]);

  const snoozeCampaign = async () => {
    if (!campaign) return;
    try {
      const raw = await AsyncStorage.getItem(CAMPAIGN_STORAGE_KEY);
      const state: CampaignState = raw ? JSON.parse(raw) : {};
      state[campaign.id] = { snoozedUntil: Date.now() + CAMPAIGN_SNOOZE_MS };
      await AsyncStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // au pire la campagne réapparaîtra
    } finally {
      setCampaign(null);
    }
  };

  const openStore = () => {
    if (!campaign) return;
    const url = Platform.OS === 'ios'
      ? campaign.iosUrl ?? campaign.androidUrl
      : campaign.androidUrl ?? campaign.iosUrl;
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  // ---- 1) Campagne serveur (prioritaire — une seule modale à la fois) ----
  if (campaign) {
    const isUpdate = campaign.type === 'APP_UPDATE';
    return (
      <Modal visible transparent animationType="fade"
        onRequestClose={campaign.forceUpdate ? () => {} : snoozeCampaign}>
        <View style={styles.backdrop}>
          <Card style={styles.card}>
            {campaign.imageUrl && campaign.imagePosition !== 'NONE' ? (
              <Image
                source={{ uri: campaign.imageUrl }}
                accessibilityLabel={campaign.imageAlt ?? undefined}
                style={styles.campaignImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.iconBubble}>
                <Ionicons
                  name={isUpdate ? 'cloud-download-outline' : campaign.type === 'PROMO' ? 'gift-outline' : 'megaphone-outline'}
                  size={24}
                  color={colors.moss}
                />
              </View>
            )}
            <Text style={styles.title}>{campaign.title}</Text>
            <Text style={styles.message}>{campaign.message}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              {!campaign.forceUpdate && (
                <Button label={t('notifications.later')} variant="ghost" onPress={snoozeCampaign} style={{ flex: 1 }} height={48} />
              )}
              {isUpdate ? (
                <Button label={t('notifications.updateNow')} onPress={openStore} style={{ flex: 1 }} height={48} />
              ) : (
                <Button label={t('common.ok')} onPress={snoozeCampaign} style={{ flex: 1 }} height={48} />
              )}
            </View>
          </Card>
        </View>
      </Modal>
    );
  }

  // ---- 2) Rappels personnels (Lot 4.4, comportement inchangé) ----
  const current = queue[0] ?? null;
  if (!current || dismissed) return null;

  const onAck = async () => {
    try {
      await markNotificationRead(current.id);
    } catch {
      // au pire la notification réapparaîtra à la prochaine session
    }
    setQueue((q) => q.slice(1));
  };

  const onLater = () => setDismissed(true); // réapparaît à la prochaine session

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.iconBubble}>
            <Ionicons name="notifications-outline" size={24} color={colors.moss} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.message}</Text>
          {queue.length > 1 && (
            <Text style={styles.counter}>{t('notifications.morePending', { count: queue.length - 1 })}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button label={t('notifications.later')} variant="ghost" onPress={onLater} style={{ flex: 1 }} height={48} />
            <Button label={t('common.ok')} onPress={onAck} style={{ flex: 1 }} height={48} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { paddingHorizontal: 22, paddingVertical: 24, alignItems: 'center' },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campaignImage: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginTop: 14,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  counter: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink3,
    marginTop: 10,
  },
});
