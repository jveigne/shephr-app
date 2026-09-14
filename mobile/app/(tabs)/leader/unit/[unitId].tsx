import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import Amount from '../../../../components/Amount';
import Chip from '../../../../components/Chip';
import ErrorBanner from '../../../../components/ErrorBanner';
import { colors, fonts } from '../../../../theme';
import {
  listMyMembers,
  listMyUnits,
  type LeaderMemberView,
  type LeaderUnitView,
} from '../../../../services/leaderApi';
import { getByUnit, type DonationByUnitStat } from '../../../../services/statsApi';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { toLocalDate } from '../../../../utils/format';
import { sumByCurrency, type CurrencyLine } from '../../../../utils/currencyTotals';

type Period = 'month' | '3m' | '6m' | 'year';

const PERIODS: Period[] = ['month', '3m', '6m', 'year'];

/**
 * Détail d'une assemblée du périmètre de TRÉSORERIE — Lot T4 (14/09).
 *
 * Les trois appels exigent depuis T2 une affectation de trésorier couvrant cette assemblée. Un
 * échec est annoncé (bandeau + « Réessayer ») au lieu d'un écran de zéros, et les totaux sont
 * affichés par devise : le filtre `currency === 'GBP'` masquait purement et simplement les dons
 * en euros ou en dollars.
 */
