import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import ScreenShell from '../../../components/ScreenShell';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import { YearSelector, GoalLineCard, GoalEmptyState } from '../../../components/GoalCards';
import UnitMembersAggregate from '../../../components/UnitMembersAggregate';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { hasGoalsAccess, hasPerimeterView } from '../../../services/authApi';
import { useGoalsData } from '../../../hooks/useGoalsData';
import {
  getMyAssemblyGoal,
  type ActiveGoal,
  type MyAssemblyGoalResponse,
} from '../../../services/goalsApi';
import { fmtDate, fmtAmount } from '../../../utils/format';

/**
 * « Mes objectifs » — l'écran de TOUT LE MONDE depuis le chantier du 16/08.
 *
 * <p>RG-BQ-01/11 : un engagement est personnel, y compris celui d'un dirigeant. Il n'existe donc
 * plus d'écran de saisie « au nom de l'assemblée » ; un dirigeant déclare ici, dans SON assemblée,
 * et retrouve ses vues de lecture (périmètre, assemblées, détail nominatif) en bas de page.
 *
 * <p>⚠ L'affichage des actions d'écriture est piloté par `PledgeResponse.editable` (server-driven,
 * `anyEditable`), jamais par un calcul local de la date limite : la date limite bloque toujours
 * (RG-BQ-07), mais le SECRETARIAT et le LEADER passent outre côté serveur.
 */
