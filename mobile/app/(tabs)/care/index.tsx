import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Field from '../../../components/Field';
import Chip from '../../../components/Chip';
import { colors, fonts } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  getOverview,
  listRecords,
  listStatuses,
  sendReminder,
  type MemberCareOverviewRow,
  type MemberCareStatus,
  type MemberRecord,
} from '../../../services/memberCareApi';
import { confirmDialog, notify } from '../../../utils/dialogs';
import { fmtDate } from '../../../utils/format';

type Tab = 'records' | 'accountability';

function StatusDot({ color }: { color: string | null }) {
  return <View style={[styles.dot, { backgroundColor: color || colors.moss }]} />;
}

function lastUpdated(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t('care.never');
  return fmtDate(new Date(iso));
}

export default function CareIndexScreen() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('records');

  const [statuses, setStatuses] = useState<MemberCareStatus[]>([]);
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [overview, setOverview] = useState<MemberCareOverviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecords = useCallback(async () => {
    const data = await listRecords({
      statusId: statusFilter ?? undefined,
      search: search.trim() || undefined,
    });
    setRecords(data);
  }, [statusFilter, search]);

  const loadAll = useCallback(async () => {
    const [st, ov] = await Promise.allSettled([listStatuses(), getOverview()]);
    if (st.status === 'fulfilled') setStatuses(st.value);
    if (ov.status === 'fulfilled') setOverview(ov.value);
    await loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharge la liste à chaque changement de filtre/recherche.
  useEffect(() => {
    loadRecords().catch(() => {});
  }, [loadRecords]);

  useFocusEffect(
    useCallback(() => {
      loadAll().catch(() => {});
    }, [loadAll]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const onRemind = async (row: MemberCareOverviewRow) => {
    const ok = await confirmDialog(
      t('care.remindTitle'),
      t('care.remindConfirm', { unit: row.unitName }),
    );
    if (!ok) return;
    try {
      await sendReminder(row.unitId);
      notify(t('common.appName'), t('care.remindSent'));
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('care.remindFailed'));
    }
  };

  return (
    <ScreenShell
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.moss} />}
    >
      <Text style={styles.title}>{t('care.title')}</Text>
      <Text style={styles.subtitle}>{t('care.subtitle')}</Text>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, tab === 'records' && styles.tabBtnOn]}
          onPress={() => setTab('records')}
        >
          <Text style={[styles.tabText, tab === 'records' && styles.tabTextOn]}>{t('care.tabRecords')}</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === 'accountability' && styles.tabBtnOn]}
          onPress={() => setTab('accountability')}
        >
          <Text style={[styles.tabText, tab === 'accountability' && styles.tabTextOn]}>
            {t('care.tabAccountability')}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ marginTop: 50, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : tab === 'records' ? (
        <RecordsView
          records={records}
          statuses={statuses}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          t={t}
        />
      ) : (
        <AccountabilityView overview={overview} onRemind={onRemind} t={t} lastUpdated={lastUpdated} />
      )}
    </ScreenShell>
  );
}

function RecordsView({
  records,
  statuses,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  t,
}: {
  records: MemberRecord[];
  statuses: MemberCareStatus[];
  statusFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  t: (k: string, o?: any) => string;
}) {
  return (
    <>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={17} color={colors.ink3} />
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder={t('care.searchPlaceholder')}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.filterRow}>
        <Chip label={t('common.all')} selected={!statusFilter} onPress={() => setStatusFilter(null)} />
        {statuses
          .filter((s) => s.active)
          .map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={statusFilter === s.id}
              onPress={() => setStatusFilter(statusFilter === s.id ? null : s.id)}
            />
          ))}
      </View>

      <Pressable style={styles.newBtn} onPress={() => router.push('/(tabs)/care/new')}>
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.newBtnText}>{t('care.newRecord')}</Text>
      </Pressable>

      {records.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="people-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('care.emptyRecords')}</Text>
        </Card>
      ) : (
        <Card style={{ marginTop: 14, paddingVertical: 0 }}>
          {records.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/(tabs)/care/record/${r.id}`)}
              style={[styles.recRow, i < records.length - 1 && styles.recRowBorder]}
            >
              <StatusDot color={r.currentStatusColor} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.recName} numberOfLines={1}>
                  {r.firstName} {r.lastName}
                </Text>
                <Text style={styles.recSub} numberOfLines={1}>
                  {r.currentStatusLabel ?? t('care.noStatus')}
                  {r.contactPhone ? ` · ${r.contactPhone}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}

function AccountabilityView({
  overview,
  onRemind,
  t,
  lastUpdated,
}: {
  overview: MemberCareOverviewRow[];
  onRemind: (row: MemberCareOverviewRow) => void;
  t: (k: string, o?: any) => string;
  lastUpdated: (iso: string | null, t: (k: string) => string) => string;
}) {
  if (overview.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Ionicons name="shield-checkmark-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>{t('care.emptyOverview')}</Text>
      </Card>
    );
  }
  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      {overview.map((row) => {
        const badge =
          row.recordCount === 0
            ? { label: t('care.badgeEmpty'), color: colors.ink3, bg: 'rgba(42,38,32,0.06)' }
            : row.late
            ? { label: t('care.badgeLate'), color: colors.clay, bg: 'rgba(184,106,74,0.12)' }
            : { label: t('care.badgeUpToDate'), color: colors.mossSoft, bg: 'rgba(30,58,47,0.10)' };
        return (
          <Card key={row.unitId} style={styles.ovCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.ovUnit} numberOfLines={1}>{row.unitName}</Text>
              <Text style={styles.ovMeta}>
                {t('care.recordCount', { count: row.recordCount })} · {t('care.updated')}{' '}
                {lastUpdated(row.lastUpdatedAt, t)}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {row.late && (
              <Pressable style={styles.remindBtn} onPress={() => onRemind(row)} hitSlop={8}>
                <Ionicons name="notifications-outline" size={16} color={colors.moss} />
              </Pressable>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  tabRow: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderRadius: 99,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 99, alignItems: 'center' },
  tabBtnOn: {
    backgroundColor: colors.paper,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 1,
  },
  tabText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink3 },
  tabTextOn: { color: colors.moss },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: colors.paper2,
    borderColor: colors.hair,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    fontSize: 15,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.moss,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 16,
  },
  newBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.white },
  emptyCard: { marginTop: 16, paddingVertical: 30, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  recRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  recName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  recSub: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  ovCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  ovUnit: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  ovMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  badgeText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  remindBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(30,58,47,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
