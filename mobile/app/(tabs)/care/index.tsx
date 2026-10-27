import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Field from '@/components/Field';
import Chip from '@/components/Chip';
import CalebAssemblyLock from '@/components/CalebAssemblyLock';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getOverview,
  listCareUnits,
  listRecords,
  listStatuses,
  sendReminder,
  type MemberCareOverviewRow,
  type MemberCareStatus,
  type MemberCareUnit,
  type MemberRecord,
} from '@/services/memberCareApi';
import { hierarchyAccessDenied } from '@/services/entitlementsApi';
import { useCalebAssemblyGate, type LockedAssembly } from '@/hooks/useCalebAssemblyGate';
import { confirmDialog, notify } from '@/utils/dialogs';
import { fmtDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';

type Tab = 'records' | 'accountability';

function StatusDot({ color }: { color: string | null }) {
  return <View style={[styles.dot, { backgroundColor: color || colors.moss }]} />;
}

function lastUpdated(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t('care.never');
  return fmtDate(new Date(iso));
}

/**
 * Suivi pastoral — refonte D-ASM-01/02 (JP 23/09) : la liste = les comptes MEMBRE de l'assemblée
 * choisie (sélecteur alimenté par GET /member-care/units), fiche existante ou non. Plus de
 * « Nouvelle fiche » ni de suppression (RG-MCR-02 v2). L'onglet Redevabilité est gelé (D-ASM-09).
 * D-OFF-06 (JP 27/10) : gratuit sur l'assemblée gratuite ; une autre assemblée de la chaîne relève
 * de l'offre Caleb — 403 `MODULE_ACCESS_DENIED` / `HIERARCHIE_SUIVI` → verrou Caleb à la place des
 * fiches (jamais un toast).
 * Verrou Caleb D'AVANCE (revue 27/10, recette n°3 / n°4 — `hooks/useCalebAssemblyGate`, comme le
 * web) : assemblées DIRIGÉES absentes de `/units` proposées avec un cadenas (verrou sans appel
 * serveur) ; manager sans assemblée listée ni code `HIERARCHIE_SUIVI` → verrou à la place de
 * « Aucune assemblée suivie ».
 */
export default function CareIndexScreen() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('records');

  const [units, setUnits] = useState<MemberCareUnit[]>([]);
  const [pickedUnitId, setUnitId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<MemberCareStatus[]>([]);
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [overview, setOverview] = useState<MemberCareOverviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // D-OFF-06 : assemblée dont le serveur a refusé les fiches (403 HIERARCHIE_SUIVI).
  const [lockedUnitId, setLockedUnitId] = useState<string | null>(null);

  // Faux tant que `/units` n'a pas répondu (pas de verrou d'avance sur une liste inconnue).
  const [unitsLoaded, setUnitsLoaded] = useState(false);

  const listedIds = useMemo(() => (unitsLoaded ? units.map((u) => u.id) : null), [unitsLoaded, units]);
  const caleb = useCalebAssemblyGate(listedIds);
  const lockedLed = caleb.lockedLed;
  // Sélection EFFECTIVE (dérivée, sans effet) : le choix s'il est listé ou verrouillé d'avance
  // (D-OFF-06), sinon la première assemblée listée (canEdit d'abord côté serveur), à défaut la
  // première assemblée dirigée verrouillée.
  const unitId =
    pickedUnitId &&
    (units.some((u) => u.id === pickedUnitId) || lockedLed.some((a) => a.id === pickedUnitId))
      ? pickedUnitId
      : units[0]?.id ?? lockedLed[0]?.id ?? null;
  const unit = units.find((u) => u.id === unitId) ?? null;
  const unitListed = !!unit;
  const lockedSel = unit ? null : lockedLed.find((a) => a.id === unitId) ?? null;

  const loadRecords = useCallback(async () => {
    // Sans assemblée visible, rien à lister (GET /records sans unitId = toutes les assemblées
    // lisibles, mais on reste sur une vue par assemblée, §6.3). D-OFF-06 : une assemblée
    // verrouillée d'avance (hors `/units`) n'est pas lue.
    if (!unitId || !unitListed) {
      setRecords([]);
      return;
    }
    try {
      const data = await listRecords({
        unitId,
        statusId: statusFilter ?? undefined,
        search: search.trim() || undefined,
      });
      setRecords(data);
      setLockedUnitId((cur) => (cur === unitId ? null : cur));
    } catch (e) {
      if (!hierarchyAccessDenied(e)) throw e;
      setRecords([]);
      setLockedUnitId(unitId);
    }
  }, [unitId, unitListed, statusFilter, search]);

  const loadAll = useCallback(async () => {
    const [un, st, ov] = await Promise.allSettled([listCareUnits(), listStatuses(), getOverview()]);
    if (un.status === 'fulfilled') {
      const list = un.value;
      setUnits(list);
      setUnitsLoaded(true);
      // Le choix est conservé ; la sélection effective (`unitId`, dérivée) retombe sur la première
      // assemblée listée s'il n'est plus visible.
    }
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
      await Promise.all([loadAll(), caleb.reload()]);
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
          units={units}
          unit={unit}
          setUnitId={setUnitId}
          records={records}
          statuses={statuses}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          locked={(!!unitId && lockedUnitId === unitId) || lockedSel != null}
          lockedLed={lockedLed}
          lockedSel={lockedSel}
          showChainLock={caleb.showChainLock}
          t={t}
        />
      ) : (
        <AccountabilityView overview={overview} onRemind={onRemind} t={t} lastUpdated={lastUpdated} />
      )}
    </ScreenShell>
  );
}

