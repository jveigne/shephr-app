import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Image, Linking, Platform, AppState, type AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getUnreadNotifications,
  markNotificationRead,
  type UserNotification,
} from '@/services/notificationsApi';
import { getCampaigns, type CampaignNotification } from '@/services/appNotificationsApi';
import {
  SOURCE_SUPERVISION_REQUEST,
  acceptSupervisionRequest,
  fetchSupervisionOverview,
  refuseSupervisionRequest,
  type SupervisionOverview,
} from '@/services/leadersApi';
import { confirmDialog, notify } from '@/utils/dialogs';
import { abonnerRechargement, declarerGateOuverte } from '@/components/push/fileNotifications';
import { useConduireParSource } from '@/components/push/routagePush';

/**
 * Porte d'entrée des messages à l'ouverture — UNE seule modale à la fois, dans l'ordre :
 * 1) CAMPAGNES serveur (23/07, porté de CMFIPraise) : APP_UPDATE (mise à jour, forcée ou non,
 *    liens stores), INFO, PROMO — snooze 3 jours à la fermeture, re-check au premier plan ;
 * 2) RAPPELS personnels (UC-MBR-09, Lot 4.4) : non-lus empilés, « OK » = lu,
 *    « Plus tard » = réapparaît à la prochaine session.
 *    Lot HIE (D-HIE-06, JP 28/10) : une notification `SUPERVISION_REQUEST` (un dirigeant demande à
 *    me suivre) ouvre une modale Valider / Refuser / Plus tard (RG-HIE-27). Elle n'est JAMAIS
 *    acquittée par `POST /read` : le serveur la marque lue quand la demande quitte PENDING
 *    (RG-HIE-25) — sauf si la demande n'est plus dans `incoming` (déjà traitée) : lue en silence,
 *    modale suivante. « Plus tard » la masque pour la session seulement. Valider REMPLACE mon
 *    superviseur actuel : confirmation explicite si j'en ai un autre (RG-HIE-28).
 */
const CAMPAIGN_STORAGE_KEY = 'shephr.campaigns.state';
const CAMPAIGN_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours

type CampaignState = Record<string, { snoozedUntil: number }>;