export default function UnitDetailScreen() {
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const { t } = useLanguage();
  const periodLabel = (k: Period) => t('history.periods.' + k);
  const [period, setPeriod] = useState<Period>('month');
  const [unit, setUnit] = useState<LeaderUnitView | null>(null);
  const [unitStats, setUnitStats] = useState<DonationByUnitStat[]>([]);
  const [members, setMembers] = useState<LeaderMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const from = useMemo(() => {
    const d = new Date();
    if (period === 'month') d.setMonth(d.getMonth() - 1);
    else if (period === '3m') d.setMonth(d.getMonth() - 3);
    else if (period === '6m') d.setMonth(d.getMonth() - 6);
    else d.setFullYear(d.getFullYear() - 1);
    return toLocalDate(d);
  }, [period]);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setFailed(false);
    try {
      const [units, stats, allMembers] = await Promise.all([
        listMyUnits(),
        getByUnit({ from }),
        listMyMembers({ from }),
      ]);
      setUnit(units.find((u) => u.unitId === unitId) ?? null);
      setUnitStats(stats.filter((s) => s.unitId === unitId));
      setMembers(allMembers.filter((m) => m.unitId === unitId));
    } catch {
      setUnitStats([]);
      setMembers([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [unitId, from]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  // L'assemblée est introuvable (hors périmètre) ou le chargement a échoué : on le dit.
  if (!unit) {
    return (
      <ScreenShell>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.ink2} />
          </Pressable>
        </View>
        <ErrorBanner message={t('unit.loadError')} onRetry={load} />
      </ScreenShell>
    );
  }

  const totals: CurrencyLine[] = sumByCurrency(unitStats);
  // Moyenne PAR DEVISE : diviser un total toutes devises confondues par un nombre de membres
  // produirait un chiffre que personne ne peut présenter devant un conseil d'assemblée.
  const memberTotals: CurrencyLine[] = sumByCurrency(
    members.flatMap((m) => m.donationTotals),
  );
  const averages: CurrencyLine[] =
    members.length > 0
      ? memberTotals.map((l) => ({ ...l, total: l.total / members.length }))
      : [];

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.inviteBtn}
          onPress={() =>
            router.push({
              pathname: '/invite',
              params: { unitId: unit.unitId, unitName: unit.unitName },
            })
          }
        >
          <Ionicons name="add" size={14} color={colors.white} />
          <Text style={styles.inviteText}>{t('unit.invite')}</Text>
        </Pressable>
      </View>

      {/* Chantier B : le type CENTER n'existe plus — toute unité est une assemblée de maison. */}
      <View style={styles.typePill}>
        <Text style={styles.typePillText}>
          {t('unit.assembly')} · {unit.localityName}
        </Text>
      </View>

      <Text style={styles.title}>{unit.unitName}</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={periodLabel(p)}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </View>

      {failed && <ErrorBanner message={t('unit.loadError')} onRetry={load} />}

      <View style={styles.statsRow}>
        <Card style={[styles.statCard, { flex: 1.6 }]}>
          <Label style={{ color: colors.mossSoft }}>{t('unit.total')}</Label>
          {totals.length === 0 ? (
            <Text style={styles.emptyLine}>{t('leader.noDataPeriod')}</Text>
          ) : (
            totals.map((l, i) => (
              <View key={l.currency} style={i > 0 ? styles.extraCurrency : undefined}>
                <Amount value={l.total} currency={l.currency} size={i === 0 ? 24 : 18} />
              </View>
            ))
          )}
        </Card>
        <Card style={[styles.statCard, { flex: 1 }]}>
          <Label style={{ color: colors.mossSoft }}>{t('unit.members')}</Label>
          <Text style={styles.bigNum}>{members.length}</Text>
        </Card>
        <Card style={[styles.statCard, { flex: 1 }]}>
          <Label style={{ color: colors.mossSoft }}>{t('unit.average')}</Label>
          {averages.length === 0 ? (
            <Text style={styles.emptyLine}>—</Text>
          ) : (
            averages.map((l, i) => (
              <View key={l.currency} style={i > 0 ? styles.extraCurrency : undefined}>
                <Amount value={Math.round(l.total)} currency={l.currency} size={i === 0 ? 22 : 16} />
              </View>
            ))
          )}
        </Card>
      </View>

      <View style={styles.privacyBox}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.mossSoft} />
        <Text style={styles.privacyText}>
          {t('unit.privacyNote')}
        </Text>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('unit.faithful')}</Text>
        <Text style={styles.sectionCount}>{t('unit.shownMembers', { count: members.length })}</Text>
      </View>

      <Card style={{ marginTop: 10, paddingVertical: 0 }}>
        {members.length === 0 ? (
          <View style={{ paddingHorizontal: 18, paddingVertical: 18 }}>
            <Text style={{ fontFamily: fonts.sans, color: colors.ink3, fontStyle: 'italic' }}>
              {t('unit.noMembersPeriod')}
            </Text>
          </View>
        ) : (
          members.map((m, i) => {
            const memberLines = sumByCurrency(m.donationTotals);
            const initials = m.fullName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase() ?? '')
              .join('');
            return (
              <View
                key={m.userId}
                style={[
                  styles.memberRow,
                  i < members.length - 1 && styles.memberRowBorder,
                ]}
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitials}>{initials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.fullName}
                  </Text>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {m.active ? t('unit.memberActive') : t('unit.memberInactive')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {memberLines.length === 0 ? (
                    <Text style={styles.emptyLine}>—</Text>
                  ) : (
                    memberLines.map((l) => (
                      <Amount key={l.currency} value={l.total} currency={l.currency} size={16} />
                    ))
                  )}
                </View>
              </View>
            );
          })
        )}
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.moss,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  inviteText: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.white },
  iconChip: {
    backgroundColor: 'rgba(42,38,32,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 99,
  },
  typePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(201,149,107,0.20)',
  },
  typePillText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.earthDeep,
  },
  extraCurrency: { marginTop: 4 },
  emptyLine: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 6,
    lineHeight: 30,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statCard: { paddingHorizontal: 14, paddingVertical: 14 },
  bigNum: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, marginTop: 4 },
  privacyBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,47,0.06)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  privacyText: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossDeep, lineHeight: 18 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 20,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  sectionCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)' },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(30,58,47,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: { fontFamily: fonts.serif, fontSize: 14, color: colors.mossSoft },
  memberName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  memberSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.ink3, marginTop: 1 },
});
