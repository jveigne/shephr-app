import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Button from '@/components/Button';
import FeatureLock from '@/components/FeatureLock';
import {
  AssemblyStatsBlock,
  UnitAssemblyLine,
  useAssemblyHierarchyStats,
} from '@/components/AssemblyHierarchyStats';
import EventHierarchyStatsBlock from '@/components/EventHierarchyStats';
import StudyHierarchyStatsBlock from '@/components/StudyHierarchyStats';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { goBack } from '@/utils/navigation';
import {
  PERIODICITIES,
  currentPeriod,
  isFuturePeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
  type Period,
} from '@/utils/assemblyJournal';
import { treeUnitIds } from '@/utils/assemblyHierarchyStats';
import { fetchLeaderHierarchy, type LeaderHierarchyNode, type LeaderHierarchyResponse } from '@/services/leadersApi';
import { ENTITLEMENT_HIERARCHIE_SUIVI, getPersonalEntitlements } from '@/services/entitlementsApi';

/**
 * Page 3 de la Hiérarchie, « Vie de mon leadership » — D-HIE-01 / D-HIE-09 / D-HIE-10 (JP 28/10).
 *
 * <p>OFFRE CALEB : code personnel HIERARCHIE_SUIVI (plan `DIRIGEANT_HIERARCHIE`, chaque dirigeant
 * paie pour LUI-MÊME — D-ABO-36 ; ou accord de ministère). Axe de la CHAÎNE de supervision
 * (`scopeOf`), jamais la géographie (D-ABO-31).
 *
 * <p>Sans le droit : UN SEUL verrou (`FeatureLock offer="caleb"`, texte NEUTRE
 * `hierarchy.lock.notActivated` + « En savoir plus ») et rien d'autre — aucun prix, bouton de
 * paiement ni lien Stripe, sur iOS comme sur Android (D-ABO-13, RG-ABO-24) ; jamais un toast. Le
 * serveur reste juge : un 403 `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI d'un bloc bascule la page
 * sur ce verrou.
 *
 * <p>Avec le droit : un sélecteur de période UNIQUE (Mois / Trimestre / Semestre / Année + ‹ ›,
 * défaut mois courant) pilote toute la page — Vie d'assemblée (D-ASM-18, alerte « sans CR > 3 sem. »),
 * Évènements de la chaîne (D-HIE-09), Le Message de Bertoua (D-HIE-10), « Assemblées et dernier CR »
 * (ce qui a quitté l'arbre de la page 1) et « Journal PDF de ma hiérarchie ». Blocs masqués si le
 * module du ministère (`ASSEMBLY`, `EVENTS`, `STUDY`) n'est pas accessible (RG-06).
 */
