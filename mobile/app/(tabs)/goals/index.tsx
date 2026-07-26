import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import HandDivider from '../../../components/HandDivider';
import GoalAggregatesScreen from '../../../components/GoalAggregates';
import GoalsMinistryOverview from '../../../components/GoalsMinistryOverview';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { hasGoalsAccess, hasMemberGoals } from '../../../services/authApi';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useGoalsData, type GoalLine } from '../../../hooks/useGoalsData';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { fmtAmount, fmtDate } from '../../../utils/format';
import {
  fetchMembersAggregate,
  type ActiveGoal,
  type MembersAggregateLine,
} from '../../../services/goalsApi';

export default function GoalsOverviewScreen() {
  const { me } = useAuth();

  // Feature A : le simple MEMBRE rattaché (sans aucun accès dirigeant) va sur « Mes objectifs ».
  if (hasMemberGoals(me) && !hasGoalsAccess(me)) {
    return <Redirect href="/(tabs)/goals/member" />;
  }

  // Lot V1 — routage par rôle : Secrétariat/Présentation générale (ministère-large),
  // Coordinateur/Dirigeant (périmètre agrégé), Unité (engagements de l'assemblée).
  const secretariat = (me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT';
  const ministryWide = secretariat || me?.goalRole === 'LEADER';
  // Multi-rattachements (home + set) : toutes les régions / villes portées, principale en tête.
  const uniq = (home?: string | null, set?: string[] | null) => {
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };
  const zoneIds = uniq(me?.goalZoneId, me?.goalZoneIds);
  const cityIds = uniq(me?.goalCityId, me?.goalCityIds);
  const countryIds = me?.goalCountryIds ?? [];
  if (!me?.goalUnitId && ministryWide) {
    return <GoalsMinistryOverview secretariat={secretariat} />;
  }
  if (!me?.goalUnitId && (zoneIds.length > 0 || cityIds.length > 0 || countryIds.length > 0)) {
    return <GoalAggregatesScreen zoneIds={zoneIds} cityIds={cityIds} countryIds={countryIds} />;
  }

  return <UnitGoalsScreen />;
}

function UnitGoalsScreen() {
  const { t } = useLanguage();
  const { me } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { goal, lines, submitted, pledges, loading, error, reload } = useGoalsData(selectedYear);
  const [refreshing, setRefreshing] = useState(false);
  const year = selectedYear ?? goal?.currentYear ?? null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (error === 'NO_GOAL') {
    return <EmptyState icon="flag-outline" title={t('goals.noGoalTitle')}
      hint={t('goals.noGoalHint')} />;
  }
  if (error === 'NO_UNIT') {
    return <EmptyState icon="link-outline" title={t('goals.noUnitTitle')}
      hint={t('goals.noUnitHint')} />;
  }
  if (error) {
    return <EmptyState icon="cloud-offline-outline" title={t('goals.loadingError')}
      hint={t('goals.loadingErrorHint')} onRetry={onRefresh} />;
  }

  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal), mise en exergue.
  const deadlineIso =
    (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;
  const deadline = deadlineIso ? new Date(deadlineIso) : null;
  const deadlinePast = deadline != null && deadline.getTime() < Date.now();
  const hasPledges = pledges.length > 0;
  const lockedAt = pledges.find((p) => p.lockedAt)?.lockedAt;

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.titleRow}>
        <Ionicons name="flag-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('goals.title')}</Text>
      </View>
      <View style={styles.viewChip}>
        <Text style={styles.viewChipText}>{t('views.badge')} : {t('views.unit')}</Text>
      </View>
      <Text style={styles.subtitle}>
        {goal?.name} · {goal ? `${new Date(goal.startDate).getFullYear()}–${new Date(goal.endDate).getFullYear()}` : ''}
      </Text>

      {goal && ((goal.visibleYears ?? goal.openYears)?.length ?? 0) > 0 && year != null && (
        <YearSelector
          years={goal.visibleYears ?? goal.openYears}
          value={year}
          onChange={setSelectedYear}
        />
      )}

      {submitted ? (
        <Card variant="tinted" style={styles.banner}>
          <Ionicons name="lock-closed" size={18} color={colors.moss} />
          <Text style={styles.bannerText}>
            {t('goals.submittedBanner', { when: lockedAt ? t('goals.submittedWhen', { date: fmtDate(new Date(lockedAt)) }) : '' })}
          </Text>
        </Card>
      ) : deadline ? (
        <Card variant="paper2" style={styles.banner}>
          <Ionicons
            name={deadlinePast ? 'alert-circle-outline' : 'time-outline'}
            size={18}
            color={deadlinePast ? colors.clay : colors.earthDeep}
          />
          <Text style={[styles.bannerText, deadlinePast && { color: colors.clay }]}>
            {deadlinePast
              ? t('goals.deadlinePast', { date: fmtDate(deadline) })
              : t('goals.deadlineFuture', { date: fmtDate(deadline) })}
          </Text>
        </Card>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('goals.myUnitPledges')}</Text>
      </View>

      <View style={{ gap: 8, marginTop: 10 }}>
        {lines.map((line) => (
          <GoalLineCard
            key={line.category.id}
            line={line}
            currency={goal?.defaultCurrency ?? 'EUR'}
            onPress={() => router.push(`/(tabs)/goals/pledge/${line.category.id}?year=${year ?? ''}`)}
          />
        ))}
      </View>

      {!submitted && (
        <Button
          label={t('goals.submitPledges')}
          onPress={() => router.push(`/(tabs)/goals/submit?year=${year ?? ''}`)}
          disabled={!hasPledges}
          fullWidth
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="lock-closed-outline" size={18} color={colors.white} />}
        />
      )}
      {!submitted && !hasPledges && (
        <Text style={styles.footnote}>
          {t('goals.noPledgeYet')}
        </Text>
      )}

      {hasPledges && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button
            label={t('goals.addProgress')}
            variant="soft"
            onPress={() => router.push(`/(tabs)/goals/progress?year=${year ?? ''}`)}
            style={{ flex: 1 }}
            iconLeft={<Ionicons name="trending-up-outline" size={17} color={colors.mossDeep} />}
          />
          <Button
            label={t('goals.historyBtn')}
            variant="ghost"
            onPress={() => router.push(`/(tabs)/goals/history?year=${year ?? ''}`)}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* Feature A — agrégat des fidèles vs engagement du dirigeant (bloc replié). */}
      {me?.goalUnitId && goal && year != null && (
        <MembersAggregateBlock unitId={me.goalUnitId} year={year} goal={goal} />
      )}
    </ScreenShell>
  );
}

