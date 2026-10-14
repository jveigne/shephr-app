import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Label from '../../components/Label';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { canDeclareEvents } from '../../services/authApi';
import { getMyEvents, type EventResponse, type MyEventsResponse } from '../../services/eventsApi';
import { EventFigures, EventPill, EventRow, eventMetaLine, eventRowStyles } from '../../components/EventRow';
import {
  dismissRejectedEvent,
  flushEventQueue,
  useEventQueue,
  type QueuedEvent,
  type RejectedEvent,
} from '../../services/eventQueue';
import { eventFailureMessage } from '../../utils/eventErrors';
import { fmtIsoDay } from '../../utils/meetingReport';
import { toLocalDate } from '../../utils/format';
import { isEnglishLang, typeLabel } from '../../utils/events';
import { goBack } from '../../utils/navigation';

/**
 * Plan 14/10 (§6.3, lot E6) — « MES ACTIONS » (spec Recensement §6.1).
 *
 * <p>En tête, les compteurs du mois et de l'année : mes évènements COMPTÉS (D-EVT-03 : réalisés,
 * d'un type évangélique ; « à vérifier » n'y change rien, RG-ACT-07). Puis, dans l'ordre :
 * <ul>
 *   <li>les déclarations REFUSÉES pendant un envoi en arrière-plan, avec leur raison — un refus
 *       ne doit jamais être silencieux (§3.3 du contrat) ; la personne les retire après lecture ;</li>
 *   <li>les déclarations EN ATTENTE DE SYNCHRO (RG-ACT-08) : déjà visibles pour leur auteur,
 *       avec la raison de l'attente quand le serveur en a donné une (session expirée…). Une
 *       déclaration que le serveur a en fait déjà enregistrée (réponse perdue après un délai
 *       dépassé) n'est montrée qu'une fois : sa ligne enregistrée, reconnue à son `clientId`
 *       (RG-EVT-07) — le prochain vidage la retirera de la file sans doublon ;</li>
 *   <li>mes évènements enregistrés, récents en haut, page par page.</li>
 * </ul>
 * L'écran se recharge de lui-même quand la file vient d'envoyer quelque chose.
 */

/** Mois LOCAL 'yyyy-MM' — le défaut serveur serait le mois UTC (§1.4 du contrat). */
const localMonth = () => toLocalDate(new Date()).slice(0, 7);

