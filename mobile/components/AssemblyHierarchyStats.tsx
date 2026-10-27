import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAssemblyStats, listMeetingsInRange, type UnitMeetingStats } from '@/services/assemblyApi';
import type { LeaderHierarchyNode } from '@/services/leadersApi';
import { buildConsolidatedJournalHtml, journalFileName, periodRange, type Period } from '@/utils/assemblyJournal';
import { aggregate, averageAttendance, daysBetween, isAlert, treeUnitIds } from '@/utils/assemblyHierarchyStats';
import { printAndSharePdf } from '@/utils/pdfShare';
import { toLocalDate } from '@/utils/format';
import { notify } from '@/utils/dialogs';
import { hierarchyAccessDenied } from '@/services/entitlementsApi';

/**
 * Vie d'assemblée dans la Hiérarchie — D-ASM-18 (JP 08/10).
 *
 * Un dirigeant voit les statistiques des comptes rendus des assemblées sous son leadership et
 * génère un journal PDF consolidé (tout son périmètre, ou le sous-arbre d'un dirigeant).
 * - Visible seulement avec l'abonnement ASSEMBLY et un rôle au-dessus de MEMBRE (RG-06) : c'est
 *   l'appelant (`app/hierarchie/vie.tsx`) qui passe `enabled`.
 * - Bloc PAYANT depuis le 27/10 (plan personnel `DIRIGEANT_HIERARCHIE`, code HIERARCHIE_SUIVI,
 *   D-ABO-31 et suivantes, JP 27/10) : `/stats` et `/meetings?unitIds=` sont gardés par ce code et
 *   leur périmètre est la CHAÎNE de leadership de l'appelant (plus la géographie RG-ASM-05) ; un 403
 *   `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI passe `denied` à vrai, l'écran affiche alors le verrou.
 *   Les CR, le journal et les réunions de SA propre assemblée restent gratuits (autres routes).
 * - AUCUN NOM de personne (D-ASM-18) : que des nombres et des noms d'assemblée.
 * - Alerte « sans CR depuis 3 semaines » : affichage seul, aucune relance (D-ASM-09 gelé).
 * L'agrégat est dans `utils/assemblyHierarchyStats.ts` (pur).
 *
 * Lot HIE (D-HIE-01 / D-HIE-10, JP 28/10) : le bloc vit sur la page 3 « Vie de mon leadership »
 * (`app/hierarchie/vie.tsx`), dont le sélecteur de période est UNIQUE pour toute la page — la période
 * arrive donc en paramètre (plus de sélecteur ici) ; le bouton « Journal PDF de ma hiérarchie » est
 * porté par la page. Les résumés par dirigeant et les lignes de CR ont quitté l'arbre de la page 1
 * (payants) : `UnitAssemblyLine` sert à la liste « Assemblées et dernier CR » de la page 3.
 */

export interface AssemblyStatsState {
  /** Période de la page (D-HIE-01 : sélecteur unique, porté par l'écran). */
  period: Period;
  /** null = chargement de la période en cours. */
  statsById: ReadonlyMap<string, UnitMeetingStats> | null;
  /** Date du jour au moment du chargement ('yyyy-MM-dd'), référence de l'alerte des 21 jours. */
  todayIso: string;
  error: string | null;
  retry: () => void;
  /** Clé du périmètre dont le journal est en cours de génération ('all' ou id du dirigeant). */
  generating: string | null;
  generateJournal: (scopeKey: string, scopeLabel: string, unitIds: string[]) => void;
  /** 403 `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI reçu : l'écran remplace le bloc par le verrou. */
  denied: boolean;
}

/**
 * Chargement de `/stats` pour la période choisie. Pas de react-query côté mobile ; aucun setState
 * synchrone dans l'effet (les données affichées sont DÉRIVÉES de la clé chargée, comme le journal).
 * `refreshKey` : incrémenté par le tirer-pour-rafraîchir de l'écran — les chiffres précédents
 * restent affichés jusqu'à la réponse.
 */
export function useAssemblyHierarchyStats(enabled: boolean, refreshKey: number, period: Period): AssemblyStatsState {
  const { t, language } = useLanguage();
  const [loaded, setLoaded] = useState<{ key: string; rows: UnitMeetingStats[]; todayIso: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [generating, setGenerating] = useState<string | null>(null);
  // Un 403 HIERARCHIE_SUIVI ferme le bloc jusqu'au prochain tirer-pour-rafraîchir (droit revérifié).
  const [deniedKey, setDeniedKey] = useState<number | null>(null);

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
        if (!active) return;
        if (hierarchyAccessDenied(e)) {
          setDeniedKey(refreshKey);
          return;
        }
        setFailure({ key: requestKey, message: e?.response?.data?.message ?? t('assemblyLife.loadFailed') });
      });
    return () => {
      active = false;
    };
  }, [enabled, from, to, dataKey, requestKey, refreshKey, t]);

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
      if (hierarchyAccessDenied(e)) {
        // Droit retiré entre-temps (fin de période, grâce échue) : verrou, texte neutre (D-ABO-13).
        setDeniedKey(refreshKey);
        notify(t('common.appName'), t('hierarchy.lock.notActivated'));
        return;
      }
      notify(t('common.appName'), e?.response?.data?.message ?? t('assemblyLife.journal.failed'));
    } finally {
      setGenerating(null);
    }
  };

  return {
    period,
    statsById,
    todayIso,
    error: failure?.key === requestKey ? failure.message : null,
    retry: () => setRetryKey((k) => k + 1),
    generating,
    generateJournal: (k, l, ids) => {
      void generateJournal(k, l, ids);
    },
    denied: deniedKey !== null && deniedKey === refreshKey,
  };
}

/** Bloc de statistiques de la page « Vie de mon leadership », sur toutes les assemblées de l'arbre. */
export function AssemblyStatsBlock({ asm, roots }: { asm: AssemblyStatsState; roots: LeaderHierarchyNode[] }) {
  const { t, language } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`assemblyLife.hierarchy.${k}`, o);
  const { statsById, todayIso } = asm;
  const unitIds = useMemo(() => treeUnitIds(roots), [roots]);
  const agg = statsById ? aggregate(unitIds, statsById, todayIso) : null;
  const fmtAvg = (v: number | null) => (v == null ? '—' : v.toLocaleString(language));

  return (
    <Card style={styles.block}>
      <View style={styles.blockHeader}>
        <Ionicons name="book-outline" size={18} color={colors.mossDeep} />
        <Text style={styles.blockTitle}>{th('title')}</Text>
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
  unitLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  unitLineText: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossSoft },
});