export default function MemberGoalsScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { goal, pledges, lines, submitted, anyEditable, loading, error, reload } =
    useGoalsData(selectedYear);
  const [refreshing, setRefreshing] = useState(false);
  const year = selectedYear ?? goal?.currentYear ?? null;
  const leader = hasGoalsAccess(me);
  // « Mon périmètre » n'est proposé que s'il a quelque chose à montrer : un dirigeant sans nœud
  // porté ET sans sous-arbre lisible tombait sur un état vide trompeur (cf. `hasPerimeterView`).
  const perimeter = hasPerimeterView(me);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  // RG-BQ-03 : sans assemblée de rattachement, on ne peut rien déclarer. RG-BQ-13 : on en change
  // soi-même, sans demande ni valideur — c'est donc l'action proposée ici.
  if (!me?.goalUnitId) {
    return (
      <GoalEmptyState
        icon="link-outline"
        title={t('goals.member.title')}
        hint={t('goals.member.noAssembly')}
        actionLabel={t('assembly.changeCta')}
        onAction={() => router.push('/(tabs)/goals/assembly')}
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
      <GoalEmptyState
        icon="flag-outline"
        title={t('goals.noGoalTitle')}
        hint={t('goals.noGoalHint')}
      />
    );
  }

  if (error) {
    return (
      <GoalEmptyState
        icon="cloud-offline-outline"
        title={t('goals.loadingError')}
        hint={t('goals.loadingErrorHint')}
        onRetry={onRefresh}
      />
    );
  }

  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal). Affichage SEULEMENT — la
  // permission d'écrire vient de `editable`.
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
              router.push(`/(tabs)/goals/pledge/${line.category.id}?year=${year ?? ''}`)
            }
          />
        ))}
      </View>

      {/* L'AVANCEMENT n'est pas verrouillé par la soumission (« les montants sont verrouillés,
          l'état actuel reste modifiable ») : on ne le gate donc pas sur `anyEditable`, qui décrit
          l'éditabilité de l'ENGAGEMENT. Passée la date limite, le serveur refuse (DEADLINE_PASSED)
          et l'écran de saisie affiche le message — on ne recalcule pas la fenêtre ici. */}
      {pledges.length > 0 && (
        <Button
          label={t('goals.addProgress')}
          variant="soft"
          onPress={() => router.push(`/(tabs)/goals/progress?year=${year ?? ''}`)}
          fullWidth
          style={{ marginTop: 16 }}
          iconLeft={<Ionicons name="trending-up-outline" size={18} color={colors.mossDeep} />}
        />
      )}
      {pledges.length > 0 && (
        <Button
          label={t('goals.historyBtn')}
          variant="ghost"
          onPress={() => router.push(`/(tabs)/goals/history?year=${year ?? ''}`)}
          fullWidth
          style={{ marginTop: 10 }}
        />
      )}

      {submitted ? (
        <Card variant="paper2" style={styles.banner}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.moss} />
          <Text style={styles.bannerText}>{t('goals.member.submittedBanner')}</Text>
        </Card>
      ) : (
        pledges.length > 0 && anyEditable && (
          <Button
            label={t('goals.member.submitCta')}
            onPress={() => router.push(`/(tabs)/goals/submit?year=${year ?? ''}`)}
            fullWidth
            style={{ marginTop: 16 }}
            iconLeft={<Ionicons name="lock-closed-outline" size={18} color={colors.white} />}
          />
        )
      )}

      {/* Engagement de mon assemblée — ANONYME (RG-BQ-05, exception du simple membre). */}
      {year != null && <MyAssemblyBlock year={year} goal={goal} />}

      {/* Détail NOMINATIF — réservé aux dirigeants (403 pour un simple membre). */}
      {leader && year != null && me?.goalUnitId && (
        <UnitMembersAggregate unitId={me.goalUnitId} year={year} goal={goal} />
      )}

      {/* Vues de lecture du dirigeant (RG-BQ-04) : elles ne sont plus l'écran d'entrée. */}
      {leader && (
        <View style={{ gap: 8, marginTop: 16 }}>
          {perimeter && (
            <Card variant="paper2" style={styles.navCard} onPress={() => router.push('/(tabs)/goals/perimeter')}>
              <Ionicons name="stats-chart-outline" size={18} color={colors.mossDeep} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.navTitle}>{t('goals.nav.perimeter')}</Text>
                <Text style={styles.navHint}>{t('goals.nav.perimeterHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </Card>
          )}
          <Card variant="paper2" style={styles.navCard} onPress={() => router.push('/(tabs)/goals/units')}>
            <Ionicons name="home-outline" size={18} color={colors.mossDeep} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.navTitle}>{t('goals.nav.units')}</Text>
              <Text style={styles.navHint}>{t('goals.nav.unitsHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </Card>
        </View>
      )}

      {/* RG-BQ-13 — changer d'assemblée soi-même, sans demande ni valideur. */}
      <Card variant="paper2" style={styles.navCard} onPress={() => router.push('/(tabs)/goals/assembly')}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.mossDeep} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.navTitle}>{t('assembly.changeCta')}</Text>
          <Text style={styles.navHint}>{t('assembly.changeHintShort')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </Card>

      <Text style={styles.footnote}>{t('goals.member.hint')}</Text>
    </ScreenShell>
  );
}

/**
 * Palier A1 (JP 14/08, révisé 16/08) — bloc replié « Engagement de mon assemblée ».
 *
 * <p>Sans AUCUNE donnée nominative : c'est ce qui le distingue de `UnitMembersAggregate`, réservé
 * aux dirigeants. Un simple membre voit le total engagé de son assemblée et le compteur de
 * soumission (« 7/12 membres ont soumis »), pas qui a déclaré quoi.
 *
 * <p>Le badge de source et le libellé « Retenu (MAX) » ont disparu : une ligne porte UNE valeur,
 * la somme des engagements des membres (RG-BQ-02).
 */
