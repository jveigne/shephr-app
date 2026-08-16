import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from './ScreenShell';
import Card from './Card';
import Label from './Label';
import { GoalScreenTitle } from './GoalCards';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { goalName } from '../utils/goalName';
import { fmtAmount, fmtDate } from '../utils/format';
import {
  getActiveGoal,
  getGlobalSummary,
  getNations,
  type ActiveGoal,
  type GlobalSummary,
  type NationStatus,
} from '../services/goalsApi';

/**
 * Lot V1 — vues ministère-large mobile : « Présentation générale » (LEADER, lecture) et
 * « Secrétariat » (SECRETARIAT/SUPER_ADMIN — mêmes chiffres + deadline mise en avant ;
 * la gestion deadline/années se fait sur le web). Drill simplifié : totaux + nations.
 */
export default function GoalsMinistryOverview({ secretariat }: { secretariat: boolean }) {
  const { t } = useLanguage();
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [summary, setSummary] = useState<GlobalSummary | null>(null);
  const [nations, setNations] = useState<NationStatus[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const year = selectedYear ?? goal?.currentYear ?? null;

  const load = useCallback(async (y: number | null) => {
    const g = await getActiveGoal();
    setGoal(g);
    const effective = y ?? g.currentYear;
    const [s, n] = await Promise.allSettled([getGlobalSummary(effective), getNations(effective)]);
    setSummary(s.status === 'fulfilled' ? s.value : null);
    setNations(n.status === 'fulfilled' ? n.value.nations : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(selectedYear).finally(() => setLoading(false));
  }, [selectedYear, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(selectedYear); } finally { setRefreshing(false); }
  };

  const currency = goal?.defaultCurrency ?? 'EUR';
  const catByCode = new Map((goal?.categories ?? []).map((c) => [c.code, c]));
  const deadlineIso = (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;
  const years = goal?.visibleYears ?? goal?.openYears ?? [];

  return (
    <ScreenShell
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <GoalScreenTitle title={t('goals.title')} />
      {/* Lot V1 : vue NOMMÉE à l'écran. */}
      <View style={styles.viewChip}>
        <Text style={styles.viewChipText}>
          {t('views.badge')} : {secretariat ? t('views.secretariat') : t('views.overview')}
        </Text>
      </View>
      <Text style={styles.subtitle}>{goalName(goal)}</Text>

      {years.length > 0 && year != null && (
        <View style={styles.yearRow}>
          {years.map((y) => {
            const active = y === year;
            return (
              <Pressable key={y} onPress={() => setSelectedYear(y)} style={[styles.yearChip, active && styles.yearChipActive]}>
                <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>{y}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {deadlineIso && (
        <Card variant="paper2" style={styles.banner}>
          <Ionicons name="time-outline" size={18} color={colors.earthDeep} />
          <Text style={styles.bannerText}>
            {new Date(deadlineIso).getTime() < Date.now()
              ? t('goals.deadlinePast', { date: fmtDate(new Date(deadlineIso)) })
              : t('goals.deadlineFuture', { date: fmtDate(new Date(deadlineIso)) })}
            {secretariat ? ` ${t('views.manageOnWeb')}` : ''}
          </Text>
        </Card>
      )}

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : (
        <>
          {summary && (
            <Card variant="paper2" style={styles.block}>
              <Label style={{ marginBottom: 8 }}>{t('views.ministryTotals')}</Label>
              {/* RG-BQ-06 — maille PERSONNE : `submittedUnits` a disparu du contrat. */}
              <Text style={styles.ratio}>
                {t('views.submittedRatio', {
                  submitted: summary.submittedMembers,
                  total: summary.totalMembers,
                  percent: summary.totalMembers > 0
                    ? Math.round((summary.submittedMembers / summary.totalMembers) * 100)
                    : 0,
                })}
              </Text>
              {summary.lateMembers > 0 && (
                <Text style={styles.lateRatio}>
                  {t('goals.members.lateCount', { count: summary.lateMembers })}
                </Text>
              )}
              {summary.totals.map((l) => {
                const cat = catByCode.get(l.categoryCode);
                const effective = l.unitType === 'CURRENCY'
                  ? fmtAmount(l.effectiveAmount ?? 0, currency)
                  : `${l.effectiveCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
                const achieved = l.unitType === 'CURRENCY'
                  ? fmtAmount(l.achieved ?? 0, currency)
                  : `${l.achieved ?? 0} ${cat?.unitLabel ?? ''}`.trim();
                return (
                  <Text key={l.categoryId} style={styles.lineText}>
                    <Text style={styles.lineLabel}>{goalName(cat, l.categoryCode)} : </Text>
                    <Text style={styles.lineValue}>{effective}</Text>
                    <Text style={styles.lineLabel}> · {t('views.achievedInline', { value: achieved })}</Text>
                  </Text>
                );
              })}
            </Card>
          )}

          {nations.length > 0 && (
            <Card variant="paper2" style={styles.block}>
              <Label style={{ marginBottom: 8 }}>{t('views.nationsHeading')}</Label>
              {nations.map((n) => (
                <View key={n.countryId} style={styles.nationRow}>
                  <Text style={styles.nationName}>
                    {n.name}
                    {n.continentName ? ` · ${n.continentName}` : ''}
                  </Text>
                  {/* `submissionRate` est re-maillé PERSONNE côté serveur. */}
                  <Text style={[styles.ratio, n.late && { color: colors.clay }]}>
                    {t('views.submittedRatio', {
                      submitted: n.submittedMembers,
                      total: n.totalMembers,
                      percent: Math.round(n.submissionRate * 100),
                    })}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  viewChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.earthDeep + '1F',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  viewChipText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: colors.earthDeep },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 6 },
  yearRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  yearChip: {
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: colors.ink + '0D',
  },
  yearChipActive: { backgroundColor: colors.moss },
  yearChipText: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  yearChipTextActive: { color: '#fff', fontWeight: '600' },
  banner: {
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bannerText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  block: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  ratio: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginBottom: 6 },
  lateRatio: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay, marginBottom: 6 },
  lineText: { fontFamily: fonts.sans, fontSize: 13.5, marginTop: 4 },
  lineLabel: { color: colors.ink3 },
  lineValue: { color: colors.ink, fontWeight: '600' },
  nationRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink + '14',
  },
  nationName: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink, fontWeight: '500' },
});
