import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getStudyHierarchyOverview,
  getStudyHierarchyStats,
  type StudyHierarchyOverview,
  type StudyHierarchyStats,
  type StudyHierarchyUnit,
} from '@/services/assemblyApi';
import { hierarchyAccessDenied, moduleAccessDenied } from '@/services/entitlementsApi';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';

/**
 * « Le Message de Bertoua » dans la Hiérarchie — plan personnel `DIRIGEANT_HIERARCHIE`, code
 * HIERARCHIE_SUIVI (D-ABO-31 et suivantes, JP 27/10).
 *
 * <p>Axe de la CHAÎNE de leadership (supervisor_id récursif) : les assemblées de ma chaîne, jamais
 * celles de ma ville / région (axe géographique d'`EGLISE_VILLE` / ETUDE_SUIVI — offres
 * indépendantes). Le serveur calcule tout (leçons faites D-ETU-42, enseignés D-ETU-53, moyenne
 * D-ETU-43) : aucun recalcul ici, sauf le décompte des leçons faites du module affiché.
 * Aucun nom de membre, aucune réponse (D-ETU-55).
 *
 * <p>Un 403 `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI appelle `onDenied` (l'écran affiche le verrou
 * unique de la hiérarchie) ; un refus d'un autre module (ministère sans STUDY) masque le bloc.
 * Pas de react-query : useState + useEffect, rechargé par `refreshKey` (tirer-pour-rafraîchir).
 *
 * <p>Lot HIE (D-HIE-01 / D-HIE-10, JP 28/10) : le bloc vit sur la page 3 « Vie de mon leadership »,
 * dont le sélecteur de période est unique — les statistiques (`/stats?from&to`) portent sur la
 * période reçue en props (avant : 1er janvier → aujourd'hui) ; la vue d'ensemble par module, elle,
 * n'a pas de période (route serveur inchangée).
 */