function MyAssemblyBlock({ year, goal }: { year: number; goal: ActiveGoal }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<MyAssemblyGoalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  /** Code d'erreur brut du backend (`ApiError.error`), traduit à l'affichage. */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  /** Une tentative a eu lieu — succès OU échec. Sans ce drapeau, un échec relancerait l'appel en
   *  boucle : `loading` repasse à false, l'effet se rejoue et `data` est toujours null. */
  const [loaded, setLoaded] = useState(false);

  // L'année change → on invalide, le contenu sera rechargé au prochain dépli.
  useEffect(() => {
    setData(null);
    setErrorCode(null);
    setLoaded(false);
  }, [year]);

  useEffect(() => {
    if (!expanded || loaded || loading) return;
    setLoading(true);
    getMyAssemblyGoal(year)
      .then((d) => {
        setData(d);
        setErrorCode(null);
      })
      .catch((e: any) => {
        setData(null);
        setErrorCode(e?.response?.data?.error ?? 'UNKNOWN');
      })
      .finally(() => {
        setLoaded(true);
        setLoading(false);
      });
  }, [expanded, loaded, loading, year]);

  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const fmtFor = (categoryId: string, v: number | null) => {
    if (v == null) return '—';
    const cat = catById.get(categoryId);
    return cat?.unitType === 'CURRENCY'
      ? fmtAmount(v, goal.defaultCurrency)
      : `${v} ${cat?.unitLabel ?? ''}`.trim();
  };
  // Une ligne sans engagement ni réalisé n'apprend rien au membre : on ne l'affiche pas.
  const filled = (data?.lines ?? []).filter(
    (l) => (l.effectiveAmount ?? l.effectiveCount ?? 0) > 0 || (l.achievedAmount ?? l.achievedCount ?? 0) > 0,
  );

  return (
    <Card variant="paper2" style={styles.assemblyCard}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.assemblyHeader} hitSlop={6}>
        <Ionicons name="home-outline" size={18} color={colors.mossSoft} />
        <Text style={styles.assemblyTitle}>
          {t('goals.member.assemblyTitle')}
          {data?.unitName ? ` · ${data.unitName}` : ''}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.assemblyHint}>{t('goals.member.assemblyHint')}</Text>
          {loading && <ActivityIndicator color={colors.moss} style={{ marginTop: 10 }} />}

          {/* RG-BQ-06 — le suivi de soumission est un COMPTEUR DE PERSONNES, jamais un booléen. */}
          {!loading && data != null && data.totalMembers > 0 && (
            <View style={styles.assemblyCounterRow}>
              <Text style={styles.assemblyCounter}>
                {t('goals.members.submittedRatioLong', {
                  submitted: data.submittedMembers,
                  total: data.totalMembers,
                })}
              </Text>
              {data.lateMembers > 0 && (
                <Text style={styles.assemblyLate}>
                  {t('goals.members.lateCount', { count: data.lateMembers })}
                </Text>
              )}
            </View>
          )}

          {/* 422 USER_NO_GOAL_UNIT : le rattachement a sauté depuis le chargement de `me` (auto
              changement d'assemblée sur un autre appareil, réaffectation par le secrétariat). Le
              dire, plutôt que laisser croire que l'assemblée n'a rien déclaré. */}
          {!loading && errorCode != null && (
            <Text style={styles.assemblyEmpty}>
              {errorCode === 'USER_NO_GOAL_UNIT'
                ? t('errors.goals.USER_NO_GOAL_UNIT')
                : t('errors.tryAgain')}
            </Text>
          )}
          {!loading && errorCode == null && filled.length === 0 && (
            <Text style={styles.assemblyEmpty}>{t('goals.member.assemblyEmpty')}</Text>
          )}
          {!loading &&
            filled.map((line) => {
              const cat = catById.get(line.categoryId);
              return (
                <View key={line.categoryId} style={styles.assemblyLine}>
                  <Text style={styles.assemblyCat}>{cat?.name ?? line.categoryCode}</Text>
                  <View style={styles.assemblyCols}>
                    <View>
                      <Label>{t('goals.pledged')}</Label>
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

// Styles alignés sur ceux des primitives partagées (components/GoalCards.tsx).
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
  navCard: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  navHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 18,
  },
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
  assemblyCounterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 },
  assemblyCounter: {
    fontFamily: fonts.sans, fontSize: 12, fontWeight: '700', color: colors.mossDeep,
    backgroundColor: colors.mossTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99,
  },
  assemblyLate: { fontFamily: fonts.sans, fontSize: 12, color: colors.clay },
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
  centerBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
});
