import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import HandDivider from '../../components/HandDivider';
import DonationRow from '../../components/DonationRow';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSummary, type DonationSummary } from '../../services/statsApi';
import { listDonations, type DonationResponse } from '../../services/donationApi';
import { fmtAmount, monthLabel } from '../../utils/format';

const PRIMARY_CURRENCY = 'GBP';
const YEAR_GOAL = 3000;

export default function HomeScreen() {
  const { me, isLeader } = useAuth();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [recent, setRecent] = useState<DonationResponse[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, list] = await Promise.allSettled([
      getSummary(),
      listDonations({ size: 5 }),
    ]);
    if (s.status === 'fulfilled') setSummary(s.value);
    if (list.status === 'fulfilled') setRecent(list.value.content);
  }, []);

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

  const firstName = (me?.fullName ?? '').split(' ')[0] || '';
  const initials = (me?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const thisMonth = pickAmount(summary?.currentMonth, PRIMARY_CURRENCY);
  const lastMonth = pickAmount(summary?.lastMonth, PRIMARY_CURRENCY);
  const yearTotal = pickAmount(summary?.yearToDate, PRIMARY_CURRENCY);
  const diff = thisMonth - lastMonth;
  const diffPct = lastMonth > 0 ? Math.round((diff / lastMonth) * 100) : 0;
  const pct = Math.min(100, Math.round((yearTotal / YEAR_GOAL) * 100));

  const today = new Date();

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>
            {monthLabel(today.getMonth(), true).charAt(0).toUpperCase() +
              monthLabel(today.getMonth(), true).slice(1)}{' '}
            {today.getDate()}, {today.getFullYear()}
          </Text>
          <Text style={styles.greeting}>
            Bonsoir, <Text style={styles.greetingItalic}>{firstName || '…'}</Text>.
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '·'}</Text>
        </Pressable>
      </View>

      <Card style={styles.hero}>
        <Label style={{ color: colors.mossSoft }}>Vos dons ce mois-ci</Label>
        <Amount value={thisMonth} currency={PRIMARY_CURRENCY} size={54} showDecimals />
        <View style={styles.diffRow}>
          <Ionicons
            name={diff >= 0 ? 'arrow-up' : 'arrow-down'}
            size={14}
            color={diff >= 0 ? colors.mossSoft : colors.clay}
          />
          <Text
            style={[
              styles.diffPct,
              { color: diff >= 0 ? colors.mossSoft : colors.clay },
            ]}
          >
            {diff >= 0 ? '+' : '−'}
            {Math.abs(diffPct)}%
          </Text>
          <Text style={styles.diffNote}>
            vs. mois dernier ({fmtAmount(lastMonth, PRIMARY_CURRENCY)})
          </Text>
        </View>

        <HandDivider style={{ marginVertical: 16 }} />

        <Label style={{ color: colors.mossSoft }}>Total de l'année</Label>
        <View style={styles.yearRow}>
          <Amount value={yearTotal} currency={PRIMARY_CURRENCY} size={24} showDecimals />
          <Text style={styles.goalLabel}>objectif {fmtAmount(YEAR_GOAL, PRIMARY_CURRENCY)}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      </Card>

      <Button
        label="Déclarer un don"
        onPress={() => router.push('/declare')}
        fullWidth
        height={60}
        iconLeft={<Ionicons name="add" size={20} color={colors.white} />}
        style={{ marginTop: 18 }}
      />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Dons récents</Text>
        <Pressable onPress={() => router.push('/(tabs)/donations')}>
          <Text style={styles.sectionLink}>Tout voir →</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>Aucun don encore. Votre premier geste se posera ici.</Text>
        ) : (
          recent.map((d) => (
            <DonationRow
              key={d.id}
              donation={d}
              onPress={() => router.push(`/donation/${d.id}`)}
            />
          ))
        )}
      </View>

      {isLeader && (
        <Card
          onPress={() => router.push('/(tabs)/leader')}
          style={styles.scopeCta}
        >
          <Ionicons name="people" size={26} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>Mon périmètre</Text>
            <Text style={styles.scopeSub}>Suivez vos unités et fidèles</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Card>
      )}
    </ScreenShell>
  );
}

function pickAmount(totals: { currency: string; total: number }[] | undefined, cur: string): number {
  if (!totals) return 0;
  return totals.find((t) => t.currency === cur)?.total ?? 0;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  date: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  greeting: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 33,
    marginTop: 4,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  greetingItalic: { fontStyle: 'italic' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fonts.serif,
    fontSize: 18,
  },
  hero: { paddingHorizontal: 22, paddingVertical: 22 },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  diffPct: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 13 },
  diffNote: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  goalLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  progressTrack: {
    height: 6,
    marginTop: 8,
    backgroundColor: 'rgba(42,38,32,0.07)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.moss, borderRadius: 99 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 26,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, letterSpacing: -0.2 },
  sectionLink: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: colors.earthDeep,
  },
  empty: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.ink3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  scopeCta: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.moss,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  scopeTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.white },
  scopeSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.parchment, opacity: 0.85 },
});
