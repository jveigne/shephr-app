import React, { useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import HandDivider from '../../../components/HandDivider';
import GoalAggregatesScreen from '../../../components/GoalAggregates';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useGoalsData, type GoalLine } from '../../../hooks/useGoalsData';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { fmtAmount, fmtDate } from '../../../utils/format';

export default function GoalsOverviewScreen() {
  const { me } = useAuth();

  // Lot 4.2 : un leader sans unité (DIRIGEANT_LEADER / COORDINATEUR) voit la vue
  // agrégée de son périmètre au lieu des engagements d'unité (UC-LDR-04, COO-04).
  const zoneId = me?.goalZoneId ?? null;
  const countryIds = me?.goalCountryIds ?? [];
  if (!me?.goalUnitId && (zoneId != null || countryIds.length > 0)) {
    return <GoalAggregatesScreen zoneId={zoneId} countryIds={countryIds} />;
  }

  return <UnitGoalsScreen />;
}

function UnitGoalsScreen() {
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
    return <EmptyState icon="flag-outline" title="Aucun objectif actif"
      hint="Aucun objectif quinquennal n'est actif pour le moment. Contactez votre coordinateur." />;
  }
  if (error === 'NO_UNIT') {
    return <EmptyState icon="link-outline" title="Compte non rattaché"
      hint="Votre compte n'est rattaché à aucune unité pour le module Objectifs. Contactez votre responsable." />;
  }
  if (error) {
    return <EmptyState icon="cloud-offline-outline" title="Erreur de chargement"
      hint="Impossible de charger vos engagements. Tirez pour réessayer." onRetry={onRefresh} />;
  }

  const deadline = goal?.submissionDeadline ? new Date(goal.submissionDeadline) : null;
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
        <Text style={styles.title}>Objectifs</Text>
      </View>
      <Text style={styles.subtitle}>
        {goal?.name} · {goal ? `${new Date(goal.startDate).getFullYear()}–${new Date(goal.endDate).getFullYear()}` : ''}
      </Text>

      {goal && (goal.openYears?.length ?? 0) > 0 && year != null && (
        <YearSelector years={goal.openYears} value={year} onChange={setSelectedYear} />
      )}

      {submitted ? (
        <Card variant="tinted" style={styles.banner}>
          <Ionicons name="lock-closed" size={18} color={colors.moss} />
          <Text style={styles.bannerText}>
            Engagements soumis{lockedAt ? ` le ${fmtDate(new Date(lockedAt))}` : ''}. Les montants sont
            verrouillés ; les avancements restent ouverts.
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
              ? `Échéance dépassée (${fmtDate(deadline)}) — soumettez vos engagements dès que possible.`
              : `À soumettre avant le ${fmtDate(deadline)}.`}
          </Text>
        </Card>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Engagements de mon unité</Text>
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
          label="Soumettre mes engagements"
          onPress={() => router.push(`/(tabs)/goals/submit?year=${year ?? ''}`)}
          disabled={!hasPledges}
          fullWidth
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="lock-closed-outline" size={18} color={colors.white} />}
        />
      )}
      {!submitted && !hasPledges && (
        <Text style={styles.footnote}>
          Saisissez au moins un engagement avant de soumettre.
        </Text>
      )}

      {hasPledges && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button
            label="Saisir un avancement"
            variant="soft"
            onPress={() => router.push(`/(tabs)/goals/progress?year=${year ?? ''}`)}
            style={{ flex: 1 }}
            iconLeft={<Ionicons name="trending-up-outline" size={17} color={colors.mossDeep} />}
          />
          <Button
            label="Historique"
            variant="ghost"
            onPress={() => router.push(`/(tabs)/goals/history?year=${year ?? ''}`)}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </ScreenShell>
  );
}

/** Sélecteur d'année (annualisation Lot 4.6) — chips horizontaux ; 2026/2030 = jalons (★). */
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
              {y === 2026 || y === 2030 ? ' ★' : ''}
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
              ? 'À compléter'
              : pledge.locked
              ? 'Soumis'
              : 'Brouillon'}
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
              <Label>Engagé</Label>
              <Text style={styles.lineValue}>{target != null ? fmtValue(target) : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>Versé</Label>
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
  return (
    <ScreenShell>
      <View style={styles.centerBox}>
        <View style={styles.emptyBubble}>
          <Ionicons name={icon} size={30} color={colors.mossSoft} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyHint}>{hint}</Text>
        {onRetry && (
          <Button label="Réessayer" variant="ghost" onPress={onRetry} style={{ marginTop: 18 }} />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
