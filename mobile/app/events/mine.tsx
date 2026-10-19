import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import EventCounters from '@/components/EventCounters';
import EventQueueBlocks from '@/components/EventQueueBlocks';
import { EventRow } from '@/components/EventRow';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyEvents, type EventResponse, type MyEventsResponse } from '@/services/eventsApi';
import { flushEventQueue, useEventQueue } from '@/services/eventQueue';
import { monthLocal } from '@/utils/events';
import { goBack } from '@/utils/navigation';

/**
 * Plan 14/10 (§6.3, lot E6) — « MES ACTIONS » (spec Recensement §6.1) d'un dirigeant, LEADER,
 * SECRETARIAT ou superAdmin, ouvert depuis la saisie (`app/events/declare` : lien d'en-tête et
 * écran de confirmation). En tête, les compteurs du mois et de l'année — mes évènements COMPTÉS
 * (D-EVT-03 : réalisés, d'un type évangélique ; « à vérifier » n'y change rien, RG-ACT-07). Puis
 * la file hors-ligne (`EventQueueBlocks`) et mes évènements enregistrés, récents en haut, page par
 * page. L'écran se recharge de lui-même quand la file vient d'envoyer quelque chose. Ce sont MES
 * évènements (déclarés ou programmés) ; ceux du périmètre se lisent dans l'agenda de l'onglet
 * « Évènements », ouvert d'ici.
 *
 * <p>D-EVT-14 (JP 14/10) : le simple membre n'arrive jamais ici — sa vue « Mes actions » est son
 * onglet « Évènements » (`EventMemberView`), où la saisie le ramène (`router.dismissTo`).
 */
export default function MyEventsScreen() {
  const { t } = useLanguage();
  const { me, hasEvents } = useAuth();
  const userId = me?.id ?? null;
  // RG-06 : sans l'abonnement EVENTS, `GET /me` n'est jamais appelé.
  const active = hasEvents && !!userId;
  const queue = useEventQueue(userId);

  const [data, setData] = useState<MyEventsResponse | null>(null);
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const load = useCallback(async () => {
    if (!active) {
      setLoading(false);
      return;
    }
    try {
      const res = await getMyEvents(monthLocal());
      setData(res);
      setEvents(res.events.content);
      setLoadError(null);
      setMoreError(false);
    } catch (e: any) {
      setLoadError(
        e?.response
          ? e.response.data?.message ?? t('events.mine.loadFailed')
          : t('events.mine.offline'),
      );
    } finally {
      setLoading(false);
    }
  }, [active, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Un envoi de la file vient de réussir : la liste serveur le contient désormais.
  const seenSynced = useRef(queue.syncedCount);
  useEffect(() => {
    if (queue.syncedCount === seenSynced.current) return;
    seenSynced.current = queue.syncedCount;
    void load();
  }, [queue.syncedCount, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Tirer pour rafraîchir relance aussi la file : c'est le geste naturel « réessayer ».
      void flushEventQueue();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (!data || data.events.last || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getMyEvents(data.month, data.events.number + 1);
      setData(res);
      // Dédoublonnage par id : une déclaration arrivée entre deux pages décale le découpage.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.events.content.filter((e) => !seen.has(e.id))];
      });
      setMoreError(false);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  // Déjà enregistrées côté serveur (rejeu idempotent à venir) : affichées une seule fois.
  const savedClientIds = new Set(events.map((e) => e.clientId));
  const pendingCount = queue.pending.filter((p) => !savedClientIds.has(p.request.clientId)).length;

  const nothingYet = !loading && !loadError && events.length === 0 && pendingCount === 0;

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={
        active ? (
          <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>{t('events.declare.kicker')}</Text>
      <Text style={styles.title}>{t('events.mine.title')}</Text>

      {!hasEvents ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('events.declare.moduleUnavailable')}</Text>
        </Card>
      ) : (
        <>
          {/* Compteurs (spec §6.1) : les miens */}
          <EventCounters
            month={data?.month ?? monthLocal()}
            monthCount={data?.monthCount ?? null}
            yearCount={data?.yearCount ?? null}
          />

          {/* `canDeclareEvents` est toujours vrai ici (`isLeaderRole`) : l'écran de saisie relit
              `canDeclare` côté serveur. */}
          <Button
            label={t('events.declare.title')}
            onPress={() => router.push('/events/declare')}
            fullWidth
            height={50}
            style={{ marginTop: 16 }}
            iconLeft={<Ionicons name="megaphone-outline" size={18} color={colors.white} />}
          />
          {/* `dismissTo` et non `push` : on revient à l'onglet sous la pile (accueil → déclarer →
              mes actions) au lieu d'empiler une seconde barre d'onglets. */}
          <Button
            label={t('events.mine.openAgenda')}
            variant="soft"
            onPress={() => router.dismissTo('/(tabs)/events')}
            fullWidth
            height={46}
            style={{ marginTop: 10 }}
            iconLeft={<Ionicons name="calendar-outline" size={17} color={colors.mossDeep} />}
          />

          {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

          <EventQueueBlocks queue={queue} savedClientIds={savedClientIds} />

          {/* Mes évènements enregistrés */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.moss} />
            </View>
          ) : nothingYet ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="megaphone-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('events.mine.empty')}</Text>
            </Card>
          ) : (
            events.length > 0 && (
              <View style={styles.block}>
                <Label style={styles.blockLabel}>{t('events.mine.savedTitle')}</Label>
                {/* Lot E7 : une ligne enregistrée s'ouvre — détail, modification, suppression. */}
                {events.map((e) => (
                  <EventRow key={e.id} event={e} onPress={() => router.push(`/events/${e.id}`)} />
                ))}
                {data && !data.events.last && (
                  <Button
                    label={t('events.mine.loadMore')}
                    variant="ghost"
                    onPress={loadMore}
                    loading={loadingMore}
                    fullWidth
                    height={46}
                    style={{ marginTop: 6 }}
                  />
                )}
                {moreError && <ErrorBanner message={t('events.mine.loadFailed')} onRetry={loadMore} />}
              </View>
            )
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  block: { marginTop: 20, gap: 8 },
  blockLabel: { marginBottom: 0 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  empty: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    lineHeight: 20,
    textAlign: 'center',
  },
});
