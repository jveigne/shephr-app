import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import { UnitStatusBadge } from '../../../components/GoalAggregates';
import UnitMembersAggregate from '../../../components/UnitMembersAggregate';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { fmtAmount } from '../../../utils/format';
import {
  getActiveGoal,
  getMyUnits,
  getUnitDetail,
  type ActiveGoal,
  type UnitPledgeDetail,
  type ZoneUnitStatus,
} from '../../../services/goalsApi';

/**
 * « Mes assemblées » — drill-down du dirigeant, en LECTURE SEULE.
 *
 * <p>Palier A3 (JP 14/08), révisé le 16/08 : ouvrir une assemblée n'ouvre plus un écran de saisie
 * (RG-BQ-11 — un dirigeant ne déclare plus pour son assemblée) mais son DÉTAIL : la somme engagée
 * par catégorie, puis le détail nominatif de ses membres (RG-BQ-05).
 *
 * <p>Le statut vient de `GET /goals/me/units`, à la maille PERSONNE : « 7/12 ont soumis », plus un
 * booléen d'assemblée. Si l'appel ne renvoie rien, on retombe sur les assemblées portées par le
 * compte (`me.assemblies`) : mieux vaut une liste sans badge qu'un écran vide.
 */
export default function MyUnitsScreen() {
  const { t } = useLanguage();
  const { me } = useAuth();
  const [units, setUnits] = useState<ZoneUnitStatus[]>([]);
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  /**
   * L'appel a été REFUSÉ (403) ou a échoué. Sans ce drapeau, `GET /goals/me/units` — gardé par
   * `requireSubCoordinatorLeader`, qui exclut le superAdmin et les rôles ministère-large — rendait
   * son refus en « Aucune assemblée rattachée à votre compte », un message faux (chantier 16/08).
   */
  const [error, setError] = useState<'denied' | 'failed' | null>(null);

  /** Assemblées portées par le compte, dans l'ordre du backend (principale en tête). */
  const myAssemblies = me?.assemblies ?? [];
  const myUnitIds = new Set(
    myAssemblies.length > 0
      ? myAssemblies.map((a) => a.id)
      : [me?.goalUnitId, ...(me?.goalUnitIds ?? [])].filter(Boolean) as string[],
  );

  const load = async () => {
    try {
      const g = await getActiveGoal();
      setGoal(g);
      setYear(g.currentYear);
      try {
        setUnits(await getMyUnits(g.currentYear));
        setError(null);
      } catch (e: any) {
        setUnits([]);
        setError(e?.response?.status === 403 ? 'denied' : 'failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // Une assemblée ouverte : son détail, en lecture (RG-BQ-05).
  if (selected && goal && year != null) {
    return (
      <UnitDetailScreen
        unitId={selected.id}
        unitName={selected.name}
        goal={goal}
        year={year}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  // Les assemblées du compte d'abord (celles qu'il dirige en propre), puis celles de son sous-arbre.
  const mine = units.filter((u) => myUnitIds.has(u.unitId));
  const others = units.filter((u) => !myUnitIds.has(u.unitId));
  const rows: { unitId: string; unitName: string; localityName: string | null; status?: ZoneUnitStatus }[] =
    units.length > 0
      ? [...mine, ...others].map((u) => ({
          unitId: u.unitId,
          unitName: u.unitName,
          localityName: u.localityName,
          status: u,
        }))
      : myAssemblies.map((a) => ({ unitId: a.id, unitName: a.name, localityName: a.cityName }));

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
          {t('views.badge')} : {t('views.myUnits')}
        </Text>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('goals.myUnits.title')}</Text>
      </View>
      <Text style={styles.hint}>{t('goals.myUnits.hint')}</Text>

      {rows.length === 0 && error != null ? (
        /* Un refus n'est pas une absence : le dire, plutôt que d'affirmer « aucune assemblée ».
           Le repli sur `me.assemblies` reste prioritaire — c'est de la donnée vraie. */
        <Card variant="paper2" style={styles.errorCard}>
          <View style={styles.errorHead}>
            <Ionicons
              name={error === 'denied' ? 'lock-closed-outline' : 'cloud-offline-outline'}
              size={18}
              color={colors.clay}
            />
            <Text style={styles.errorTitle}>
              {t(error === 'denied' ? 'goalsAgg.deniedTitle' : 'goalsAgg.loadErrorTitle')}
            </Text>
          </View>
          <Text style={styles.errorHint}>
            {t(error === 'denied' ? 'goals.myUnits.deniedHint' : 'goalsAgg.loadErrorHint')}
          </Text>
        </Card>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('goals.myUnits.empty')}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 12 }}>
          {rows.map((row) => (
            <Pressable
              key={row.unitId}
              onPress={() => setSelected({ id: row.unitId, name: row.unitName })}
            >
              <Card variant="paper2" style={styles.unitCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitName}>{row.unitName}</Text>
                  {!!row.localityName && <Text style={styles.unitCity}>{row.localityName}</Text>}
                  {row.status && row.status.totalMembers > 0 && (
                    <Text style={styles.unitCity}>
                      {t('goals.members.submittedRatioLong', {
                        submitted: row.status.submittedMembers,
                        total: row.status.totalMembers,
                      })}
                    </Text>
                  )}
                </View>
                {row.status && <UnitStatusBadge unit={row.status} />}
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {year != null && <Text style={styles.footnote}>{t('goals.myUnits.yearNote', { year })}</Text>}
    </ScreenShell>
  );
}

/** Détail d'UNE assemblée : somme engagée par catégorie + détail nominatif de ses membres. */
function UnitDetailScreen({
  unitId,
  unitName,
  goal,
  year,
  onBack,
}: {
  unitId: string;
  unitName: string;
  goal: ActiveGoal;
  year: number;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<UnitPledgeDetail[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUnitDetail(unitId, year)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [unitId, year]);

  const currency = goal.defaultCurrency;
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));

  return (
    <ScreenShell>
      <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={colors.mossDeep} />
        <Text style={styles.backRowText}>{t('goals.myUnits.back')}</Text>
      </Pressable>

      <View style={styles.titleRow}>
        <Ionicons name="home-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{unitName}</Text>
      </View>
      <Text style={styles.hint}>{t('goalsAgg.unitPledgesSub', { year })}</Text>

      <Card variant="paper2" style={styles.detailCard}>
        <Label style={{ marginBottom: 8 }}>{t('goalsAgg.unitPledgesTitle', { name: unitName })}</Label>
        {loading && <ActivityIndicator color={colors.moss} />}
        {!loading && (detail ?? []).length === 0 && (
          <Text style={styles.empty}>{t('goalsAgg.noPledgeInUnit')}</Text>
        )}
        {!loading && (detail ?? []).map((d) => {
          const cat = catByCode.get(d.categoryCode);
          const pledged = d.unitType === 'CURRENCY'
            ? d.targetAmount != null ? fmtAmount(d.targetAmount, currency) : '—'
            : d.targetCount != null ? `${d.targetCount} ${cat?.unitLabel ?? ''}`.trim() : '—';
          const paid = d.unitType === 'CURRENCY'
            ? fmtAmount(d.achievedAmount ?? 0, currency)
            : `${d.achievedCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
          return (
            <View key={d.categoryId} style={styles.detailRow}>
              <Text style={styles.unitName}>{cat?.name ?? d.categoryCode}</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={styles.unitCity}>{t('goalsAgg.colPledged')} : {pledged}</Text>
                <Text style={styles.unitCity}>{t('goalsAgg.colPaid')} : {paid}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      {/* RG-BQ-05 — le drill-down descend jusqu'au membre. */}
      <UnitMembersAggregate unitId={unitId} year={year} goal={goal} defaultExpanded />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 6, paddingVertical: 4 },
  backRowText: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.mossDeep },
  viewChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.mossTint,
  },
  viewChipText: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '600', color: colors.mossSoft },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6, lineHeight: 18 },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 16, lineHeight: 19 },
  errorCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 16 },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '700', color: colors.clay, flex: 1 },
  errorHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  unitName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  unitCity: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  detailCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 14 },
  detailRow: {
    gap: 3,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 18,
  },
  centerBox: { alignItems: 'center', paddingTop: 80 },
});