function RecordsView({
  units,
  unit,
  setUnitId,
  records,
  statuses,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  locked,
  lockedLed,
  lockedSel,
  showChainLock,
  t,
}: {
  units: MemberCareUnit[];
  unit: MemberCareUnit | null;
  setUnitId: (id: string) => void;
  records: MemberRecord[];
  statuses: MemberCareStatus[];
  statusFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  locked: boolean;
  /** D-OFF-06 : assemblées dirigées hors de `/units` (cadenas) et celle qui est choisie. */
  lockedLed: LockedAssembly[];
  lockedSel: LockedAssembly | null;
  /** D-OFF-06 : manager sans le code `HIERARCHIE_SUIVI` — verrou à la place de « Aucune assemblée ». */
  showChainLock: boolean;
  t: (k: string, o?: any) => string;
}) {
  if (units.length === 0 && lockedLed.length === 0) {
    // D-OFF-06 (JP 27/10, recette n°4) : les fiches de la chaîne relèvent de l'offre Caleb.
    if (showChainLock) return <CalebAssemblyLock />;
    return (
      <Card style={styles.emptyCard}>
        <Ionicons name="home-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>{t('care.noUnits')}</Text>
      </Card>
    );
  }
  const picker = (
    <>
      {units.length + lockedLed.length > 1 && (
        <View style={[styles.filterRow, { marginTop: 16 }]}>
          {units.map((u) => (
            <Chip
              key={u.id}
              label={u.cityName ? `${u.name} · ${u.cityName}` : u.name}
              selected={u.id === unit?.id}
              accent={u.canEdit}
              onPress={() => setUnitId(u.id)}
            />
          ))}
          {/* D-OFF-06 / P-02 (JP 27/10) : assemblée dirigée sans l'offre Caleb — cadenas. */}
          {lockedLed.map((a) => (
            <Chip
              key={a.id}
              label={a.cityName ? `${a.name} · ${a.cityName}` : a.name}
              selected={a.id === lockedSel?.id}
              iconLeft={
                <Ionicons
                  name="lock-closed"
                  size={12}
                  color={a.id === lockedSel?.id ? colors.white : colors.ink3}
                  accessibilityLabel={t('assemblyLife.lockedUnit')}
                />
              }
              onPress={() => setUnitId(a.id)}
            />
          ))}
        </View>
      )}
      {units.length + lockedLed.length === 1 && (unit ?? lockedSel) && (
        <Text style={styles.unitName}>
          {(unit ?? lockedSel)!.name}
          {(unit ?? lockedSel)!.cityName ? (
            <Text style={styles.unitCity}> · {(unit ?? lockedSel)!.cityName}</Text>
          ) : null}
        </Text>
      )}
    </>
  );
  // D-OFF-06 (JP 27/10) : fiches d'une autre assemblée sans l'offre Caleb → verrou à la place.
  if (locked) {
    return (
      <>
        {picker}
        <CalebAssemblyLock />
      </>
    );
  }
  return (
    <>
      {picker}
      {/* D-ASM-05 (JP 23/09) : le superviseur lit, seul le dirigeant d'assemblée écrit. */}
      {unit && !unit.canEdit && (
        <View style={styles.readOnly}>
          <Ionicons name="eye-outline" size={15} color={colors.ink3} />
          <Text style={styles.readOnlyText}>{t('care.readOnly')}</Text>
        </View>
      )}

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

      {records.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="people-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('care.emptyRecords')}</Text>
        </Card>
      ) : (
        <Card style={{ marginTop: 14, paddingVertical: 0 }}>
          {records.map((r, i) => (
            <Pressable
              key={r.userId}
              onPress={() => router.push(`/(tabs)/care/record/${r.userId}` as Href)}
              style={[styles.recRow, i < records.length - 1 && styles.recRowBorder]}
            >
              <StatusDot color={r.currentStatusColor} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.recName} numberOfLines={1}>
                  {r.fullName}
                </Text>
                <Text style={styles.recSub} numberOfLines={1}>
                  {r.currentStatusLabel ?? t('care.noStatus')}
                  {r.lastAttendanceDate
                    ? ` · ${t('care.lastAttendanceShort', { date: fmtIsoDay(r.lastAttendanceDate, t) })}`
                    : ''}
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
  unitName: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 16 },
  unitCity: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  readOnlyText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
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
