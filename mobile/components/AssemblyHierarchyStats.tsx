import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Button from './Button';
import ErrorBanner from './ErrorBanner';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { getAssemblyStats, listMeetingsInRange, type UnitMeetingStats } from '../services/assemblyApi';
import type { LeaderHierarchyNode } from '../services/leadersApi';
import {
  PERIODICITIES,
  buildConsolidatedJournalHtml,
  currentPeriod,
  isFuturePeriod,
  journalFileName,
  periodLabel,
  periodRange,
  shiftPeriod,
  type Period,
} from '../utils/assemblyJournal';
import { aggregate, averageAttendance, daysBetween, isAlert, subtreeUnitIds, treeUnitIds } from '../utils/assemblyHierarchyStats';
import { printAndSharePdf } from '../utils/pdfShare';
import { toLocalDate } from '../utils/format';
import { notify } from '../utils/dialogs';

/**
 * Vie d'assemblée dans la Hiérarchie — D-ASM-18 (JP 08/10).
 *
 * Un dirigeant voit les statistiques des comptes rendus des assemblées sous son leadership et
 * génère un journal PDF consolidé (tout son périmètre, ou le sous-arbre d'un dirigeant).
 * - Visible seulement avec l'abonnement ASSEMBLY et un rôle au-dessus de MEMBRE (RG-06) : c'est
 *   l'appelant (`app/hierarchie.tsx`) qui passe `enabled`.
 * - Aucune nouvelle règle d'accès : `/stats` et `/meetings` appliquent RG-ASM-05 côté serveur.
 * - AUCUN NOM de personne (D-ASM-18) : que des nombres et des noms d'assemblée.
 * - Alerte « sans CR depuis 3 semaines » : affichage seul, aucune relance (D-ASM-09 gelé).
 * L'agrégat est dans `utils/assemblyHierarchyStats.ts` (pur).
 */