/**
 * Feature A — bloc replié « Agrégat des fidèles / Engagement du dirigeant / Retenu (MAX) »
 * alimenté par GET units/{unitId}/members-aggregate. Badge de source : AGGREGATE (agrégat
 * des fidèles), DIRECT (l'engagement du dirigeant l'emporte), FAITH (foi).
 */
function MembersAggregateBlock({
  unitId,
  year,
  goal,
}: {
  unitId: string;
  year: number;
  goal: ActiveGoal;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<MembersAggregateLine[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLines(null);
  }, [unitId, year]);

  useEffect(() => {
    if (!expanded || lines != null || loading) return;
    setLoading(true);
    fetchMembersAggregate(unitId, year)
      .then((r) => setLines(r.lines))
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [expanded, lines, loading, unitId, year]);

  const currency = goal.defaultCurrency;
  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const fmtFor = (categoryId: string, v: number | null) => {
    if (v == null) return '—';
    const cat = catById.get(categoryId);
    return cat?.unitType === 'CURRENCY'
      ? fmtAmount(v, currency)
      : `${v} ${cat?.unitLabel ?? ''}`.trim();
  };
  const sourceLabel: Record<string, string> = {
    AGGREGATE: t('goals.aggregate.sourceAggregate'),
    DIRECT: t('goals.aggregate.sourceDirect'),
    FAITH: t('goals.aggregate.sourceFaith'),
  };

  return (
    <Card variant="paper2" style={styles.membersAggCard}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={styles.membersAggHeader}
        hitSlop={6}
      >
        <Ionicons name="people-outline" size={18} color={colors.mossSoft} />
        <Text style={styles.membersAggTitle}>
          {expanded ? t('goals.aggregate.hide') : t('goals.aggregate.show')}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.ink3}
        />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          {loading && <ActivityIndicator color={colors.moss} />}
          {!loading && (lines?.length ?? 0) === 0 && (
            <Text style={styles.membersAggEmpty}>{t('goals.aggregate.empty')}</Text>
          )}
          {!loading &&
            (lines ?? []).map((line) => {
              const cat = catById.get(line.categoryId);
              const leader = line.leaderAmount ?? line.leaderCount;
              const retained = line.effectiveAmount ?? line.effectiveCount;
              return (
                <View key={line.categoryId} style={styles.membersAggLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.membersAggCat}>
                      {cat?.name ?? line.categoryCode}
                    </Text>
                    <View style={styles.sourceBadge}>
                      <Text style={styles.sourceBadgeText}>
                        {sourceLabel[line.source] ?? line.source}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.membersAggCols}>
                    <View>
                      <Label>{t('goals.aggregate.membersSum')}</Label>
                      <Text style={styles.membersAggValue}>
                        {fmtFor(line.categoryId, line.membersSum)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Label>{t('goals.aggregate.leaderPledge')}</Label>
                      <Text style={styles.membersAggValue}>
                        {fmtFor(line.categoryId, leader)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Label>{t('goals.aggregate.retained')}</Label>
                      <Text style={[styles.membersAggValue, { fontWeight: '600' }]}>
                        {fmtFor(line.categoryId, retained)}
                      </Text>
                    </View>
                  </View>
                  {line.members.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      {line.members.map((m) => (
                        <Text key={m.userId} style={styles.membersAggMember}>
                          {m.fullName} · {fmtFor(line.categoryId, m.amount ?? m.count)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
        </View>
      )}
    </Card>
  );
}

/** Sélecteur d'année (Lot 4.6, révisé G1.c) — chips des années VISIBLES (JP 16/07 : le jalon final s'affiche « 2030 »). */
export function YearSelector({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <View style={styles.yearRow}>
      {years.map((y) => {
        const active = y === value;
        return (
          <Pressable
            key={y}
            onPress={() => onChange(y)}
            style={[styles.yearChip, active && styles.yearChipActive]}
          >
            <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
              {y}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GoalLineCard({
  line,
  currency,
  onPress,
}: {
  line: GoalLine;
  currency: string;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const meta = goalCategoryMeta(line.category.code);
  const { pledge, achieved, target } = line;
  const isCurrency = line.category.unitType === 'CURRENCY';
  // #5 : si le versé dépasse l'engagé, la barre DÉBORDE au-delà de 100% (vert jusqu'à l'objectif, earth au-delà).
  const rawPct = target != null && target > 0 ? Math.round((achieved / target) * 100) : 0;
  const over = rawPct > 100;
  const denom = Math.max(100, rawPct);
  const basePct = (Math.min(rawPct, 100) / denom) * 100;
  const overPct = over ? ((rawPct - 100) / denom) * 100 : 0;
  const goalLinePct = (100 / denom) * 100;

  const fmtValue = (v: number) =>
    isCurrency ? fmtAmount(v, currency) : `${v} ${line.category.unitLabel ?? ''}`.trim();

  return (
    <Card onPress={onPress} style={styles.lineCard}>
      <View style={styles.lineHead}>
        <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lineName}>{line.category.name}</Text>
          <Text style={styles.lineMeta}>
            {pledge == null
              ? t('goals.lineToComplete')
              : pledge.locked
              ? t('goals.lineSubmitted')
              : t('goals.lineDraft')}
          </Text>
        </View>
        {pledge?.locked && <Ionicons name="lock-closed" size={14} color={colors.ink3} />}
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </View>
      {pledge != null && (
        <>
          <HandDivider style={{ marginVertical: 10 }} />
          <View style={styles.lineFooter}>
            <View>
              <Label>{t('goals.pledged')}</Label>
              <Text style={styles.lineValue}>{target != null ? fmtValue(target) : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>{t('goals.given')}</Label>
              <Text style={styles.lineValue}>{fmtValue(achieved)}</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${basePct}%`, backgroundColor: meta.tone }]} />
            {over && (
              <View style={[styles.barFill, { width: `${overPct}%`, backgroundColor: colors.earthDeep }]} />
            )}
            {over && <View style={[styles.goalMark, { left: `${goalLinePct}%` }]} />}
          </View>
          <Text style={[styles.pctText, over && styles.pctOver]}>{rawPct}%</Text>
        </>
      )}
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  onRetry,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <ScreenShell>
      <View style={styles.centerBox}>
        <View style={styles.emptyBubble}>
          <Ionicons name={icon} size={30} color={colors.mossSoft} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyHint}>{hint}</Text>
        {onRetry && (
          <Button label={t('common.retry')} variant="ghost" onPress={onRetry} style={{ marginTop: 18 }} />
        )}
      </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  yearChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.06)',
  },
  yearChipActive: { backgroundColor: colors.moss },
  yearChipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  yearChipTextActive: { color: colors.white },
  banner: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
    lineHeight: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 22,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  lineCard: { paddingHorizontal: 16, paddingVertical: 14 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  lineMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  lineValue: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 2 },
  barTrack: {
    height: 6,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 10,
  },
  barFill: { height: '100%' },
  goalMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  pctText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    marginTop: 4,
    textAlign: 'right',
  },
  pctOver: { color: colors.earthDeep },
  membersAggCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 14 },
  membersAggHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  membersAggTitle: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink,
  },
  membersAggEmpty: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
  membersAggLine: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  membersAggCat: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  membersAggCols: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  membersAggValue: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, marginTop: 2 },
  membersAggMember: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 3 },
  sourceBadge: {
    backgroundColor: 'rgba(201,149,107,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  sourceBadgeText: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.earthDeep,
  },
  footnote: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
  },
  centerBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
});