export default function StudyHierarchyStatsBlock({
  refreshKey,
  onDenied,
  from,
  to,
  periodTitle,
}: {
  refreshKey: number;
  onDenied: () => void;
  /** Bornes 'yyyy-MM-dd' de la période de la page. */
  from: string;
  to: string;
  /** Libellé de la période affiché au-dessus des tuiles. */
  periodTitle: string;
}) {
  const { t, language } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`hierarchy.study.${k}`, o);
  const [moduleId, setModuleId] = useState<string | undefined>(undefined);
  const [overview, setOverview] = useState<StudyHierarchyOverview | null>(null);
  // Liste des unités d'étude du premier appel SANS `moduleId` : avec `moduleId`, le serveur ne renvoie
  // que ce module-là (`progressModules`) — les puces doivent pourtant rester pour revenir aux autres.
  const [allModules, setAllModules] = useState<StudyHierarchyOverview['modules']>([]);
  const [stats, setStats] = useState<StudyHierarchyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getStudyHierarchyOverview(moduleId), getStudyHierarchyStats(from, to)])
      .then(([o, s]) => {
        if (!active) return;
        setOverview(o);
        if (moduleId === undefined) setAllModules(o.modules);
        setStats(s);
        setError(null);
        setHidden(false);
      })
      .catch((e: any) => {
        if (!active) return;
        if (hierarchyAccessDenied(e)) {
          onDenied();
          return;
        }
        if (moduleAccessDenied(e)) {
          setHidden(true);
          return;
        }
        setError(e?.response?.data?.message ?? th('loadFailed'));
      });
    return () => {
      active = false;
    };
    // `th` / `onDenied` changent à chaque rendu : la clé de rechargement suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, from, to, refreshKey, retryKey]);

  if (hidden) return null;

  // Puces : la liste complète ; module affiché : celui que le serveur a renvoyé pour `moduleId`.
  const modules = allModules.length > 0 ? allModules : overview?.modules ?? [];
  const selected =
    overview?.modules.find((m) => m.id === moduleId) ??
    modules.find((m) => m.id === moduleId) ??
    overview?.modules[0] ??
    null;
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v).toLocaleString(language)} %`);

  return (
    <Card style={styles.block}>
      <View style={styles.blockHeader}>
        <Ionicons name="school-outline" size={18} color={colors.mossDeep} />
        {/* D-ETU-04 : libellé FIXE du programme. */}
        <Text style={styles.blockTitle}>{t('study.tile.title')}</Text>
      </View>

      {!!error && <ErrorBanner message={error} onRetry={() => setRetryKey((k) => k + 1)} />}

      {!overview || !stats ? (
        !error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : (
        <>
          <Text style={styles.sectionLabel}>{periodTitle}</Text>
          <View style={styles.tiles}>
            <Tile value={stats.sessionsFinished} label={th('statSessions')} />
            <Tile value={stats.lessonsDone} label={th('statLessons')} />
            <Tile value={stats.membersTaught} label={th('statTaught')} />
            <Tile value={pct(stats.averageScorePercent)} label={th('statAverage')} />
          </View>

          {modules.length > 1 && (
            <View style={styles.chips}>
              {modules.map((m) => {
                const on = moduleId ? m.id === moduleId : selected?.id === m.id;
                return (
                  <Pressable key={m.id} onPress={() => setModuleId(m.id)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                      {m.code ?? m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!!selected && <Text style={styles.sectionLabel}>{selected.name}</Text>}

          {overview.units.length === 0 ? (
            <Text style={styles.empty}>{th('empty')}</Text>
          ) : (
            overview.units.map((u) => (
              <UnitLine
                key={u.unitId}
                unit={u}
                lessonIds={selected ? selected.lessons.map((l) => l.id) : null}
                pct={pct}
              />
            ))
          )}
          <Text style={styles.note}>{th('note')}</Text>
        </>
      )}
    </Card>
  );
}

function UnitLine({
  unit,
  lessonIds,
  pct,
}: {
  unit: StudyHierarchyUnit;
  lessonIds: string[] | null;
  pct: (v: number | null) => string;
}) {
  const { t } = useLanguage();
  const th = (k: string, o?: Record<string, unknown>) => t(`hierarchy.study.${k}`, o);
  const done = lessonIds ? unit.doneLessonIds.filter((id) => lessonIds.includes(id)).length : unit.doneLessonIds.length;
  const day = (iso: string) => fmtIsoDay(iso.length > 10 ? toLocalDate(new Date(iso)) : iso, t);

  return (
    <View style={styles.unit}>
      <Text style={styles.unitName} numberOfLines={1}>
        {unit.unitName}
        {unit.cityName ? `  ·  ${unit.cityName}` : ''}
      </Text>
      {(!!unit.leaderName || unit.supervisorChain.length > 0) && (
        <Text style={styles.meta} numberOfLines={2}>
          {unit.leaderName ? t('hierarchy.leaderPrefix', { name: unit.leaderName }) : ''}
          {unit.supervisorChain.length > 0
            ? `${unit.leaderName ? ' · ' : ''}${th('via', { chain: unit.supervisorChain.join(' › ') })}`
            : ''}
        </Text>
      )}
      <View style={styles.figures}>
        {lessonIds && (
          <Text style={styles.figure}>{th('lessonsDone', { done, total: lessonIds.length })}</Text>
        )}
        <Text style={styles.figure}>
          {th('taught', { taught: unit.taughtCount, count: unit.memberCount })}
          {unit.notTaughtCount > 0 && (
            <Text style={styles.notTaught}>{` · ${th('notTaught', { count: unit.notTaughtCount })}`}</Text>
          )}
        </Text>
        <Text style={styles.figure}>{th('average', { value: pct(unit.averageScorePercent) })}</Text>
      </View>
      <Text style={styles.meta}>
        {unit.lastSessionDate ? th('lastSession', { date: day(unit.lastSessionDate) }) : th('noSession')}
      </Text>
    </View>
  );
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  blockTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
  loading: { paddingVertical: 18, alignItems: 'center' },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 10,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tile: {
    flexBasis: '45%',
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.mossTint },
  chipOn: { backgroundColor: colors.moss },
  chipText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: colors.ink2 },
  chipTextOn: { color: colors.white },
  unit: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.hair },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, marginTop: 4 },
  figure: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2 },
  notTaught: { color: colors.clay },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 14 },
  note: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.ink3, lineHeight: 14, marginTop: 10 },
});
