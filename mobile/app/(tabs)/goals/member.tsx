import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import ScreenShell from '../../../components/ScreenShell';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import { YearSelector, GoalLineCard } from './index';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useGoalsData } from '../../../hooks/useGoalsData';
import {
  submitMyMemberPledges,
  getMyAssemblyGoal,
  type ActiveGoal,
  type MyAssemblyGoalLine,
} from '../../../services/goalsApi';
import { confirmDialog, notify } from '../../../utils/dialogs';
import { fmtDate, fmtAmount } from '../../../utils/format';

/**
 * Feature A — « Mes objectifs » du simple MEMBRE : un objectif personnel par catégorie, qui
 * alimente l'engagement de son assemblée de maison. Même structure et mêmes composants que la
 * vue assemblée du dirigeant (titre, chip de vue, sélecteur d'année, bandeau d'échéance,
 * cartes de catégorie ouvrant l'écran de saisie) — seules changent les actions de niveau
 * assemblée (soumission, avancement, historique), qui n'appartiennent pas au membre.
 */
export default function MemberGoalsScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { goal, pledges, lines, submitted, loading, error, reload } = useGoalsData(selectedYear, true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const year = selectedYear ?? goal?.currentYear ?? null;

  // Décision JP 28/07 : le membre soumet SES objectifs lui-même ; ensuite, seul le
  // secrétariat peut les rouvrir — d'où la confirmation avant l'appel.
  const onSubmit = async () => {
    const ok = await confirmDialog(
      t('goals.member.submitTitle'),
      t('goals.member.submitBody'),
      t('goals.member.submitCta'),
      true,
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await submitMyMemberPledges(year ?? undefined);
      await reload();
      notify(t('goals.member.submittedTitle'), t('goals.member.submittedBody', { count: res.lockedPledges }));
    } catch (e: any) {
      const code = e?.response?.data?.error;
      notify(
        t('goals.member.submitRefused'),
        code === 'NO_PLEDGE_TO_SUBMIT'
          ? t('goals.member.noPledgeToSubmit')
          : code === 'ALREADY_SUBMITTED'
            ? t('goals.member.alreadySubmitted')
            : e?.response?.data?.message ?? t('errors.tryAgain'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  if (!me?.goalUnitId) {
    return (
      <EmptyState
        icon="link-outline"
        title={t('goals.member.title')}
        hint={t('goals.member.noAssembly')}
      />
    );
  }

  if (loading && !goal) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <Text style={styles.emptyHint}>{t('common.loading')}</Text>
        </View>
      </ScreenShell>
    );
  }

  if (error === 'NO_GOAL' || !goal) {
    return (
      <EmptyState
        icon="flag-outline"
        title={t('goals.noGoalTitle')}
        hint={t('goals.noGoalHint')}
      />
    );
  }

  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal).
  const deadlineIso =
    (year != null ? goal.yearDeadlines?.[String(year)] : null) ?? goal.submissionDeadline ?? null;
  const deadline = deadlineIso ? new Date(deadlineIso) : null;
  const deadlinePast = deadline != null && deadline.getTime() < Date.now();

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
        <Text style={styles.viewChipText}>
          {t('views.badge')} : {t('views.member')}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {goal.name} ·{' '}
        {`${new Date(goal.startDate).getFullYear()}–${new Date(goal.endDate).getFullYear()}`}
      </Text>

      {((goal.visibleYears ?? goal.openYears)?.length ?? 0) > 0 && year != null && (
        <YearSelector
          years={goal.visibleYears ?? goal.openYears}
          value={year}
          onChange={setSelectedYear}
        />
      )}

      {deadline && (
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
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('goals.member.title')}</Text>
      </View>

      <View style={{ gap: 8, marginTop: 10 }}>
        {lines.map((line) => (
          <GoalLineCard
            key={line.category.id}
            line={line}
            currency={goal.defaultCurrency ?? 'EUR'}
            showProgress
            onPress={() =>
              router.push(`/(tabs)/goals/pledge/${line.category.id}?year=${year ?? ''}&scope=member`)
            }
          />
        ))}
      </View>

      {pledges.length > 0 && !deadlinePast && (
        <Button
          label={t('goals.addProgress')}
          variant="soft"
          onPress={() => router.push(`/(tabs)/goals/progress?year=${year ?? ''}&scope=member`)}
          fullWidth
          style={{ marginTop: 16 }}
          iconLeft={<Ionicons name="trending-up-outline" size={18} color={colors.mossDeep} />}
        />
      )}

      {submitted ? (
        <Card variant="paper2" style={styles.banner}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.moss} />
          <Text style={styles.bannerText}>{t('goals.member.submittedBanner')}</Text>
        </Card>
      ) : (
        pledges.length > 0 && !deadlinePast && (
          <Button
            label={t('goals.member.submitCta')}
            onPress={onSubmit}
            loading={submitting}
            fullWidth
            style={{ marginTop: 16 }}
            iconLeft={<Ionicons name="lock-closed-outline" size={18} color={colors.white} />}
          />
        )
      )}

      {/* Palier A1 — engagement de l'assemblée, en LECTURE SEULE (aucune action ici). */}
      {year != null && <MyAssemblyBlock year={year} goal={goal} />}

      <Text style={styles.footnote}>{t('goals.member.hint')}</Text>
    </ScreenShell>
  );
}

