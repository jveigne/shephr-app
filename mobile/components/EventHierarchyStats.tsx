import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getEventHierarchyStats,
  type EventHierarchyStats,
  type EventHierarchyUnitStats,
} from '@/services/eventsApi';
import { hierarchyAccessDenied, moduleAccessDenied } from '@/services/entitlementsApi';
import { fmtIsoDay } from '@/utils/meetingReport';

/**
 * « Évènements de ma hiérarchie » — D-HIE-09 (JP 28/10), offre Caleb (code personnel
 * HIERARCHIE_SUIVI), page 3 « Vie de mon leadership ».
 *
 * <p>Axe de la CHAÎNE de supervision (`scopeOf(appelant)`), jamais la géographie : les statistiques
 * d'Évènements d'une ville / région / nation (`/events/stats`, D-OFF-12) ne sont pas touchées.
 * Tout est calculé par le serveur (D-EVT-03 : DONE, non supprimés, type évangélique ; seuls les
 * évènements d'une assemblée comptent, D-EVT-04) : aucun recalcul ici. Aucun nom de participant.
 *
 * <p>Un 403 `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI appelle `onDenied` (l'écran affiche le verrou
 * UNIQUE, jamais un toast) ; un refus d'un autre module (ministère sans EVENTS) masque le bloc.
 * Pas de react-query : useState + useEffect, rechargé par `refreshKey` et par la période.
 */
export default function EventHierarchyStatsBlock({
  from,
  to,
  refreshKey,
  onDenied,
}: {
  from: string;
  to: string;
  refreshKey: number;
  onDenied: () => void;
}) {
  const { t, language } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`hierarchy.events.${k}`, o);
  const [loaded, setLoaded] = useState<{ key: string; stats: EventHierarchyStats } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const dataKey = `${from}|${to}`;
  const requestKey = `${dataKey}|${refreshKey}|${retryKey}`;

  useEffect(() => {
    let active = true;
    getEventHierarchyStats(from, to)
      .then((stats) => {
        if (!active) return;
        setLoaded({ key: dataKey, stats });
        setError(null);
        setHidden(false);
      })
      .catch((e: any) => {
        if (!active) return;
        if (hierarchyAccessDenied(e)) {
          onDenied();
          return;
        }
        if (moduleAccessDenied(e)) {
          setHidden(true);
          return;
        }
        setError({ key: requestKey, message: e?.response?.data?.message ?? th('loadFailed') });
      });
    return () => {
      active = false;
    };
    // `th` / `onDenied` changent à chaque rendu : la clé de requête suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dataKey, requestKey]);

  if (hidden) return null;

  const stats = loaded?.key === dataKey ? loaded.stats : null;
  const errorMessage = error?.key === requestKey ? error.message : null;
  const num = (v: number) => v.toLocaleString(language);

  return (
    <Card style={styles.block}>
      <View style={styles.blockHeader}>
        <Ionicons name="megaphone-outline" size={18} color={colors.mossDeep} />
        <Text style={styles.blockTitle}>{th('title')}</Text>
      </View>

      {!!errorMessage && <ErrorBanner message={errorMessage} onRetry={() => setRetryKey((k) => k + 1)} />}

      {!stats ? (
        !errorMessage && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile value={num(stats.total.count)} label={th('statEvents')} />
            <Tile
              value={num(stats.total.participants)}
              label={th('statParticipants', { guests: num(stats.total.guests) })}
            />
            <Tile value={num(stats.total.conversions)} label={th('statConversions')} />
            <Tile value={num(stats.total.restorations)} label={th('statRestorations')} />
            <Tile value={num(stats.total.baptisms)} label={th('statBaptisms')} />
          </View>

          {stats.byLeader.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{th('byLeaderTitle')}</Text>
              {stats.byLeader.map((l, i) => (
                <View key={l.leaderId ?? `none-${i}`} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {l.leaderName ?? th('noLeader')}
                    </Text>
                    <Text style={styles.meta}>{t('hierarchy.unitsCount', { count: l.unitCount })}</Text>
                  </View>
                  <Figures count={l.count} participants={l.participants} guests={l.guests} num={num} />
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionLabel}>{th('byUnitTitle')}</Text>
          {stats.units.length === 0 ? (
            <Text style={styles.empty}>{th('empty')}</Text>
          ) : (
            stats.units.map((u) => <UnitLine key={u.unitId} unit={u} num={num} />)
          )}
          <Text style={styles.note}>{th('note')}</Text>
        </>
      )}
    </Card>
  );
}

function Figures({
  count,
  participants,
  guests,
  num,
}: {
  count: number;
  participants: number;
  guests: number;
  num: (v: number) => string;
}) {
  const { t } = useLanguage();
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.figureStrong}>{t('hierarchy.events.events', { count, value: num(count) })}</Text>
      <Text style={styles.meta}>
        {t('hierarchy.events.participantsLine', { participants: num(participants), guests: num(guests) })}
      </Text>
    </View>
  );
}

function UnitLine({ unit, num }: { unit: EventHierarchyUnitStats; num: (v: number) => string }) {
  const { t } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`hierarchy.events.${k}`, o);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.unitName} numberOfLines={1}>
          {unit.unitName}
          {unit.cityName ? `  ·  ${unit.cityName}` : ''}
        </Text>
        {!!unit.leaderName && (
          <Text style={styles.meta} numberOfLines={1}>
            {t('hierarchy.leaderPrefix', { name: unit.leaderName })}
          </Text>
        )}
        <Text style={styles.meta}>
          {unit.lastEventDate ? th('lastEvent', { date: fmtIsoDay(unit.lastEventDate, t) }) : th('noEvent')}
        </Text>
      </View>
      <Figures count={unit.count} participants={unit.participants} guests={unit.guests} num={num} />
    </View>
  );
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  blockTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
  loading: { paddingVertical: 18, alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tileValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.moss },
  tileLabel: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.ink3, marginTop: 1, lineHeight: 13 },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
  rowName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  figureStrong: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '700', color: colors.moss },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 14 },
  note: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.ink3, lineHeight: 14, marginTop: 10 },
});
