import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import ErrorBanner from '@/components/ErrorBanner';
import ContactButtons from '@/components/ContactButtons';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  listEventRegistrations,
  markEventAttendance,
  type EventRegistrationRow,
  type EventRegistrationsResponse,
} from '@/services/eventsApi';
import { eventActionMessage } from '@/utils/eventErrors';
import { notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';
import { fmtIsoDay } from '@/utils/meetingReport';

type Mark = boolean | null;

/**
 * Inscrits d'un évènement ouvert et POINTAGE — RG-PAYS-28 / 29 (JP 11/11, contrat 11/11 §8.1 / §8.3).
 *
 * <p>Réservé à l'organisateur et au SECRETARIAT (`canManageRegistrations` du serveur, E-15 ; sinon 403, dit à l'écran). Une ligne par inscrit
 * (REGISTERED) : nom, « sans assemblée » ou son assemblée, inscrit le…, coordonnées et boutons Appeler / WhatsApp /
 * E-mail (Q7, aucun envoi groupé). Pointage venu / pas venu / non pointé une fois l'évènement passé
 * (`canMarkAttendance`). Les compteurs saisis à la main (participants, invités) ne sont jamais touchés : inscrits
 * et venus s'affichent à côté. En ligne seulement.
 */
export default function EventRegistrationsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { t } = useLanguage();
  const [data, setData] = useState<EventRegistrationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setData(await listEventRegistrations(eventId));
      setError(null);
    } catch (e) {
      setError(eventActionMessage(e, t, { UNAUTHORIZED_ACCESS: 'events.registration.denied' }));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const mark = async (row: EventRegistrationRow, attended: Mark) => {
    if (!eventId || busyId) return;
    setBusyId(row.id);
    try {
      await markEventAttendance(eventId, row.id, { attended });
      // Les compteurs (venus / absents / non pointés) viennent du serveur : on relit.
      await load();
    } catch (e) {
      notify(t('events.registration.title'), eventActionMessage(e, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.kicker}>{t('events.tab.kicker')}</Text>
      <Text style={styles.title}>{t('events.registration.screenTitle')}</Text>

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : !data ? (
        <ErrorBanner message={error ?? t('events.errors.generic')} onRetry={() => void load()} />
      ) : (
        <>
          {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
          <View style={styles.stats}>
            <Stat label={t('events.registration.stat.registered')} value={data.registeredCount} />
            <Stat label={t('events.registration.stat.attended')} value={data.attendedCount} />
            <Stat label={t('events.registration.stat.absent')} value={data.absentCount} />
            <Stat label={t('events.registration.stat.unmarked')} value={data.unmarkedCount} />
          </View>
          <Text style={styles.hint}>
            {data.canMarkAttendance ? t('events.registration.markHint') : t('events.registration.markLater')}
          </Text>

          {data.items.length === 0 ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="people-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('events.registration.empty')}</Text>
            </Card>
          ) : (
            data.items.map((row) => (
              <Card key={row.id} style={styles.row}>
                <Text style={styles.name}>{row.fullName}</Text>
                <Text style={styles.meta}>
                  {row.unattached ? t('events.registration.unattached') : row.assemblyName ?? '—'}
                  {' · '}
                  {t('events.registration.registeredOn', { date: fmtIsoDay(row.registeredAt.slice(0, 10), t) })}
                </Text>
                {!!row.followUpStatus && (
                  <Text style={styles.meta}>{t(`followUps.status.${row.followUpStatus}`)}</Text>
                )}
                {(!!row.phoneNumber || !!row.email) && (
                  <Text style={styles.meta} selectable>
                    {[row.phoneNumber ? `${row.phoneCountryCode ?? ''} ${row.phoneNumber}`.trim() : null, row.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
                <ContactButtons
                  phoneNumber={row.phoneNumber}
                  phoneCountryCode={row.phoneCountryCode}
                  email={row.email}
                  compact
                />
                {data.canMarkAttendance && (
                  <View style={styles.marks}>
                    {([true, false, null] as Mark[]).map((m) => {
                      const on = row.attended === m;
                      const key = m === true ? 'attended' : m === false ? 'absent' : 'unmarked';
                      return (
                        <Pressable
                          key={key}
                          disabled={busyId != null}
                          onPress={() => void mark(row, m)}
                          style={[styles.markBtn, on && styles.markBtnOn]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.markText, on && styles.markTextOn]}>
                            {t(`events.registration.mark.${key}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {busyId === row.id && <ActivityIndicator color={colors.moss} />}
                  </View>
                )}
              </Card>
            ))
          )}
          {data.canceledCount > 0 && (
            <Text style={styles.hint}>{t('events.registration.canceledCount', { count: data.canceledCount })}</Text>
          )}
        </>
      )}
    </ScreenShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  statValue: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  statLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.ink3, marginTop: 2, textAlign: 'center' },
  hint: { marginTop: 10, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  row: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 12 },
  name: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  markBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.hairStrong,
  },
  markBtnOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  markText: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
  markTextOn: { color: colors.white },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