/**
 * Palier A1 (JP 14/08) — bloc replié « Engagement de mon assemblée ».
 *
 * <p>Calqué sur `MembersAggregateBlock` de la vue dirigeant (carte paper2, chevron, badge de
 * source), mais <b>sans le détail par fidèle</b> : un simple membre voit ce que son assemblée
 * s'est engagée à faire, pas qui a déclaré quoi. Aucune action non plus — ni saisie, ni
 * avancement, ni soumission : ce n'est pas son niveau.
 */
function MyAssemblyBlock({ year, goal }: { year: number; goal: ActiveGoal }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<MyAssemblyGoalLine[] | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // L'année change → on invalide, le contenu sera rechargé au prochain dépli.
  useEffect(() => {
    setLines(null);
  }, [year]);

  useEffect(() => {
    if (!expanded || lines != null || loading) return;
    setLoading(true);
    getMyAssemblyGoal(year)
      .then((r) => {
        setLines(r.lines);
        setUnitName(r.unitName);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [expanded, lines, loading, year]);

  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const fmtFor = (categoryId: string, v: number | null) => {
    if (v == null) return '—';
    const cat = catById.get(categoryId);
    return cat?.unitType === 'CURRENCY'
      ? fmtAmount(v, goal.defaultCurrency)
      : `${v} ${cat?.unitLabel ?? ''}`.trim();
  };
  const sourceLabel: Record<string, string> = {
    AGGREGATE: t('goals.aggregate.sourceAggregate'),
    DIRECT: t('goals.aggregate.sourceDirect'),
    FAITH: t('goals.aggregate.sourceFaith'),
  };
  // Une ligne sans engagement ni réalisé n'apprend rien au membre : on ne l'affiche pas.
  const filled = (lines ?? []).filter(
    (l) => (l.effectiveAmount ?? l.effectiveCount ?? 0) > 0 || (l.achievedAmount ?? l.achievedCount ?? 0) > 0,
  );

  return (
    <Card variant="paper2" style={styles.assemblyCard}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.assemblyHeader} hitSlop={6}>
        <Ionicons name="home-outline" size={18} color={colors.mossSoft} />
        <Text style={styles.assemblyTitle}>
          {t('goals.member.assemblyTitle')}
          {unitName ? ` · ${unitName}` : ''}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.assemblyHint}>{t('goals.member.assemblyHint')}</Text>
          {loading && <ActivityIndicator color={colors.moss} style={{ marginTop: 10 }} />}
          {!loading && filled.length === 0 && (
            <Text style={styles.assemblyEmpty}>{t('goals.member.assemblyEmpty')}</Text>
          )}
          {!loading &&
            filled.map((line) => {
              const cat = catById.get(line.categoryId);
              return (
                <View key={line.categoryId} style={styles.assemblyLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.assemblyCat}>{cat?.name ?? line.categoryCode}</Text>
                    <View style={styles.sourceBadge}>
                      <Text style={styles.sourceBadgeText}>
                        {sourceLabel[line.source] ?? line.source}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.assemblyCols}>
                    <View>
                      <Label>{t('goals.aggregate.retained')}</Label>
                      <Text style={[styles.assemblyValue, { fontWeight: '600' }]}>
                        {fmtFor(line.categoryId, line.effectiveAmount ?? line.effectiveCount)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Label>{t('goals.given')}</Label>
                      <Text style={styles.assemblyValue}>
                        {fmtFor(line.categoryId, line.achievedAmount ?? line.achievedCount)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
        </View>
      )}
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
}) {
  return (
    <ScreenShell>
      <View style={styles.centerBox}>
        <View style={styles.emptyBubble}>
          <Ionicons name={icon} size={30} color={colors.mossSoft} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyHint}>{hint}</Text>
      </View>
    </ScreenShell>
  );
}

// Styles alignés sur ceux de la vue assemblée (goals/index.tsx) — même hiérarchie visuelle.
const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  viewChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.mossTint,
  },
  viewChipText: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.mossSoft,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6 },
  banner: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 18,
  },
  // Palier A1 — bloc « Engagement de mon assemblée » (miroir de membersAgg* de la vue dirigeant).
  assemblyCard: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 14 },
  assemblyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assemblyTitle: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink,
  },
  assemblyHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  assemblyEmpty: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink3,
    lineHeight: 18,
    marginTop: 10,
  },
  assemblyLine: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  assemblyCat: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  assemblyCols: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  assemblyValue: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, marginTop: 2 },
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
