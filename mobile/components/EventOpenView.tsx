import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import ErrorBanner from '@/components/ErrorBanner';
import { EventPill } from '@/components/EventRow';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  listMyRegistrations,
  listOpenEvents,
  type OpenEventResponse,
} from '@/services/eventsApi';
import { eventActionMessage } from '@/utils/eventErrors';
import { eventLabel, fmtEventDates, isEnglishLang } from '@/utils/events';
import { goBack } from '@/utils/navigation';

export type OpenTab = 'open' | 'mine';

/**
 * Évènements OUVERTS À TOUS — D-PAYS-10 / 11 / RG-PAYS-22 / 24 (JP 11/11, contrat 11/11 §10.4).
 *
 * <p>Deux usages, même contenu : l'onglet « Évènements » d'un compte sans assemblée (`app/(tabs)/events`) et
 * l'écran `app/events/open` (membre rattaché, « Mes inscriptions » de l'accueil). Deux onglets :
 * <ul>
 *   <li>« Ouverts à tous » : `GET /events/open` — évènements ouverts de MON pays et de MA ville (rien d'autre :
 *       aucune réunion interne, aucun compteur) ;</li>
 *   <li>« Mes inscriptions » : `GET /events/me/registrations` (à venir).</li>
 * </ul>
 * Le détail (`app/events/[id]`) porte le bloc « Je participe ». Pas de react-query : useState + useFocusEffect.
 */
export default function EventOpenView({
  initialTab = 'open',
  standalone,
}: {
  initialTab?: OpenTab;
  /** Écran poussé (flèche retour, sans barre d'onglets) plutôt qu'onglet. */
  standalone?: boolean;
}) {
  const { t, language } = useLanguage();
  const english = isEnglishLang(language);
  const { me, hasEvents } = useAuth();
  const [tab, setTab] = useState<OpenTab>(initialTab);
  const [items, setItems] = useState<OpenEventResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!hasEvents) return;
    try {
      const list = tab === 'open' ? await listOpenEvents() : await listMyRegistrations('upcoming');
      setItems(list);
      setError(null);
    } catch (e) {
      setError(eventActionMessage(e, t));
    }
  }, [tab, hasEvents, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const switchTab = (next: OpenTab) => {
    if (next === tab) return;
    setItems(null);
    setError(null);
    setTab(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const place = me?.cityNodeName ?? null;

  return (
    <ScreenShell
      withTabBar={!standalone}
      refreshControl={
        hasEvents ? <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {standalone && (
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      )}
      <Text style={styles.kicker}>{t('events.tab.kicker')}</Text>
      <Text style={styles.title}>{t('events.open.title')}</Text>
      <Text style={styles.subtitle}>
        {place ? t('events.open.subtitleCity', { city: place }) : t('events.open.subtitle')}
      </Text>

      {!hasEvents ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('events.declare.moduleUnavailable')}</Text>
        </Card>
      ) : (
        <>
          <View style={styles.tabRow}>
            {(['open', 'mine'] as const).map((k) => (
              <Pressable key={k} style={[styles.tabBtn, tab === k && styles.tabBtnOn]} onPress={() => switchTab(k)}>
                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{t(`events.open.tabs.${k}`)}</Text>
              </Pressable>
            ))}
          </View>

          {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
          {items == null && !error ? (
            <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
          ) : items != null && items.length === 0 ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name={tab === 'open' ? 'calendar-outline' : 'hand-right-outline'} size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>
                {tab === 'open' ? t('events.open.empty') : t('events.open.mineEmpty')}
              </Text>
            </Card>
          ) : (
            (items ?? []).map((e) => (
              <OpenEventRow key={e.id} event={e} english={english} t={t} />
            ))
          )}
        </>
      )}
    </ScreenShell>
  );
}

function OpenEventRow({
  event,
  english,
  t,
}: {
  event: OpenEventResponse;
  english: boolean;
  t: (key: string, options?: any) => string;
}) {
  const registered = event.myRegistration?.status === 'REGISTERED';
  return (
    <Card
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })}
      style={styles.row}
    >
      <View style={styles.dateBadge}>
        <Ionicons name="calendar-outline" size={18} color={colors.moss} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {event.title || eventLabel(event, english)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {fmtEventDates(event, t)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[event.scopeName, event.place].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.pills}>
          {registered && (
            <EventPill tone={colors.moss} icon="checkmark-circle-outline" text={t('events.registration.registeredShort')} />
          )}
          {event.status === 'CANCELLED' && (
            <EventPill tone={colors.clay} icon="close-circle-outline" text={t('events.status.CANCELLED')} />
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  tabRow: { flexDirection: 'row', marginTop: 18, backgroundColor: colors.mossTint, borderRadius: 99, padding: 3, marginBottom: 6 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 99, alignItems: 'center' },
  tabBtnOn: {
    backgroundColor: colors.paper,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.08,
  },
  tabText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink3 },
  tabTextOn: { color: colors.moss },
  row: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.mossTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
