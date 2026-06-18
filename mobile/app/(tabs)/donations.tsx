import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import DonationRow from '../../components/DonationRow';
import { colors, fonts } from '../../theme';
import { CATEGORIES, CATEGORY_ORDER } from '../../constants/categories';
import {
  listDonations,
  type DonationResponse,
} from '../../services/donationApi';
import { fmtAmount, monthLabel, parseLocalDate, toLocalDate } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';

type Period = 'month' | '3m' | '6m' | 'year' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Ce mois' },
  { key: '3m', label: '3 mois' },
  { key: '6m', label: '6 mois' },
  { key: 'year', label: 'Année' },
  { key: 'all', label: 'Tout' },
];

export default function DonationsScreen() {
  const { t } = useLanguage();
  const periodLabel = (k: Period) => t('history.periods.' + k);
  const [period, setPeriod] = useState<Period>('month');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [donations, setDonations] = useState<DonationResponse[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const from = useMemo(() => computeFrom(period), [period]);

  const load = useCallback(async () => {
    try {
      const res = await listDonations({
        from: from ?? undefined,
        category: catFilter === 'all' ? undefined : catFilter,
        size: 100,
      });
      setDonations(res.content);
    } catch {
      setDonations([]);
    }
  }, [from, catFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const total = donations.reduce((s, d) => s + d.amount, 0);
  const grouped = groupByMonth(donations);

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>{t('history.title')}</Text>

      <Card style={styles.totalCard}>
        <Label style={{ color: colors.mossSoft }}>{t('history.totalPeriod')}</Label>
        <View style={styles.totalRow}>
          <Amount value={total} currency="GBP" size={32} showDecimals />
          <Text style={styles.count}>
            {t('history.donations', { count: donations.length })}
          </Text>
        </View>
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
        style={{ marginTop: 16 }}
      >
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            label={periodLabel(p.key)}
            selected={period === p.key}
            onPress={() => setPeriod(p.key)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
        style={{ marginTop: 4 }}
      >
        <Chip
          label={t('history.categoriesAll')}
          accent
          selected={catFilter === 'all'}
          onPress={() => setCatFilter('all')}
        />
        {CATEGORY_ORDER.map((k) => {
          const c = CATEGORIES[k];
          return (
            <Chip
              key={k}
              accent
              label={t('categories.' + c.key)}
              selected={catFilter === k}
              onPress={() => setCatFilter(k)}
              iconLeft={
                <Ionicons
                  name={c.icon}
                  size={12}
                  color={catFilter === k ? colors.white : colors.ink3}
                />
              }
            />
          );
        })}
      </ScrollView>

      {donations.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={{ marginTop: 22 }}>
          {grouped.map((g) => (
            <View key={g.key} style={{ marginBottom: 22 }}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>
                  {capitalize(monthLabel(g.month, true))} {g.year}
                </Text>
                <Text style={styles.groupSum}>{fmtAmount(g.sum, 'GBP')}</Text>
              </View>
              <View style={{ gap: 6 }}>
                {g.items.map((d) => (
                  <DonationRow
                    key={d.id}
                    donation={d}
                    onPress={() => router.push(`/donation/${d.id}`)}
                    compact
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <Ionicons name="leaf-outline" size={36} color={colors.mossSoft} />
      <Text style={styles.emptyText}>{t('history.emptyState')}</Text>
    </View>
  );
}

function computeFrom(period: Period): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === '3m') d.setMonth(d.getMonth() - 3);
  else if (period === '6m') d.setMonth(d.getMonth() - 6);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return toLocalDate(d);
}

interface MonthGroup {
  key: string;
  year: number;
  month: number;
  items: DonationResponse[];
  sum: number;
}

function groupByMonth(items: DonationResponse[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  items.forEach((d) => {
    const date = parseLocalDate(d.donationDate);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: date.getFullYear(),
        month: date.getMonth(),
        items: [],
        sum: 0,
      });
    }
    const g = map.get(key)!;
    g.items.push(d);
    g.sum += d.amount;
  });
  return Array.from(map.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  totalCard: { paddingHorizontal: 20, paddingVertical: 16, marginTop: 16 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2,
  },
  count: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupLabel: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.mossSoft,
  },
  groupSum: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
  emptyText: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.ink2,
    marginTop: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