type Access = 'unknown' | 'open' | 'locked';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Assemblées de l'arbre avec SON dirigeant, dédoublonnées, dans l'ordre de l'arbre. */
function unitLeaders(roots: LeaderHierarchyNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: LeaderHierarchyNode) => {
    node.units.forEach((u) => {
      if (!out.has(u.id)) out.set(u.id, node.fullName);
    });
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export default function HierarchyLifeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isLeader, hasAssembly, hasEvents, hasStudy } = useAuth();
  const th = (k: string, o?: Record<string, unknown>) => t(`hierarchy.life.${k}`, o);

  const [access, setAccess] = useState<Access>('unknown');
  const [tree, setTree] = useState<LeaderHierarchyResponse | null>(null);
  const [treeError, setTreeError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const { from, to } = periodRange(period);

  const checkAccess = useCallback(async () => {
    try {
      const personal = await getPersonalEntitlements();
      setAccess(personal.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI) ? 'open' : 'locked');
    } catch {
      // Panne : les routes de statistiques tranchent — un 403 HIERARCHIE_SUIVI ramène le verrou.
      setAccess((prev) => (prev === 'unknown' ? 'open' : prev));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void checkAccess();
    }, [checkAccess]),
  );

  const loadTree = useCallback(async () => {
    try {
      setTree(await fetchLeaderHierarchy());
      setTreeError(false);
    } catch {
      setTreeError(true);
    }
  }, []);
  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const lock = useCallback(() => setAccess('locked'), []);
  const open = access === 'open';
  const assemblyEnabled = open && isLeader && hasAssembly;
  const asm = useAssemblyHierarchyStats(assemblyEnabled, refreshKey, period);
  const locked = access === 'locked' || (assemblyEnabled && asm.denied);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    try {
      await Promise.all([checkAccess(), loadTree()]);
    } finally {
      setRefreshing(false);
    }
  };

  const roots = useMemo(() => tree?.roots ?? [], [tree]);
  const unitIds = useMemo(() => treeUnitIds(roots), [roots]);
  const leaders = useMemo(() => unitLeaders(roots), [roots]);
  const next = shiftPeriod(period, 1);
  const canGoNext = !isFuturePeriod(next);
  const label = capitalize(periodLabel(period, t));
  const anyBlock = isLeader && (hasAssembly || hasEvents || hasStudy);

  const meetingTotal = asm.statsById
    ? unitIds.reduce((sum, id) => sum + (asm.statsById?.get(id)?.meetingCount ?? 0), 0)
    : 0;

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{th('title')}</Text>
      </View>
      <Text style={styles.subtitle}>{th('intro')}</Text>

      {access === 'unknown' ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : locked ? (
        // Verrou UNIQUE (D-HIE-01) — texte neutre inchangé (D-OFF-09), « En savoir plus » (D-OFF-11).
        <FeatureLock offer="caleb" body={t('hierarchy.lock.notActivated')} />
      ) : !anyBlock ? (
        <Text style={styles.empty}>{th('noModule')}</Text>
      ) : (
        <>
          {/* Sélecteur de période UNIQUE pour toute la page (D-HIE-01). */}
          <Card style={styles.periodCard}>
            <View style={styles.segments}>
              {PERIODICITIES.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setPeriod(currentPeriod(k))}
                  style={[styles.segment, period.kind === k && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, period.kind === k && styles.segmentTextOn]} numberOfLines={1}>
                    {t(`assemblyLife.journal.kind.${k}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.periodRow}>
              <Pressable
                onPress={() => setPeriod(shiftPeriod(period, -1))}
                hitSlop={8}
                style={styles.navBtn}
                accessibilityLabel={th('previousPeriod')}
              >
                <Ionicons name="chevron-back" size={16} color={colors.ink2} />
              </Pressable>
              <Text style={styles.periodText}>{label}</Text>
              <Pressable
                onPress={() => canGoNext && setPeriod(next)}
                disabled={!canGoNext}
                hitSlop={8}
                style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]}
                accessibilityLabel={th('nextPeriod')}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.ink2} />
              </Pressable>
            </View>
          </Card>

          {treeError && <Text style={styles.empty}>{t('hierarchy.loadError')}</Text>}

          {assemblyEnabled && roots.length > 0 && <AssemblyStatsBlock asm={asm} roots={roots} />}

          {/* D-HIE-09 (JP 28/10) : Évènements de la chaîne — NOUVEAU, offre Caleb. */}
          {isLeader && hasEvents && (
            <EventHierarchyStatsBlock from={from} to={to} refreshKey={refreshKey} onDenied={lock} />
          )}

          {/* D-HIE-10 : « Le Message de Bertoua » de ma chaîne, sur la période de la page. */}
          {isLeader && hasStudy && roots.length > 0 && (
            <StudyHierarchyStatsBlock
              from={from}
              to={to}
              periodTitle={label}
              refreshKey={refreshKey}
              onDenied={lock}
            />
          )}

          {/* Assemblées et dernier CR — les lignes qui ont quitté l'arbre de la page 1 (payantes). */}
          {assemblyEnabled && asm.statsById && unitIds.length > 0 && (
            <Card style={styles.block}>
              <View style={styles.blockHeader}>
                <Ionicons name="home-outline" size={18} color={colors.mossDeep} />
                <Text style={styles.blockTitle}>{th('unitsTitle')}</Text>
              </View>
              {unitIds.map((id) => {
                const row = asm.statsById?.get(id);
                if (!row) return null;
                const leaderName = leaders.get(id);
                return (
                  <View key={id} style={styles.unitRow}>
                    <Text style={styles.unitName} numberOfLines={1}>
                      {row.unitName}
                      {row.cityName ? `  ·  ${row.cityName}` : ''}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {leaderName ? `${t('hierarchy.leaderPrefix', { name: leaderName })} · ` : ''}
                      {th('meetingsInPeriod', { count: row.meetingCount })}
                    </Text>
                    <UnitAssemblyLine asm={asm} unitId={id} />
                  </View>
                );
              })}
            </Card>
          )}

          {assemblyEnabled && asm.statsById && unitIds.length > 0 && (
            <Button
              label={t('assemblyLife.hierarchy.journalAll')}
              variant="soft"
              height={44}
              onPress={() => asm.generateJournal('all', t('assemblyLife.hierarchy.scopeAll'), unitIds)}
              loading={asm.generating === 'all'}
              disabled={meetingTotal === 0 || (asm.generating !== null && asm.generating !== 'all')}
              style={{ marginTop: 14 }}
              iconLeft={<Ionicons name="document-text-outline" size={16} color={colors.moss} />}
            />
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, flex: 1 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  periodCard: { marginTop: 14, paddingHorizontal: 12, paddingVertical: 10 },
  segments: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.mossTint },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  segmentOn: { backgroundColor: colors.moss },
  segmentText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: colors.ink2 },
  segmentTextOn: { color: colors.white },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  periodText: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, minWidth: 140, textAlign: 'center' },
  block: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  blockTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
  unitRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.hair },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
});
