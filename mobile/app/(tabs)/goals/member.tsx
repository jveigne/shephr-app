import React, { useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import { YearSelector, GoalLineCard } from './index';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useGoalsData } from '../../../hooks/useGoalsData';
import { fmtDate } from '../../../utils/format';

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
  const { goal, lines, loading, error, reload } = useGoalsData(selectedYear, true);
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
            showProgress={false}
            onPress={() =>
              router.push(`/(tabs)/goals/pledge/${line.category.id}?year=${year ?? ''}&scope=member`)
            }
          />
        ))}
      </View>

      <Text style={styles.footnote}>{t('goals.member.hint')}</Text>
    </ScreenShell>
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