export default function MyEventsScreen() {
  const { t, language } = useLanguage();
  const { me, hasEvents } = useAuth();
  const userId = me?.id ?? null;
  // RG-06 : sans l'abonnement EVENTS, `GET /me` n'est jamais appelé.
  const active = hasEvents && !!userId;
  const queue = useEventQueue(userId);
  const isEnglish = isEnglishLang(language);

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
      const res = await getMyEvents(localMonth());
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

  const typeLabelOf = (custom: string | null | undefined, name: string, nameEn: string | null) =>
    custom || typeLabel({ name, nameEn }, isEnglish);

  // Déjà enregistrées côté serveur (rejeu idempotent à venir) : affichées une seule fois.
  const savedClientIds = new Set(events.map((e) => e.clientId));
  const pending = queue.pending.filter((p) => !savedClientIds.has(p.request.clientId));

  const nothingYet = !loading && !loadError && events.length === 0 && pending.length === 0;
  const year = (data?.month ?? localMonth()).slice(0, 4);
  const monthIndex = Number((data?.month ?? localMonth()).slice(5, 7)) - 1;
  const monthName = t('common.monthsLong').split(',')[monthIndex] ?? '';

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
          {/* Compteurs (spec §6.1) */}
          <Card style={styles.counters}>
            <View style={styles.counterCell}>
              <Text style={styles.counterValue}>{data ? data.monthCount : '—'}</Text>
              <Label>{t('events.mine.thisMonth', { month: monthName })}</Label>
            </View>
            <View style={styles.counterDivider} />
            <View style={styles.counterCell}>
              <Text style={styles.counterValue}>{data ? data.yearCount : '—'}</Text>
              <Label>{t('events.mine.thisYear', { year })}</Label>
            </View>
          </Card>
          <Text style={styles.counterHint}>{t('events.mine.countedHint')}</Text>

          {canDeclareEvents(me) && (
            <Button
              label={t('events.declare.title')}
              onPress={() => router.push('/events/declare')}
              fullWidth
              height={50}
              style={{ marginTop: 16 }}
              iconLeft={<Ionicons name="megaphone-outline" size={18} color={colors.white} />}
            />
          )}

          {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

          {/* Refus définitifs survenus en arrière-plan */}
          {queue.rejected.length > 0 && (
            <View style={styles.block}>
              <Label style={styles.blockLabel}>{t('events.mine.rejectedTitle')}</Label>
              {queue.rejected.map((item) => (
                <RejectedRow
                  key={item.request.clientId}
                  item={item}
                  label={typeLabelOf(item.request.customLabel, item.typeName, item.typeNameEn)}
                  onDismiss={() => void dismissRejectedEvent(item.request.clientId)}
                />
              ))}
            </View>
          )}

          {/* En attente de synchro (RG-ACT-08) */}
          {pending.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Label>{t('events.mine.pendingTitle', { count: pending.length })}</Label>
                {queue.syncing ? (
                  <ActivityIndicator size="small" color={colors.moss} />
                ) : (
                  <Pressable onPress={() => void flushEventQueue()} hitSlop={8}>
                    <Text style={styles.link}>{t('events.mine.syncNow')}</Text>
                  </Pressable>
                )}
              </View>
              {pending.map((item) => (
                <PendingRow
                  key={item.request.clientId}
                  item={item}
                  label={typeLabelOf(item.request.customLabel, item.typeName, item.typeNameEn)}
                />
              ))}
            </View>
          )}

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

/**
 * Pourquoi l'élément attend encore, d'après son dernier échec (`QueuedEvent.lastFailure`) : rien
 * hors ligne (la personne le voit), sinon une phrase — une session expirée (401) ne se résout
 * qu'en se reconnectant, mobile n'interceptant pas les 401 (CLAUDE.md, point n°5).
 */
function pendingReasonKey(item: QueuedEvent): string | null {
  const failure = item.lastFailure;
  if (!failure) return null;
  if (failure.status === 401) return 'events.mine.pendingSessionExpired';
  if (failure.status === 403 && failure.code === 'MODULE_ACCESS_DENIED') {
    return 'events.mine.pendingModuleDenied';
  }
  return 'events.mine.pendingRetrying';
}

function PendingRow({ item, label }: { item: QueuedEvent; label: string }) {
  const { t } = useLanguage();
  const r = item.request;
  const reasonKey = pendingReasonKey(item);
  return (
    <Card variant="paper2" style={[styles.row, styles.rowPending]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
        <EventPill tone={colors.earthDeep} icon="cloud-upload-outline" text={t('events.mine.pending')} />
      </View>
      <Text style={styles.rowMeta}>{eventMetaLine(fmtIsoDay(r.eventDate, t), r.place, item.scopeName)}</Text>
      <EventFigures participants={r.participants} soulsWon={r.soulsWon} />
      {reasonKey && <Text style={styles.pendingReason}>{t(reasonKey)}</Text>}
    </Card>
  );
}

function RejectedRow({
  item,
  label,
  onDismiss,
}: {
  item: RejectedEvent;
  label: string;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const r = item.request;
  return (
    <Card variant="paper2" style={[styles.row, styles.rowRejected]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
        <EventPill tone={colors.clay} icon="alert-circle-outline" text={t('events.mine.rejected')} />
      </View>
      <Text style={styles.rowMeta}>{eventMetaLine(fmtIsoDay(r.eventDate, t), r.place, item.scopeName)}</Text>
      <Text style={styles.rejectReason}>
        {eventFailureMessage(item.failure, t, t('errors.saveFailed'))}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
        <Text style={[styles.link, { color: colors.clay }]}>{t('events.mine.dismiss')}</Text>
      </Pressable>
    </Card>
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
  counters: {
    marginTop: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterCell: { flex: 1, alignItems: 'center', gap: 4 },
  counterDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.hair },
  counterValue: { fontFamily: fonts.serif, fontSize: 34, color: colors.ink, letterSpacing: -0.6 },
  counterHint: {
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    textAlign: 'center',
    lineHeight: 17,
  },
  block: { marginTop: 20, gap: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockLabel: { marginBottom: 0 },
  link: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
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
  ...eventRowStyles,
  rowPending: { borderStyle: 'dashed', borderColor: colors.hairStrong },
  // Argile à 35 % d'opacité (0x59), même procédé que `EventPill` : la palette, sans couleur en dur.
  rowRejected: { borderColor: colors.clay + '59' },
  pendingReason: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, lineHeight: 17 },
  rejectReason: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
});
