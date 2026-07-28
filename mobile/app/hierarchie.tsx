import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { MODULE_ROLE_LABELS } from '../services/authApi';
import {
  fetchLeaderHierarchy,
  type HierarchyUnitView,
  type LeaderHierarchyNode,
  type LeaderHierarchyResponse,
} from '../services/leadersApi';

/**
 * Hiérarchie des dirigeants (Lot H3 — 21/07) : arbre du leadership renvoyé par le backend,
 * déjà scopé par rôle — sous-arbre pour un dirigeant, chaîne de rattachement pour un membre,
 * arbres du ministère pour LEADER/SECRETARIAT/SUPER_ADMIN.
 */
type ViewMode = 'leaders' | 'units';

type UnitEntry = { unit: HierarchyUnitView; leaderName?: string };

/**
 * Aplatis l'arbre en liste d'assemblées (chacune avec son dirigeant), et y AJOUTE les
 * assemblées du périmètre sans dirigeant (le label « dirigeant requis » vient du serveur —
 * `unit.needsLeader`, RG-DS-10).
 */
function flattenUnits(nodes: LeaderHierarchyNode[], unassigned: HierarchyUnitView[]): UnitEntry[] {
  const out: UnitEntry[] = [];
  const walk = (node: LeaderHierarchyNode) => {
    node.units.forEach((unit) => out.push({ unit, leaderName: node.fullName }));
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  unassigned.forEach((unit) => out.push({ unit }));
  // Regroupement pays → région → ville (22/07) : le tri porte l'ordre des sections.
  return out.sort((a, b) =>
    (a.unit.countryName ?? '').localeCompare(b.unit.countryName ?? '')
    || (a.unit.zoneName ?? '').localeCompare(b.unit.zoneName ?? '')
    || (a.unit.localityName ?? '').localeCompare(b.unit.localityName ?? '')
    || (a.unit.name ?? '').localeCompare(b.unit.name ?? ''));
}

export default function HierarchieScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<LeaderHierarchyResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('leaders');

  const load = useCallback(async () => {
    try {
      setData(await fetchLeaderHierarchy());
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const roots = data?.roots ?? [];
  const intro =
    data?.mode === 'CHAIN'
      ? t('hierarchy.introChain')
      : data?.mode === 'MINISTRY'
        ? t('hierarchy.introMinistry')
        : t('hierarchy.introSubtree');

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{t('hierarchy.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{intro}</Text>

      {/* Accès à SA propre déclaration (28/07) : l'arbre reste en lecture, le rattachement
          personnel se pose dans l'écran dédié. */}
      <Card
        variant="paper2"
        style={styles.discipleshipCard}
        onPress={() => router.push('/faiseur-de-disciple')}
      >
        <Ionicons name="people-circle-outline" size={18} color={colors.mossDeep} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.unitName} numberOfLines={1}>{t('discipleship.title')}</Text>
          <Text style={styles.nodeMeta} numberOfLines={2}>{t('discipleship.shortcutHint')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </Card>

      <View style={styles.segmentRow}>
        {(['leaders', 'units'] as ViewMode[]).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.segment, view === v && styles.segmentActive]}>
            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
              {v === 'leaders' ? t('hierarchy.viewLeaders') : t('hierarchy.viewUnits')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: 8, marginTop: 14 }}>
        {error && <Text style={styles.empty}>{t('hierarchy.loadError')}</Text>}
        {!error && roots.length === 0 && <Text style={styles.empty}>{t('hierarchy.empty')}</Text>}
        {view === 'leaders'
          ? roots.map((root) => (
              <LeaderNodeRow key={root.id} node={root} depth={0} meId={me?.id ?? null} />
            ))
          : (() => {
              const units = flattenUnits(roots, data?.unassignedUnits ?? []);
              if (!error && roots.length > 0 && units.length === 0) {
                return <Text style={styles.empty}>{t('hierarchy.noUnits')}</Text>;
              }
              // Sections pays → région → ville (la liste est déjà triée dans cet ordre).
              const rows: React.ReactNode[] = [];
              let prevCountry: string | null = null;
              let prevZone: string | null = null;
              let prevCity: string | null = null;
              units.forEach(({ unit, leaderName }) => {
                const country = unit.countryName ?? t('hierarchy.ungrouped');
                const zone = unit.zoneName ?? t('hierarchy.ungrouped');
                const city = unit.localityName ?? t('hierarchy.ungrouped');
                if (country !== prevCountry) {
                  rows.push(<Text key={`c-${country}-${unit.id}`} style={styles.groupCountry}>{country}</Text>);
                  prevCountry = country; prevZone = null; prevCity = null;
                }
                if (zone !== prevZone) {
                  rows.push(<Text key={`z-${zone}-${unit.id}`} style={styles.groupZone}>{zone}</Text>);
                  prevZone = zone; prevCity = null;
                }
                if (city !== prevCity) {
                  rows.push(<Text key={`v-${city}-${unit.id}`} style={styles.groupCity}>{city}</Text>);
                  prevCity = city;
                }
                rows.push(
                  <UnitRow key={unit.id} unit={unit} depth={1} leaderName={leaderName} hideLocality />,
                );
              });
              return rows;
            })()}
      </View>
    </ScreenShell>
  );
}

function LeaderNodeRow({ node, depth, meId }: { node: LeaderHierarchyNode; depth: number; meId: string | null }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(depth < 2);
  const hasContent = node.children.length > 0 || node.units.length > 0;
  const role = node.goalRole ?? node.donationRole;

  return (
    <View>
      <Card
        style={[styles.nodeCard, { marginLeft: depth * 14 }]}
        onPress={hasContent ? () => setOpen(!open) : undefined}
      >
        <Ionicons
          name={hasContent ? (open ? 'chevron-down' : 'chevron-forward') : 'person-outline'}
          size={15}
          color={colors.ink3}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.nodeName} numberOfLines={1}>{node.fullName}</Text>
            {meId === node.id && <Text style={styles.youPill}>{t('hierarchy.you')}</Text>}
          </View>
          <Text style={styles.nodeMeta} numberOfLines={1}>
            {role ? MODULE_ROLE_LABELS[role] : '—'}
            {node.units.length > 0 ? ` · ${t('hierarchy.unitsCount', { count: node.units.length })}` : ''}
          </Text>
        </View>
      </Card>

      {open && (
        <View style={{ gap: 8, marginTop: 8 }}>
          {node.units.map((unit) => (
            <UnitRow key={unit.id} unit={unit} depth={depth + 1} />
          ))}
          {node.children.map((child) => (
            <LeaderNodeRow key={child.id} node={child} depth={depth + 1} meId={meId} />
          ))}
        </View>
      )}
    </View>
  );
}

function UnitRow({ unit, depth, leaderName, hideLocality }: {
  unit: HierarchyUnitView; depth: number; leaderName?: string; hideLocality?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasMembers = unit.members.length > 0;

  return (
    <View>
      <Card
        variant="paper2"
        style={[styles.unitCard, { marginLeft: depth * 14 }]}
        onPress={hasMembers ? () => setOpen(!open) : undefined}
      >
        <Ionicons name="home-outline" size={14} color={colors.earthDeep} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.unitName} numberOfLines={1}>
              {unit.name ?? t('hierarchy.unnamedUnit')}
              {!hideLocality && unit.localityName ? `  ·  ${unit.localityName}` : ''}
            </Text>
            {unit.needsLeader && <Text style={styles.needsLeaderPill}>{t('hierarchy.needsLeader')}</Text>}
          </View>
          <Text style={styles.nodeMeta} numberOfLines={1}>
            {leaderName ? `${t('hierarchy.leaderPrefix', { name: leaderName })} · ` : ''}
            {hasMembers
              ? t('hierarchy.membersCount', { count: unit.members.length })
              : t('hierarchy.unitNoMembers')}
          </Text>
        </View>
        {hasMembers && (
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.ink3} />
        )}
      </Card>

      {open && (
        <View style={{ gap: 4, marginTop: 6, marginLeft: (depth + 1) * 14 + 6 }}>
          {unit.members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Text style={styles.memberName} numberOfLines={1}>{m.fullName}</Text>
              {!m.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  discipleshipCard: {
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)', alignItems: 'center' },
  segmentActive: { backgroundColor: colors.moss },
  segmentText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextActive: { color: colors.white },
  groupCountry: {
    fontFamily: fonts.serif, fontSize: 19, color: colors.ink, letterSpacing: -0.2,
    marginTop: 12, marginBottom: 2,
  },
  groupZone: {
    fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink3, letterSpacing: 1.1,
    textTransform: 'uppercase', marginTop: 6, marginLeft: 2,
  },
  groupCity: {
    fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.earthDeep,
    marginTop: 6, marginLeft: 8, marginBottom: 2,
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  nodeCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nodeName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  nodeMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  unitCard: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  memberName: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, flexShrink: 1 },
  youPill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.white, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: colors.moss, overflow: 'hidden',
  },
  needsLeaderPill: {
    fontFamily: fonts.mono, fontSize: 9, color: '#A9812C', letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(169,129,44,0.14)', overflow: 'hidden',
  },
  inactivePill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.ink3, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)', borderWidth: 1, borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
});