export default function NotificationGate() {
  const { t } = useLanguage();
  const { isAuthenticated, me } = useAuth();
  // 16/09 — la modale mène enfin quelque part. Le routage par `source` existait déjà pour le tap
  // sur une bannière push, et restait donc inatteignable tant que manquent les clés APNs /
  // Firebase. On le réutilise ici tel quel : une seule table de destinations, deux points
  // d'entrée. (§2 de `docs/dons-reste-a-faire.md`.)
  const { conduire, estActionnable } = useConduireParSource();
  const [campaign, setCampaign] = useState<CampaignNotification | null>(null);
  const [queue, setQueue] = useState<UserNotification[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  // D-HIE-06 : aperçu de supervision lu pour la notification affichée (clé = id de notification).
  const [supervision, setSupervision] = useState<{ notificationId: string; overview: SupervisionOverview } | null>(
    null,
  );
  const [supervisionBusy, setSupervisionBusy] = useState(false);

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

  // ---- N4c (J-3 14/09) — le push ne remplace pas cette porte, il la réveille ----
  // Un tap sur une bannière recharge la file : l'application était en arrière-plan, et rien
  // n'aurait rechargé sans ça. Le push TRANSPORTE une notification déjà écrite en base — qui a
  // refusé les notifications système, dont le jeton est mort, ou qui a coupé l'interrupteur
  // « Rappels », la lit quand même ici, à l'ouverture. Cet abonnement n'ajoute aucun affichage.
  useEffect(
    () =>
      abonnerRechargement((notificationId) => {
        setDismissed(false);
        void (async () => {
          try {
            const unread = await getUnreadNotifications();
            // Cas mono-destinataire : la notification tapée passe devant, les autres suivent.
            const visee = notificationId ? unread.filter((n) => n.id === notificationId) : [];
            const autres = notificationId ? unread.filter((n) => n.id !== notificationId) : unread;
            setQueue([...visee, ...autres]);
          } catch {
            // silencieux : un échec de chargement ne doit pas bloquer l'app
          }
        })();
      }),
    [],
  );

  // ---- D-HIE-06 / RG-HIE-27 : demande de supervision en tête de file ----
  // R8 (D-HIE-06 / RG-HIE-27, JP 29/10) : deux files dans la même liste. « Plus tard » / « Voir » sur
  // un RAPPEL (`dismissed`) ne masque que les rappels ; une demande de supervision reste présentée
  // (son propre « Plus tard » la retire de la file pour la session).
  const head =
    queue.find((n) => n.source === SOURCE_SUPERVISION_REQUEST || !dismissed) ?? null;
  const headIsSupervision = !!head && head.source === SOURCE_SUPERVISION_REQUEST;
  useEffect(() => {
    if (!head || !headIsSupervision || campaign) return;
    let active = true;
    fetchSupervisionOverview()
      .then((overview) => {
        if (!active) return;
        const pending = overview.incoming.some((r) => r.id === head.refEntityId);
        if (!pending) {
          // Demande déjà traitée (ou annulée par le demandeur) : lue en silence, modale suivante.
          markNotificationRead(head.id).catch(() => undefined);
          setQueue((q) => q.filter((n) => n.id !== head.id));
          return;
        }
        setSupervision({ notificationId: head.id, overview });
      })
      .catch(() => {
        // Panne : on n'acquitte rien ; la notification reviendra à la prochaine session.
        if (active) setQueue((q) => q.filter((n) => n.id !== head.id));
      });
    return () => {
      active = false;
    };
  }, [head, headIsSupervision, campaign]);

  // L'invitation d'activation du push (N4b) attend que cette porte soit libre : deux `Modal`
  // affichées en même temps ne laissent voir que la dernière, et le message déjà écrit passe
  // avant la demande de permission.
  const modaleAffichee = !!campaign || head != null;
  useEffect(() => {
    declarerGateOuverte(modaleAffichee);
    return () => declarerGateOuverte(false);
  }, [modaleAffichee]);

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
  const current = head;
  if (!current) return null;

  // ---- 2 bis) Demande de supervision (D-HIE-06, RG-HIE-27 / 28) ----
  if (headIsSupervision) {
    const overview = supervision?.notificationId === current.id ? supervision.overview : null;
    const request = overview?.incoming.find((r) => r.id === current.refEntityId) ?? null;
    if (!overview || !request) return null; // aperçu en cours de lecture
    const requesterName = request.requester.fullName;
    const currentSupervisor = overview.supervisor;
    const replacing = currentSupervisor != null && currentSupervisor.id !== request.requester.id;
    const next = () => {
      setSupervision(null);
      setQueue((q) => q.filter((n) => n.id !== current.id));
    };
    const decide = async (accept: boolean) => {
      if (supervisionBusy) return;
      if (accept && replacing) {
        const ok = await confirmDialog(
          t('hierarchy.leadership.acceptReplaceTitle'),
          t('hierarchy.leadership.acceptReplace', { name: currentSupervisor!.fullName }),
          t('notifications.supervision.accept'),
        );
        if (!ok) return;
      }
      setSupervisionBusy(true);
      try {
        await (accept ? acceptSupervisionRequest(request.id) : refuseSupervisionRequest(request.id));
        // Le serveur a marqué la notification lue (RG-HIE-25) : aucun POST /read ici.
        notify(
          t('common.appName'),
          accept
            ? t('hierarchy.leadership.accepted', { name: requesterName })
            : t('hierarchy.leadership.refused'),
        );
        next();
      } catch (e: any) {
        const code: string | null = e?.response?.data?.error ?? null;
        const key = `hierarchy.leadership.errors.${code}`;
        const translated = t(key);
        // R7 (RG-HIE-32, JP 29/10) : code inconnu → message générique traduit, jamais le texte du serveur.
        notify(
          t('hierarchy.leadership.actionFailed'),
          translated !== key ? translated : t('hierarchy.leadership.errors.generic'),
        );
        if (code === 'SUPERVISION_REQUEST_NOT_PENDING') next();
      } finally {
        setSupervisionBusy(false);
      }
    };
    // « Plus tard » : masquée pour la session (non lue, elle reviendra à la prochaine ouverture).
    const later = () => next();

    return (
      <Modal visible transparent animationType="fade" onRequestClose={later}>
        <View style={styles.backdrop}>
          <Card style={styles.card}>
            <View style={styles.iconBubble}>
              <Ionicons name="people-circle-outline" size={26} color={colors.moss} />
            </View>
            <Text style={styles.title}>{t('notifications.supervision.title')}</Text>
            <Text style={styles.message}>{t('notifications.supervision.message', { name: requesterName })}</Text>
            {replacing && (
              <Text style={styles.warning}>
                {t('notifications.supervision.replaceWarning', { name: currentSupervisor!.fullName })}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Button
                label={t('notifications.supervision.refuse')}
                variant="ghost"
                onPress={() => void decide(false)}
                disabled={supervisionBusy}
                style={{ flex: 1 }}
                height={48}
              />
              <Button
                label={t('notifications.supervision.accept')}
                onPress={() => void decide(true)}
                loading={supervisionBusy}
                style={{ flex: 1 }}
                height={48}
              />
            </View>
            <Button
              label={t('notifications.supervision.later')}
              variant="ghost"
              onPress={later}
              disabled={supervisionBusy}
              fullWidth
              height={42}
              style={{ marginTop: 8 }}
            />
          </Card>
        </View>
      </Modal>
    );
  }

  const actionnable = estActionnable(current.source);

  const onAck = async () => {
    try {
      await markNotificationRead(current.id);
    } catch {
      // au pire la notification réapparaîtra à la prochaine session
    }
    // R8 : la notification affichée n'est plus forcément la première de la file.
    setQueue((q) => q.filter((n) => n.id !== current.id));
    if (!actionnable) return;
    // Les rappels restants sont REMIS À PLUS TARD, pas perdus : aucun n'est marqué lu, et la
    // porte les represente à la prochaine session. Sans ça, une seconde modale s'ouvrirait
    // par-dessus l'écran qu'on vient tout juste de demander.
    setDismissed(true);
    conduire(current.source);
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
            <Button
              label={actionnable ? t('notifications.see') : t('common.ok')}
              onPress={onAck}
              style={{ flex: 1 }}
              height={48}
            />
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
  warning: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.clay,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  counter: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink3,
    marginTop: 10,
  },
});
