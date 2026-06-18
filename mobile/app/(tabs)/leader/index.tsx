import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Amount from '../../../components/Amount';
import HandDivider from '../../../components/HandDivider';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { canManageStructure } from '../../../services/authApi';
import { listMyUnits, type LeaderUnitView } from '../../../services/leaderApi';
import {
  getByCategory,
  getByUnit,
  getSummary,
  type DonationByCategoryStat,
  type DonationByUnitStat,
  type DonationSummary,
} from '../../../services/statsApi';
import { CATEGORIES, type DonationCategory } from '../../../constants/categories';
import { fmtAmount, monthLabel } from '../../../utils/format';

const PRIMARY = 'GBP';

export default function LeaderHomeScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [units, setUnits] = useState<LeaderUnitView[]>([]);
  const [unitStats, setUnitStats] = useState<DonationByUnitStat[]>([]);
  const [catStats, setCatStats] = useState<DonationByCategoryStat[]>([]);
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [u, us, cs, s] = await Promise.allSettled([
      listMyUnits(),
      getByUnit({}),
      getByCategory({}),
      getSummary(),
    ]);
    if (u.status === 'fulfilled') setUnits(u.value);
    if (us.status === 'fulfilled') setUnitStats(us.value);
    if (cs.status === 'fulfilled') setCatStats(cs.value);
    if (s.status === 'fulfilled') setSummary(s.value);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const scopeTotal = unitStats
    .filter((u) => u.currency === PRIMARY)
    .reduce((s, u) => s + u.total, 0);

  const personalThisMonth =
    summary?.currentMonth.find((t) => t.currency === PRIMARY)?.total ?? 0;

  const totalCats = catStats
    .filter((c) => c.currency === PRIMARY)
    .reduce((s, c) => s + c.total, 0);

  const topCats = catStats
    .filter((c) => c.currency === PRIMARY)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const today = new Date();

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }} />
        {canManageStructure(me) && (
          <Pressable onPress={() => router.push('/structure')} style={styles.statsBtn}>
            <Ionicons name="git-branch-outline" size={15} color={colors.mossSoft} />
            <Text style={styles.statsBtnText}>{t('leader.structure')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push('/(tabs)/leader/stats')}
          style={styles.statsBtn}
        >
          <Ionicons name="stats-chart-outline" size={15} color={colors.mossSoft} />
          <Text style={styles.statsBtnText}>{t('leader.stats')}</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Ionicons name="people-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('leader.title')}</Text>
      </View>
      <Text style={styles.subtitle}>
        {t('leader.overview', { month: monthLabel(today.getMonth(), true), count: units.length })}
      </Text>

      <Card style={styles.personalCard}>
        <View style={styles.userIcon}>
          <Ionicons name="person-outline" size={20} color={colors.mossSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>{t('leader.yourDonations')}</Label>
          <Amount value={personalThisMonth} currency={PRIMARY} size={22} />
        </View>
        <Pressable onPress={() => router.push('/(tabs)/donations')}>
          <Text style={styles.detailLink}>{t('leader.detail')}</Text>
        </Pressable>
      </Card>

      <View style={styles.statsTwo}>
        <Card style={styles.statBig}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.receivedMonth')}</Label>
          <Amount value={scopeTotal} currency={PRIMARY} size={34} />
        </Card>
        <Card style={styles.statSmall}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.activeMembers')}</Label>
          <Text style={styles.bigNumber}>—</Text>
          <Text style={styles.bigNumberSub}>{t('leader.last3Months')}</Text>
        </Card>
      </View>

      <Card style={styles.topCatsCard}>
        <View style={styles.topCatHeader}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.topCategories')}</Label>
          <Text style={styles.monoTiny}>{t('leader.thisMonthShort')}</Text>
        </View>
        <View style={{ gap: 12 }}>
          {topCats.map((c) => {
            const meta =
              CATEGORIES[c.category as DonationCategory] ?? CATEGORIES.autre;
            const pct = totalCats > 0 ? Math.round((c.total / totalCats) * 100) : 0;
            return (
              <View key={c.category}>
                <View style={styles.catLineHead}>
                  <View style={[styles.catSquare, { backgroundColor: meta.tone + '1F' }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.tone} />
                  </View>
                  <Text style={styles.catLineLabel}>{t('categories.' + meta.key)}</Text>
                  <Text style={styles.catLineAmt}>{fmtAmount(c.total, PRIMARY)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.tone }]} />
                </View>
              </View>
            );
          })}
          {topCats.length === 0 && (
            <Text style={{ fontFamily: fonts.sans, color: colors.ink3, fontStyle: 'italic' }}>
              {t('leader.noDataPeriod')}
            </Text>
          )}
        </View>
      </Card>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('leader.myUnits')}</Text>
        <Text style={styles.sectionCount}>{t('leader.unitsCount', { count: units.length })}</Text>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {units.map((u) => {
          const stats =
            unitStats.find((s) => s.unitId === u.unitId && s.currency === PRIMARY) ?? null;
          return (
            <Card
              key={u.unitId}
              onPress={() => router.push(`/(tabs)/leader/unit/${u.unitId}`)}
              style={styles.unitCard}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={[
                    styles.unitIcon,
                    {
                      backgroundColor:
                        u.type === 'CENTER' ? 'rgba(30,58,47,0.10)' : 'rgba(201,149,107,0.20)',
                    },
                  ]}
                >
                  <Ionicons
                    name={u.type === 'CENTER' ? 'business-outline' : 'people-outline'}
                    size={18}
                    color={u.type === 'CENTER' ? colors.moss : colors.earthDeep}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.unitName}>{u.unitName}</Text>
                  <Text style={styles.unitMeta}>
                    {u.type === 'CENTER' ? t('leader.center') : t('leader.assembly')} · {u.localityName}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </View>
              <HandDivider style={{ marginVertical: 12 }} />
              <View style={styles.unitFooter}>
                <View>
                  <Label>{t('leader.receivedMonth')}</Label>
                  <Amount value={stats?.total ?? 0} currency={PRIMARY} size={22} />
                </View>
                <Text style={styles.unitCount}>
                  {t('leader.donations', { count: stats?.count ?? 0 })}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(42,38,32,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  statsBtnText: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.mossSoft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  personalCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,47,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLink: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 13, color: colors.earthDeep },
  statsTwo: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBig: { paddingHorizontal: 18, paddingVertical: 18, flex: 1.4 },
  statSmall: { paddingHorizontal: 18, paddingVertical: 18, flex: 1 },
  bigNumber: { fontFamily: fonts.serif, fontSize: 34, color: colors.ink, marginTop: 6 },
  bigNumberSub: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 4 },
  topCatsCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 14 },
  topCatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  monoTiny: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  catLineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  catSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLineLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  catLineAmt: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2 },
  barTrack: { height: 6, backgroundColor: 'rgba(42,38,32,0.05)', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 24,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  sectionCount: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  unitCard: { paddingHorizontal: 18, paddingVertical: 16 },
  unitIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unitName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  unitMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, letterSpacing: 0.2 },
  unitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  unitCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
});