export interface AssemblyStatsState {
  period: Period;
  setPeriod: (p: Period) => void;
  /** null = chargement de la période en cours. */
  statsById: ReadonlyMap<string, UnitMeetingStats> | null;
  /** Date du jour au moment du chargement ('yyyy-MM-dd'), référence de l'alerte des 21 jours. */
  todayIso: string;
  error: string | null;
  retry: () => void;
  /** Clé du périmètre dont le journal est en cours de génération ('all' ou id du dirigeant). */
  generating: string | null;
  generateJournal: (scopeKey: string, scopeLabel: string, unitIds: string[]) => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Chargement de `/stats` pour la période choisie. Pas de react-query côté mobile ; aucun setState
 * synchrone dans l'effet (les données affichées sont DÉRIVÉES de la clé chargée, comme le journal).
 * `refreshKey` : incrémenté par le tirer-pour-rafraîchir de l'écran — les chiffres précédents
 * restent affichés jusqu'à la réponse.
 */
export function useAssemblyHierarchyStats(enabled: boolean, refreshKey: number): AssemblyStatsState {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const [loaded, setLoaded] = useState<{ key: string; rows: UnitMeetingStats[]; todayIso: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [generating, setGenerating] = useState<string | null>(null);

  const { from, to } = periodRange(period);
  const dataKey = `${from}|${to}`;
  const requestKey = `${dataKey}|${refreshKey}|${retryKey}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getAssemblyStats(from, to)
      .then((rows) => {
        if (!active) return;
        setLoaded({ key: dataKey, rows, todayIso: toLocalDate(new Date()) });
        setFailure(null);
      })
      .catch((e: any) => {
        if (active) setFailure({ key: requestKey, message: e?.response?.data?.message ?? t('assemblyLife.loadFailed') });
      });
    return () => {
      active = false;
    };
  }, [enabled, from, to, dataKey, requestKey, t]);

  const current = loaded?.key === dataKey ? loaded : null;
  const statsById = useMemo(
    () => (current ? new Map(current.rows.map((r) => [r.unitId, r])) : null),
    [current],
  );
  const todayIso = current?.todayIso ?? loaded?.todayIso ?? from;

  const generateJournal = async (scopeKey: string, scopeLabel: string, unitIds: string[]) => {
    if (!statsById || generating) return;
    const rows = unitIds.map((id) => statsById.get(id)).filter((r): r is UnitMeetingStats => !!r);
    // N'appeler `/meetings` que pour les assemblées qui ont des réunions sur la période.
    const withMeetings = rows.filter((r) => r.meetingCount > 0).map((r) => r.unitId);
    if (withMeetings.length === 0) return;
    setGenerating(scopeKey);
    try {
      const meetings = await listMeetingsInRange(withMeetings, from, to);
      const html = buildConsolidatedJournalHtml(
        {
          scopeLabel,
          period,
          stats: rows,
          meetings,
          generatedOn: toLocalDate(new Date()),
          locale: language,
        },
        t,
      );
      const outcome = await printAndSharePdf({
        html,
        fileName: journalFileName(scopeLabel, period),
        dialogTitle: t('assemblyLife.hierarchy.docTitle'),
      });
      if (outcome === 'unavailable') {
        notify(t('common.appName'), t('assemblyLife.journal.shareUnavailable'));
      }
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('assemblyLife.journal.failed'));
    } finally {
      setGenerating(null);
    }
  };

  return {
    period,
    setPeriod,
    statsById,
    todayIso,
    error: failure?.key === requestKey ? failure.message : null,
    retry: () => setRetryKey((k) => k + 1),
    generating,
    generateJournal: (k, l, ids) => {
      void generateJournal(k, l, ids);
    },
  };
}

/** Bloc de statistiques en haut de la Hiérarchie, sur toutes les assemblées de l'arbre. */
export function AssemblyStatsBlock({ asm, roots }: { asm: AssemblyStatsState; roots: LeaderHierarchyNode[] }) {
  const { t, language } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`assemblyLife.hierarchy.${k}`, o);
  const { period, setPeriod, statsById, todayIso } = asm;
  const unitIds = useMemo(() => treeUnitIds(roots), [roots]);
  const agg = statsById ? aggregate(unitIds, statsById, todayIso) : null;

  const next = shiftPeriod(period, 1);
  const canGoNext = !isFuturePeriod(next);
  const fmtAvg = (v: number | null) => (v == null ? '—' : v.toLocaleString(language));

  return (
    <Card style={styles.block}>
      <View style={styles.blockHeader}>
        <Ionicons name="book-outline" size={18} color={colors.mossDeep} />
        <Text style={styles.blockTitle}>{th('title')}</Text>
      </View>

      {/* Version compacte (JP 08/10) : périodicités en segments sur une ligne, période en dessous. */}
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
        <Pressable onPress={() => setPeriod(shiftPeriod(period, -1))} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={16} color={colors.ink2} />
        </Pressable>
        <Text style={styles.periodText}>{capitalize(periodLabel(period, t))}</Text>
        <Pressable
          onPress={() => canGoNext && setPeriod(next)}
          disabled={!canGoNext}
          hitSlop={8}
          style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.ink2} />
        </Pressable>
      </View>

      {!!asm.error && <ErrorBanner message={asm.error} onRetry={asm.retry} />}

      {!agg ? (
        !asm.error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile value={agg.meetingCount} label={th('statMeetings')} />
            <Tile value={`${agg.activeCount} / ${agg.unitCount}`} label={th('statActive')} />
            <Tile value={fmtAvg(agg.average)} label={th('statAverage')} />
            <Tile value={agg.distinctAttendees} label={th('statDistinct')} />
            <Tile value={agg.breadBreakingCount} label={th('statBread')} />
            <Tile value={agg.alertRows.length} label={th('statAlert')} alert={agg.alertRows.length > 0} />
          </View>

          {agg.alertRows.length > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⚠ {th('alertTitle')}</Text>
              <Text style={styles.alertNames}>{agg.alertRows.map((r) => r.unitName).join(' · ')}</Text>
            </View>
          )}

          <Text style={styles.note}>{th('distinctNote')}</Text>

          <Button
            label={th('journalAll')}
            variant="soft"
            height={38}
            onPress={() => asm.generateJournal('all', th('scopeAll'), unitIds)}
            loading={asm.generating === 'all'}
            disabled={agg.meetingCount === 0 || (asm.generating !== null && asm.generating !== 'all')}
            style={{ marginTop: 10 }}
            iconLeft={<Ionicons name="document-text-outline" size={15} color={colors.moss} />}
          />
        </>
      )}
    </Card>
  );
}

function Tile({ value, label, alert }: { value: string | number; label: string; alert?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, alert && { color: colors.clay }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * Résumé d'un dirigeant dans l'arbre : « N assemblées · k ⚠ » sur son sous-arbre, et son journal
 * PDF consolidé. Rien tant que les statistiques ne sont pas chargées.
 */
export function LeaderAssemblySummary({ asm, node }: { asm: AssemblyStatsState; node: LeaderHierarchyNode }) {
  const { t } = useLanguage();
  const { statsById, todayIso } = asm;
  const unitIds = useMemo(() => subtreeUnitIds(node), [node]);
  if (!statsById) return null;
  const agg = aggregate(unitIds, statsById, todayIso);
  if (agg.unitCount === 0) return null;
  const busy = asm.generating === node.id;
  const disabled = agg.meetingCount === 0 || (asm.generating !== null && !busy);

  return (
    <View style={styles.leaderRow}>
      <Text style={styles.leaderText} numberOfLines={1}>
        {t('assemblyLife.hierarchy.leaderSummary', { count: agg.unitCount })}
        {agg.alertRows.length > 0 && (
          <Text style={styles.alertInline}>
            {' · '}
            {t('assemblyLife.hierarchy.alertCount', { count: agg.alertRows.length })}
          </Text>
        )}
      </Text>
      <Pressable
        // D-ASM-18 (JP 08/10) : AUCUN NOM de personne dans le journal consolidé — ni dans l'en-tête
        // ni dans le nom du fichier. Le périmètre d'un dirigeant est donc désigné génériquement.
        onPress={() =>
          asm.generateJournal(node.id, t('assemblyLife.hierarchy.scopeLeader', { count: agg.unitCount }), unitIds)
        }
        disabled={disabled}
        hitSlop={8}
        accessibilityLabel={t('assemblyLife.hierarchy.journalLeader')}
        style={[styles.pdfBtn, disabled && { opacity: 0.35 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.moss} />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={14} color={colors.moss} />
            <Text style={styles.pdfBtnText}>{t('assemblyLife.journal.open')}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Ligne Vie d'assemblée d'une assemblée : dernier CR et présence moyenne de la période, ou l'alerte
 * des 3 semaines. Appui → page Vie d'assemblée présélectionnée sur cette assemblée.
 */
export function UnitAssemblyLine({ asm, unitId }: { asm: AssemblyStatsState; unitId: string }) {
  const { t, language } = useLanguage();
  const row = asm.statsById?.get(unitId);
  if (!row) return null;
  const alert = isAlert(row, asm.todayIso);
  // Plancher à 0 : un CR daté d'un jour à venir ne doit pas afficher « il y a -N j ».
  const days = row.lastMeetingDate ? Math.max(0, daysBetween(row.lastMeetingDate, asm.todayIso)) : null;
  const avg = averageAttendance(row.attendanceTotal, row.meetingCount);

  let text: string;
  if (alert) {
    text = `⚠ ${t('assemblyLife.hierarchy.noRecentReport')}`;
    if (days != null) text += ` · ${t('assemblyLife.hierarchy.lastReportShort', { count: days })}`;
  } else {
    text = t('assemblyLife.hierarchy.lastReport', { count: days ?? 0 });
    if (avg != null) text += ` · ${t('assemblyLife.hierarchy.averageLine', { value: avg.toLocaleString(language) })}`;
  }

  const open = () =>
    router.push({
      pathname: '/(tabs)/assembly',
      // `at` : une nouvelle valeur à chaque appui, pour re-présélectionner même si l'onglet
      // affichait déjà cette assemblée puis qu'on en a changé.
      params: { unitId, at: String(Date.now()) },
    } as unknown as Href);

  return (
    <Pressable onPress={open} hitSlop={4} style={styles.unitLine} accessibilityLabel={t('assemblyLife.hierarchy.openAssembly')}>
      <Text style={[styles.unitLineText, alert && styles.alertInline]} numberOfLines={2}>
        {text}
      </Text>
      <Ionicons name="arrow-forward-circle-outline" size={15} color={alert ? colors.clay : colors.moss} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  blockTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
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
  loading: { paddingVertical: 18, alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tileValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.moss },
  tileLabel: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.ink3, marginTop: 1, lineHeight: 13 },
  alertBox: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.clay,
    backgroundColor: colors.paper2,
  },
  alertTitle: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '700', color: colors.clay },
  alertNames: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2, marginTop: 2, lineHeight: 16 },
  alertInline: { color: colors.clay },
  note: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.ink3, lineHeight: 14, marginTop: 8 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  leaderText: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: colors.mossTint,
    minWidth: 40,
    justifyContent: 'center',
  },
  pdfBtnText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600', color: colors.moss },
  unitLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  unitLineText: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossSoft },
});
