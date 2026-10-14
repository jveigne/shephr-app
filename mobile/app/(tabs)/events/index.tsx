import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import ErrorBanner from '../../../components/ErrorBanner';
import EventAgenda from '../../../components/EventAgenda';
import EventStatsDrill from '../../../components/EventStatsDrill';
import EventPeriodPicker from '../../../components/EventPeriodPicker';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useEventCatalog } from '../../../hooks/useEventCatalog';
import { isSecretariat } from '../../../services/authApi';
import { defaultPeriod, periodBounds, type Period } from '../../../utils/events';

type Tab = 'agenda' | 'stats';

/**
 * Onglet « Évènements » — plan 14/10, §6.3 (lot E7). Réservé aux dirigeants et aux viewers
 * ministère-large (gating dans `app/(tabs)/_layout.tsx`) ; le membre, lui, déclare depuis la
 * tuile d'accueil et retrouve ses actions dans « Mes actions ».
 *
 * <ul>
 *   <li>Agenda : à clôturer / à venir / réalisés du périmètre (D-EVT-07), « Programmer » si le
 *       serveur dit `canPlan` (D-EVT-08, RG-EVT-03) ;</li>
 *   <li>Statistiques : total, par type, par mois, descente Nation → Région → Ville → Assemblée.
 *       D-EVT-09 : c'est l'écran du SECRÉTARIAT — ouvert par défaut pour lui, comme sur le web.</li>
 * </ul>
 * Pas de react-query côté mobile : useState + useFocusEffect ; un retour sur l'onglet (après une
 * clôture dans le détail, par exemple) recharge le contenu affiché.
 */
export default function EventsTabScreen() {
  const { t } = useLanguage();
  const { me, hasEvents } = useAuth();
  // RG-06 : sans l'abonnement EVENTS, aucune route du module n'est appelée.
  const catalog = useEventCatalog(hasEvents ? me?.id : null);
  const scopes = catalog.scopes;

  const [tab, setTab] = useState<Tab>(() => (isSecretariat(me) ? 'stats' : 'agenda'));
  const [statsPeriod, setStatsPeriod] = useState<Period>(() => defaultPeriod('year'));
  const statsBounds = periodBounds(statsPeriod);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Le premier focus coïncide avec le montage, où chaque bloc charge déjà : on ne recharge
  // qu'aux RETOURS sur l'onglet.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) setRefreshKey((k) => k + 1);
      focusedOnce.current = true;
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setRefreshKey((k) => k + 1);
      await catalog.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const canPlan = !!scopes?.canPlan;
  const noTypes = catalog.types.length === 0;

  return (
    <ScreenShell
      refreshControl={
        hasEvents ? <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <Text style={styles.kicker}>{t('events.tab.kicker')}</Text>
      <Text style={styles.title}>{t('events.tab.title')}</Text>
      <Text style={styles.subtitle}>{t('events.tab.subtitle')}</Text>

      {!hasEvents ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('events.declare.moduleUnavailable')}</Text>
        </Card>
      ) : (
        <>
          <View style={styles.tabRow}>
            {(['agenda', 'stats'] as const).map((k) => (
              <Pressable key={k} style={[styles.tabBtn, tab === k && styles.tabBtnOn]} onPress={() => setTab(k)}>
                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{t(`events.tab.${k}`)}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'agenda' ? (
            catalog.loading ? (
              <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
            ) : catalog.error || !scopes ? (
              <ErrorBanner message={t('events.tab.loadFailed')} onRetry={catalog.reload} />
            ) : (
              <>
                {(canPlan || scopes.canDeclare) && (
                  <View style={styles.actions}>
                    {canPlan && (
                      <Button
                        label={t('events.tab.plan')}
                        onPress={() => router.push('/events/plan')}
                        disabled={noTypes}
                        height={46}
                        style={{ flex: 1 }}
                        iconLeft={<Ionicons name="calendar-outline" size={17} color={colors.white} />}
                      />
                    )}
                    {scopes.canDeclare && (
                      <Button
                        label={t('events.tab.declare')}
                        variant="soft"
                        onPress={() => router.push('/events/declare')}
                        disabled={noTypes}
                        height={46}
                        style={{ flex: 1 }}
                        iconLeft={<Ionicons name="megaphone-outline" size={17} color={colors.mossDeep} />}
                      />
                    )}
                  </View>
                )}
                {noTypes && <Text style={styles.hint}>{t('events.declare.noTypes')}</Text>}
                <EventAgenda scopes={scopes} refreshKey={refreshKey} />
              </>
            )
          ) : (
            <>
              <EventPeriodPicker value={statsPeriod} onChange={setStatsPeriod} />
              {statsBounds ? (
                <EventStatsDrill from={statsBounds.from} to={statsBounds.to} refreshKey={refreshKey} />
              ) : (
                <Text style={styles.hint}>{t('events.period.chooseValid')}</Text>
              )}
            </>
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  tabRow: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: colors.mossTint,
    borderRadius: 99,
    padding: 3,
  },
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  hint: { marginTop: 10, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
