import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Chip from '@/components/Chip';
import Button from '@/components/Button';
import SelectField from '@/components/SelectField';
import ErrorBanner from '@/components/ErrorBanner';
import StudyCityLock from '@/components/StudyCityLock';
import EventPeriodPicker from '@/components/EventPeriodPicker';
import EventStatsDrill from '@/components/EventStatsDrill';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getLocalityMeetingStats,
  getStudyLocalityOverview,
  getStudyLocalityStats,
  listAssemblyLocalities,
  listLocalityMeetings,
  listStudyLocalities,
  listStudyLocalityMembers,
  studyErrorMessage,
  type AssemblyLocality,
  type StudyLocalityMember,
  type StudyLocalityModule,
  type StudyLocalityOverview,
  type StudyLocalityStats,
  type StudyMemberStatus,
  type StudyMissedLesson,
  type UnitMeetingStats,
} from '@/services/assemblyApi';
import { cityJournalAccessDenied, studyCityAccessDenied } from '@/services/entitlementsApi';
import {
  PERIODICITIES,
  buildConsolidatedJournalHtml,
  currentPeriod,
  isFuturePeriod,
  journalFileName,
  periodLabel,
  periodRange as journalRange,
  shiftPeriod as shiftJournalPeriod,
  type Period as JournalPeriod,
} from '@/utils/assemblyJournal';
import { aggregate, averageAttendance, daysBetween, isAlert } from '@/utils/assemblyHierarchyStats';
import { defaultPeriod, periodBounds, type Period as EventPeriod } from '@/utils/events';
import { printAndSharePdf } from '@/utils/pdfShare';
import { notify } from '@/utils/dialogs';
import { fmtPoints, toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { goBack } from '@/utils/navigation';
import { mergeCities, type CityEntry } from '@/utils/cityFollowUp';

type StudyTab = 'overview' | 'members' | 'stats';
type Tab = StudyTab | 'journal' | 'events';
const TABS: Tab[] = ['overview', 'members', 'stats', 'journal', 'events'];
const STUDY_TABS: readonly Tab[] = ['overview', 'members', 'stats'];
type Period = 'year' | 'last12' | 'lastYear';
type Translate = (k: string, o?: any) => string;

/**
 * SUIVI DE LA VILLE — lot « pro-plan » (plan 27/10 §7.4, contrat 27/10 §7, §9, §12.2), étendu au
 * Journal de la ville et aux Évènements (offre Néhémie, M-01 levée — D-OFF-03 / D-OFF-05 / D-OFF-12,
 * JP 28/10). Axe GÉOGRAPHIQUE uniquement (`getAllVisibleLocalityIds`), jamais la chaîne Caleb.
 *
 * <p>D-ETU-53 (JP 27/10) : en LECTURE seule, pour les responsables de la ville (D-ABO-21 : dirigeant
 * de ville, SENIOR, COORDINATEUR, LEADER, SECRETARIAT, superAdmin) — `GET /study/localities` et
 * `GET /assembly/localities` le disent : `[]` pour un membre ou un dirigeant d'unité (RG-ABO-22),
 * l'écran n'affiche alors que « aucune ville ».
 * <ul>
 *   <li>sélecteur de ville quand il y en a plusieurs, cadenas sur une ville qui n'ouvre ni l'étude
 *       ni le journal (§9.3) ;</li>
 *   <li>onglets « Le Message de Bertoua » Assemblées (avancement assemblée × leçon, D-ETU-42) ·
 *       Membres (enseignés / non enseignés / leçons manquées, filtre par assemblée) · Statistiques
 *       (période, mois) — ville présente dans `/study/localities` ; filtre d'unité d'étude partagé ;</li>
 *   <li>onglet Journal (`JOURNAL`, D-OFF-05, JP 28/10) — ville présente dans `/assembly/localities`
 *       et module ASSEMBLY accessible : statistiques des CR par assemblée et journal PDF « Ville de
 *       {ville} », SANS AUCUN NOM de personne (`attendeeCount`) ;</li>
 *   <li>onglet Évènements (`EVENEMENTS_SUIVI`, D-OFF-12, JP 28/10) — module EVENTS accessible :
 *       `EventStatsDrill` ancré sur la ville ; le total de la ville est gratuit, la ventilation par
 *       assemblée arrive `children = null` + `childrenLocked` sans l'offre (verrou à sa place).</li>
 * </ul>
 * CHAQUE ONGLET DÉCIDE SELON SON PROPRE CODE (JP 28/10) : une ville `entitled = false` pour l'étude
 * (ou un 403 `ETUDE_SUIVI`) ne verrouille que les trois onglets Bertoua ; Journal et Évènements
 * restent ouverts avec leurs propres verrous (un accord de ministère peut ne couvrir qu'un code).
 * D-ETU-55 : aucune donnée de réponse n'arrive ici, seulement des notes calculées par le serveur.
 * Verrous = `StudyCityLock` (offre Néhémie, texte neutre D-OFF-09, seul lien « En savoir plus »
 * D-OFF-11), jamais un toast, sans aucun paiement (RG-ABO-24, D-ABO-13). Pas d'export Bertoua sur
 * l'app (§12.2) ; le journal PDF de la ville réutilise le générateur consolidé de la Hiérarchie.
 * Pas de react-query : useState + useFocusEffect.
 */
export default function StudyCityScreen() {
  const params = useLocalSearchParams<{ localityId?: string }>();
  const wanted = typeof params.localityId === 'string' && params.localityId ? params.localityId : null;
  const { t } = useLanguage();
  const { hasAssembly, hasEvents } = useAuth();

  const [localities, setLocalities] = useState<CityEntry[] | null>(null);
  const [localityId, setLocalityId] = useState<string | null>(wanted);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [moduleId, setModuleId] = useState<string | null>(null);
  // Remonté par un onglet Bertoua sur 403 ETUDE_SUIVI : le verrou remplace les trois onglets Bertoua
  // (§9.1) — jamais Journal ni Évènements, qui ont leur propre code.
  const [denied, setDenied] = useState<{ canSubscribe: boolean } | null>(null);
  // Périodes du Journal et des Évènements, gardées au tirer-pour-rafraîchir et au changement de ville.
  const [journalPeriod, setJournalPeriod] = useState<JournalPeriod>(() => currentPeriod('month'));
  const [eventPeriod, setEventPeriod] = useState<EventPeriod>(() => defaultPeriod('year'));
  // Incrémenté par le tirer-pour-rafraîchir : les onglets rechargent.
  const [reloadKey, setReloadKey] = useState(0);
  // Ville affichée, lue par les rappels asynchrones (verrou d'une réponse tardive, rechargement au focus).
  const localityRef = useRef<string | null>(wanted);
  useEffect(() => {
    localityRef.current = localityId;
  }, [localityId]);

  const loadLocalities = useCallback(async () => {
    // Les deux listes en parallèle ; l'échec de l'une n'empêche pas l'autre de s'afficher.
    const [study, journal] = await Promise.allSettled([
      listStudyLocalities(),
      hasAssembly ? listAssemblyLocalities() : Promise.resolve<AssemblyLocality[]>([]),
    ]);
    const failed = study.status === 'rejected' ? study.reason : journal.status === 'rejected' ? journal.reason : null;
    const list = mergeCities(
      study.status === 'fulfilled' ? study.value : [],
      journal.status === 'fulfilled' ? journal.value : [],
    );
    if (failed && list.length === 0) {
      setListError(studyErrorMessage(failed, t));
      setLocalities((cur) => cur ?? []);
      return;
    }
    const cur = localityRef.current;
    const next = cur && list.some((l) => l.localityId === cur) ? cur : (list[0]?.localityId ?? null);
    setLocalities(list);
    setListError(failed ? studyErrorMessage(failed, t) : null);
    localityRef.current = next;
    setLocalityId(next);
    // Revue 27/10 : un verrou posé par un 403 ETUDE_SUIVI ne survit pas au retour sur l'écran quand
    // la liste dit désormais la ville `entitled` (renouvellement fait sur le web entre-temps) —
    // le contenu est remonté et relu ; s'il répond encore 403, le verrou revient.
    if (list.find((l) => l.localityId === next)?.studyEntitled) setDenied(null);
  }, [hasAssembly, t]);

  useFocusEffect(
    useCallback(() => {
      void loadLocalities();
    }, [loadLocalities]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadLocalities();
      setDenied(null);
      setReloadKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const selected = localities?.find((l) => l.localityId === localityId) ?? null;

  // Un 403 ne verrouille que la ville qui l'a demandé : la réponse tardive d'une ville quittée
  // (StudyContent démonté) ne verrouille pas la ville nouvellement choisie (revue 27/10).
  const onDenied = useCallback((forId: string, d: { canSubscribe: boolean }) => {
    if (forId === localityRef.current) setDenied(d);
  }, []);

  const pickLocality = (id: string) => {
    if (id === localityId) return;
    localityRef.current = id;
    setLocalityId(id);
    setModuleId(null);
    setDenied(null);
  };

  // Onglets de la ville (comme le web) : Bertoua si elle est dans `/study/localities`, Journal si
  // elle est dans `/assembly/localities` (module ASSEMBLY), Évènements si le module EVENTS est
  // accessible. L'onglet choisi absent pour cette ville → le premier disponible.
  const available = TABS.filter((k) =>
    STUDY_TABS.includes(k)
      ? selected?.studyEntitled != null
      : k === 'journal'
        ? hasAssembly && selected?.journalEntitled != null
        : hasEvents,
  );
  const shownTab: Tab | null = available.includes(tab) ? tab : (available[0] ?? null);
  const isStudyTab = shownTab != null && STUDY_TABS.includes(shownTab);

  // §9.3 : cadenas Bertoua sans attendre le 403 quand la liste dit déjà que la ville n'ouvre pas droit.
  const studyLocked = denied != null || selected?.studyEntitled === false;

  const tabLabel = (k: Tab) => t(`study.city.tabs.${k}`);
  const kicker = isStudyTab ? t('study.tile.title') : shownTab ? tabLabel(shownTab) : t('study.city.entry');

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{selected ? t('study.city.titleOf', { city: selected.localityName }) : t('study.city.title')}</Text>

      {!!listError && <ErrorBanner message={listError} onRetry={loadLocalities} />}

      {localities === null ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : localities.length === 0 ? (
        !listError && (
          <Card variant="paper2" style={styles.empty}>
            <Ionicons name="business-outline" size={26} color={colors.ink3} />
            <Text style={styles.emptyText}>{t('study.city.noCity')}</Text>
          </Card>
        )
      ) : (
        <>
          {localities.length > 1 && (
            <View style={styles.chips}>
              {localities.map((l) => (
                <Chip
                  key={l.localityId}
                  label={l.localityName}
                  selected={l.localityId === localityId}
                  onPress={() => pickLocality(l.localityId)}
                  iconLeft={
                    // Cadenas seulement si la ville n'ouvre ni l'étude ni le journal (comme le web).
                    l.studyEntitled || l.journalEntitled ? undefined : (
                      <Ionicons
                        name="lock-closed"
                        size={12}
                        color={l.localityId === localityId ? colors.white : colors.ink3}
                        accessibilityLabel={t('study.city.lockedCity')}
                      />
                    )
                  }
                />
              ))}
            </View>
          )}

          {selected && available.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabs}
            >
              {available.map((k) => {
                const on = k === shownTab;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTab(k)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.tab, on && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{tabLabel(k)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {selected &&
            shownTab &&
            (isStudyTab ? (
              studyLocked ? (
                <StudyCityLock />
              ) : (
                <StudyContent
                  key={`${selected.localityId}:${reloadKey}`}
                  localityId={selected.localityId}
                  tab={shownTab as StudyTab}
                  moduleId={moduleId}
                  onModule={setModuleId}
                  onDenied={onDenied}
                />
              )
            ) : shownTab === 'journal' ? (
              <JournalTab
                key={`${selected.localityId}:${reloadKey}`}
                city={selected}
                period={journalPeriod}
                onPeriod={setJournalPeriod}
              />
            ) : (
              <View style={styles.block}>
                <EventPeriodPicker value={eventPeriod} onChange={setEventPeriod} />
                {(() => {
                  const bounds = periodBounds(eventPeriod);
                  return bounds ? (
                    <EventStatsDrill
                      // Changer de ville remonte la descente (fil d'Ariane repart de la ville).
                      key={selected.localityId}
                      from={bounds.from}
                      to={bounds.to}
                      refreshKey={reloadKey}
                      root={{ level: 'LOCALITY', id: selected.localityId }}
                    />
                  ) : null;
                })()}
              </View>
            ))}
        </>
      )}
    </ScreenShell>
  );
}

/** Contenu Bertoua d'une ville ouvrant droit : filtre d'unité et données de l'onglet. */
function StudyContent({
  localityId,
  tab,
  moduleId,
  onModule,
  onDenied,
}: {
  localityId: string;
  tab: StudyTab;
  moduleId: string | null;
  onModule: (id: string | null) => void;
  onDenied: (localityId: string, d: { canSubscribe: boolean }) => void;
}) {
  const { t } = useLanguage();
  // Démonté (ville quittée, rafraîchissement) : ses requêtes en vol ne remontent plus de verrou.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const deny = useCallback(
    (d: { canSubscribe: boolean }) => {
      if (alive.current) onDenied(localityId, d);
    },
    [localityId, onDenied],
  );
  // La vue Assemblées est lue SANS filtre : elle fournit la liste des unités et des assemblées
  // (filtres des autres onglets) ; le filtre d'unité y est appliqué à l'affichage.
  const [overview, setOverview] = useState<StudyLocalityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getStudyLocalityOverview(localityId));
      setError(null);
    } catch (e: any) {
      const d = studyCityAccessDenied(e);
      if (d) deny({ canSubscribe: d.canSubscribe });
      else setError(studyErrorMessage(e, t));
    }
  }, [localityId, deny, t]);

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview]),
  );

  const modules = overview?.modules ?? [];

  return (
    <>
      {modules.length > 1 && (
        <View style={styles.chips}>
          <Chip label={t('study.city.allModules')} selected={!moduleId} onPress={() => onModule(null)} />
          {modules.map((m) => (
            <Chip
              key={m.moduleId}
              label={m.code ?? m.name}
              selected={moduleId === m.moduleId}
              onPress={() => onModule(m.moduleId)}
            />
          ))}
        </View>
      )}

      {!!error && <ErrorBanner message={error} onRetry={loadOverview} />}

      {tab === 'overview' ? (
        overview ? (
          <OverviewTab overview={overview} moduleId={moduleId} />
        ) : (
          !error && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.moss} />
            </View>
          )
        )
      ) : tab === 'members' ? (
        <MembersTab localityId={localityId} moduleId={moduleId} overview={overview} onDenied={deny} />
      ) : (
        <StatsTab localityId={localityId} moduleId={moduleId} onDenied={deny} />
      )}
    </>
  );
}

/**
 * JOURNAL DE LA VILLE — offre Néhémie, code `JOURNAL` (D-OFF-05, JP 27/10 ; écran mobile D-OFF-03,
 * M-01 levée, JP 28/10). Port en lecture de l'onglet web (`CityStudy.tsx` › `CityJournalTab`) :
 * période (mois, trimestre, semestre, année — mêmes périodes que la Hiérarchie), synthèse, alerte
 * « sans CR depuis 3 semaines » (affichage seul, D-ASM-09 gelé), une ligne par assemblée, journal PDF
 * consolidé « Ville de {ville} » (générateur de la Hiérarchie, `printAndSharePdf`).
 * AUCUN NOM de personne : le serveur ne renvoie que des nombres (`attendeeCount`) et des noms
 * d'assemblée. Sans `JOURNAL` (liste `entitled = false`, ou 403 `MODULE_ACCESS_DENIED` / JOURNAL sur
 * n'importe quelle route, PDF compris) : l'onglet ENTIER est remplacé par le verrou Néhémie — sans
 * appeler `/locality/{id}/stats` quand la liste le dit déjà, jamais un toast, aucun prix ni bouton.
 */
function JournalTab({
  city,
  period,
  onPeriod,
}: {
  city: CityEntry;
  period: JournalPeriod;
  onPeriod: (p: JournalPeriod) => void;
}) {
  const { t, language } = useLanguage();
  const [loaded, setLoaded] = useState<{ key: string; rows: UnitMeetingStats[]; todayIso: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const seq = useRef(0);
  const { from, to } = journalRange(period);
  const dataKey = `${from}|${to}`;
  const locked = denied || city.journalEntitled === false;

  const load = useCallback(async () => {
    if (city.journalEntitled === false) return;
    const mine = ++seq.current;
    try {
      const rows = await getLocalityMeetingStats(city.localityId, from, to);
      if (mine !== seq.current) return; // une réponse plus ancienne n'écrase pas la dernière
      setLoaded({ key: `${from}|${to}`, rows, todayIso: toLocalDate(new Date()) });
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      if (cityJournalAccessDenied(e)) setDenied(true);
      else setError(studyErrorMessage(e, t));
    }
  }, [city.localityId, city.journalEntitled, from, to, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (locked) return <StudyCityLock />;

  const current = loaded?.key === dataKey ? loaded : null;
  const rows = current?.rows ?? null;
  const todayIso = current?.todayIso ?? toLocalDate(new Date());
  const agg = rows ? aggregate(rows.map((r) => r.unitId), new Map(rows.map((r) => [r.unitId, r])), todayIso) : null;
  const fmtAvg = (v: number | null) => (v == null ? '—' : v.toLocaleString(language));
  const scopeLabel = t('study.city.journal.scope', { city: city.localityName });

  const generate = async () => {
    if (!agg || agg.meetingCount === 0 || generating) return;
    setGenerating(true);
    try {
      const meetings = await listLocalityMeetings(city.localityId, from, to);
      const html = buildConsolidatedJournalHtml(
        { scopeLabel, period, stats: agg.rows, meetings, generatedOn: toLocalDate(new Date()), locale: language },
        t,
      );
      const outcome = await printAndSharePdf({
        html,
        fileName: journalFileName(scopeLabel, period),
        dialogTitle: t('assemblyLife.hierarchy.docTitle'),
      });
      if (outcome === 'unavailable') notify(t('common.appName'), t('assemblyLife.journal.shareUnavailable'));
    } catch (e: any) {
      // Droit retiré entre-temps (fin de période, grâce échue) : verrou à la place de l'onglet.
      if (cityJournalAccessDenied(e)) setDenied(true);
      else notify(t('common.appName'), e?.response?.data?.message ?? t('assemblyLife.journal.failed'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.block}>
      <JournalPeriodPicker period={period} onPeriod={onPeriod} />

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {!agg ? (
        !error && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : agg.unitCount === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="home-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('study.city.noAssembly')}</Text>
        </Card>
      ) : (
        <>
          <View style={styles.kpis}>
            <Kpi label={t('assemblyLife.hierarchy.statMeetings')} value={String(agg.meetingCount)} />
            <Kpi label={t('assemblyLife.hierarchy.statActive')} value={`${agg.activeCount} / ${agg.unitCount}`} />
            <Kpi label={t('assemblyLife.hierarchy.statAverage')} value={fmtAvg(agg.average)} />
            <Kpi label={t('assemblyLife.hierarchy.statDistinct')} value={String(agg.distinctAttendees)} />
            <Kpi label={t('assemblyLife.hierarchy.statBread')} value={String(agg.breadBreakingCount)} />
            <Kpi
              label={t('assemblyLife.hierarchy.statAlert')}
              value={String(agg.alertRows.length)}
              alert={agg.alertRows.length > 0}
            />
          </View>

          {agg.alertRows.length > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⚠ {t('assemblyLife.hierarchy.alertTitle')}</Text>
              <Text style={styles.alertNames}>{agg.alertRows.map((r) => r.unitName).join(' · ')}</Text>
            </View>
          )}

          <Label style={styles.blockLabel}>{t('assemblyLife.hierarchy.unitsTitle')}</Label>
          {agg.rows.map((r) => (
            <JournalUnitRow key={r.unitId} row={r} todayIso={todayIso} />
          ))}

          <Text style={styles.muted}>
            {t('assemblyLife.hierarchy.distinctNote')} {t('study.city.journal.noNames')}
          </Text>

          <Button
            label={t('study.city.journal.pdf')}
            variant="soft"
            height={44}
            onPress={() => void generate()}
            loading={generating}
            disabled={agg.meetingCount === 0}
            style={{ marginTop: 6 }}
            iconLeft={<Ionicons name="document-text-outline" size={16} color={colors.moss} />}
          />
        </>
      )}
    </View>
  );
}

/** Une assemblée de la ville : réunions de la période, présence moyenne, fractions de pain, dernier CR. */
function JournalUnitRow({ row, todayIso }: { row: UnitMeetingStats; todayIso: string }) {
  const { t, language } = useLanguage();
  const alert = isAlert(row, todayIso);
  // Plancher à 0 : un CR daté d'un jour à venir ne doit pas afficher « il y a -N j ».
  const days = row.lastMeetingDate ? Math.max(0, daysBetween(row.lastMeetingDate, todayIso)) : null;
  const avg = averageAttendance(row.attendanceTotal, row.meetingCount);
  const figures = [t('hierarchy.life.meetingsInPeriod', { count: row.meetingCount })];
  if (avg != null) figures.push(t('assemblyLife.hierarchy.averageLine', { value: avg.toLocaleString(language) }));
  if (row.breadBreakingCount > 0) {
    figures.push(`${t('assemblyLife.hierarchy.colBread')} : ${row.breadBreakingCount}`);
  }
  let last: string;
  if (alert) {
    last = `⚠ ${t('assemblyLife.hierarchy.noRecentReport')}`;
    if (days != null) last += ` · ${t('assemblyLife.hierarchy.lastReportShort', { count: days })}`;
  } else {
    last = t('assemblyLife.hierarchy.lastReport', { count: days ?? 0 });
  }
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.unitName}
        </Text>
        <Text style={styles.rowMeta}>{figures.join(' · ')}</Text>
        <Text style={[styles.rowMeta, alert && { color: colors.clay }]}>{last}</Text>
      </View>
    </View>
  );
}

/** Période du journal (mois, trimestre, semestre, année ; flèches, jamais une période à venir). */
function JournalPeriodPicker({ period, onPeriod }: { period: JournalPeriod; onPeriod: (p: JournalPeriod) => void }) {
  const { t } = useLanguage();
  const next = shiftJournalPeriod(period, 1);
  const canGoNext = !isFuturePeriod(next);
  const label = periodLabel(period, t);
  return (
    <Card style={styles.periodCard}>
      <View style={styles.segments}>
        {PERIODICITIES.map((k) => (
          <Pressable
            key={k}
            onPress={() => onPeriod(currentPeriod(k))}
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
          onPress={() => onPeriod(shiftJournalPeriod(period, -1))}
          hitSlop={8}
          style={styles.navBtn}
          accessibilityLabel={t('hierarchy.life.previousPeriod')}
        >
          <Ionicons name="chevron-back" size={16} color={colors.ink2} />
        </Pressable>
        <Text style={styles.periodText}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
        <Pressable
          onPress={() => canGoNext && onPeriod(next)}
          disabled={!canGoNext}
          hitSlop={8}
          style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]}
          accessibilityLabel={t('hierarchy.life.nextPeriod')}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.ink2} />
        </Pressable>
      </View>
    </Card>
  );
}

function fmtInstantDay(iso: string | null, t: Translate): string {
  return iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '';
}

/** §7.4 — une carte par unité d'étude : chaque assemblée, ses leçons faites (✓) et sa dernière séance. */
function OverviewTab({ overview, moduleId }: { overview: StudyLocalityOverview; moduleId: string | null }) {
  const { t } = useLanguage();
  const modules = overview.modules.filter((m) => !moduleId || m.moduleId === moduleId);
  if (overview.assemblies.length === 0 || modules.length === 0) {
    return (
      <Card variant="paper2" style={styles.empty}>
        <Ionicons name="school-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>
          {overview.assemblies.length === 0 ? t('study.city.noAssembly') : t('study.progress.noModules')}
        </Text>
      </Card>
    );
  }
  return (
    <>
      {modules.map((m) => (
        <View key={m.moduleId} style={styles.block}>
          <Label style={styles.blockLabel}>{[m.code, m.name].filter(Boolean).join(' · ')}</Label>
          {overview.assemblies.map((a) => {
            const row = a.modules.find((x) => x.moduleId === m.moduleId);
            const done = row?.lessonsDone ?? 0;
            const numbers = row?.doneLessonNumbers ?? [];
            const last = row?.lastSessionAt ?? null;
            return (
              <Card key={a.unitId} style={styles.assemblyCard}>
                <View style={styles.cardHead}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {a.unitName}
                  </Text>
                  <Text style={styles.count}>
                    {t('study.home.lessonsDone', { done, total: m.totalLessons })}
                  </Text>
                </View>
                <LessonCells module={m} done={numbers} />
                <Text style={styles.rowMeta}>
                  {[
                    t('study.city.memberCount', { count: a.memberCount }),
                    last ? t('study.progress.lastSession', { date: fmtInstantDay(last, t) }) : t('study.city.noSession'),
                  ].join(' · ')}
                </Text>
              </Card>
            );
          })}
        </View>
      ))}
    </>
  );
}

/** Une case par leçon (numéro), pleine si l'assemblée l'a faite (D-ETU-42). */
function LessonCells({ module, done }: { module: StudyLocalityModule; done: number[] }) {
  const { t } = useLanguage();
  const lessons =
    module.lessons.length > 0
      ? module.lessons
      : Array.from({ length: module.totalLessons }, (_, i) => ({ number: i + 1, title: '' }));
  return (
    <View style={styles.cells}>
      {lessons.map((l) => {
        const on = done.includes(l.number);
        return (
          <View
            key={l.number}
            style={[styles.cell, on && styles.cellOn]}
            accessibilityLabel={`${t('study.lesson', { number: l.number })} · ${on ? t('study.city.lessonDone') : t('study.progress.notDone')}`}
          >
            <Text style={[styles.cellText, on && styles.cellTextOn]}>{l.number}</Text>
          </View>
        );
      })}
    </View>
  );
}

const STATUSES: (StudyMemberStatus | null)[] = [null, 'TAUGHT', 'NOT_TAUGHT', 'MISSED'];

/** §7.5 — membres de la ville, filtres statut et assemblée (le filtre d'unité vient du parent). */
function MembersTab({
  localityId,
  moduleId,
  overview,
  onDenied,
}: {
  localityId: string;
  moduleId: string | null;
  overview: StudyLocalityOverview | null;
  onDenied: (d: { canSubscribe: boolean }) => void;
}) {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState<StudyMemberStatus | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [rows, setRows] = useState<StudyLocalityMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = await listStudyLocalityMembers(localityId, {
        status: status ?? undefined,
        moduleId: moduleId ?? undefined,
        unitId: unitId ?? undefined,
      });
      if (mine !== seq.current) return; // une réponse plus ancienne n'écrase pas la dernière
      setRows(list);
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      const d = studyCityAccessDenied(e);
      if (d) onDenied({ canSubscribe: d.canSubscribe });
      else setError(studyErrorMessage(e, t));
    }
  }, [localityId, status, moduleId, unitId, onDenied, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unitOptions = useMemo(
    () => [
      { id: '', name: t('study.city.filters.allAssemblies') },
      ...(overview?.assemblies ?? []).map((a) => ({ id: a.unitId, name: a.unitName })),
    ],
    [overview, t],
  );
  const unitPick = unitOptions.find((o) => o.id === (unitId ?? '')) ?? unitOptions[0];

  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Chip
            key={s ?? 'ALL'}
            label={s ? t(`study.city.status.${s}`) : t('common.all')}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
      {unitOptions.length > 2 && (
        <SelectField
          label={t('study.city.filters.assembly')}
          options={unitOptions}
          pick={unitPick}
          onChange={(o) => setUnitId(o.id || null)}
        />
      )}

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {rows === null ? (
        !error && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : rows.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="people-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('study.city.noMember')}</Text>
        </Card>
      ) : (
        <>
          <Text style={styles.muted}>{t('study.city.memberCount', { count: rows.length })}</Text>
          {rows.map((m) => (
            <View key={m.userId} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {m.fullName}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[m.unitName, t('study.home.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })].join(' · ')}
                </Text>
                <View style={styles.pillRow}>
                  <Text style={[styles.pill, m.taught ? styles.pillOn : styles.pillOff]}>
                    {t(`study.city.status.${m.taught ? 'TAUGHT' : 'NOT_TAUGHT'}`)}
                  </Text>
                </View>
                {m.missedLessons.length > 0 && (
                  <Text style={styles.missed}>
                    {t('study.city.missed', {
                      lessons: fmtMissed(m.missedLessons, moduleId, overview),
                    })}
                  </Text>
                )}
                {!!m.lastDoneAt && (
                  <Text style={styles.rowMeta}>{t('study.city.lastDone', { date: fmtInstantDay(m.lastDoneAt, t) })}</Text>
                )}
              </View>
              <Text style={styles.score}>
                {m.score != null && m.maxScore != null
                  ? t('study.score', { score: fmtPoints(m.score, language), max: fmtPoints(m.maxScore, language) })
                  : '–'}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/**
 * Leçons manquées d'un membre (§7.5 StudyMissedLesson). Sans filtre d'unité et quand le catalogue en
 * compte plusieurs, chaque numéro est préfixé du code de son unité (« UEMB1 · 3, UEMB2 · 3 »), sinon
 * « 3, 3 » serait ambigu (revue 27/10).
 */
function fmtMissed(
  lessons: StudyMissedLesson[],
  moduleId: string | null,
  overview: StudyLocalityOverview | null,
): string {
  const modules = overview?.modules ?? [];
  const prefixed = !moduleId && (modules.length > 1 || new Set(lessons.map((l) => l.moduleId)).size > 1);
  return lessons
    .map((l) => {
      if (!prefixed) return String(l.number);
      const m = modules.find((x) => x.moduleId === l.moduleId);
      const code = m?.code ?? m?.name;
      return code ? `${code} · ${l.number}` : String(l.number);
    })
    .join(', ');
}

/** Bornes locales d'une période (`YYYY-MM-DD`) ; le serveur les lit en Europe/Paris (§7.6). */
function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  if (p === 'lastYear') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (p === 'last12') {
    const start = new Date(y, now.getMonth() - 11, 1);
    return { from: toLocalDate(start), to: toLocalDate(now) };
  }
  return { from: `${y}-01-01`, to: toLocalDate(now) };
}

function fmtPercent(n: number | null, language: string): string {
  if (n == null) return '–';
  return `${fmtPoints(n, language)} %`;
}

/** « 2026-03 » → « mars 2026 ». */
function monthName(month: string, t: Translate): string {
  const [y, m] = month.split('-').map(Number);
  const names = t('common.monthsLong').split(',');
  return y && m && names[m - 1] ? `${names[m - 1]} ${y}` : month;
}

/** §7.6 — chiffres de la période et évolution mensuelle. */
function StatsTab({
  localityId,
  moduleId,
  onDenied,
}: {
  localityId: string;
  moduleId: string | null;
  onDenied: (d: { canSubscribe: boolean }) => void;
}) {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState<Period>('year');
  const [stats, setStats] = useState<StudyLocalityStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const s = await getStudyLocalityStats(localityId, { ...periodRange(period), moduleId: moduleId ?? undefined });
      if (mine !== seq.current) return;
      setStats(s);
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      const d = studyCityAccessDenied(e);
      if (d) onDenied({ canSubscribe: d.canSubscribe });
      else setError(studyErrorMessage(e, t));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [localityId, period, moduleId, onDenied, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const periods: { key: Period; label: string }[] = [
    { key: 'year', label: t('study.city.stats.periodYear') },
    { key: 'last12', label: t('study.city.stats.periodLast12') },
    { key: 'lastYear', label: t('study.city.stats.periodLastYear') },
  ];
  const maxSessions = Math.max(1, ...(stats?.months ?? []).map((m) => m.sessionCount));

  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        {periods.map((p) => (
          <Chip key={p.key} label={p.label} selected={period === p.key} onPress={() => setPeriod(p.key)} />
        ))}
      </View>

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {loading && !stats ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        stats && (
          <>
            <Text style={styles.muted}>
              {t('study.city.stats.range', { from: fmtIsoDay(stats.from, t), to: fmtIsoDay(stats.to, t) })}
            </Text>
            <View style={styles.kpis}>
              <Kpi
                label={t('study.city.stats.assemblies')}
                value={t('study.city.stats.ofTotal', { value: stats.activeAssemblyCount, total: stats.assemblyCount })}
              />
              <Kpi
                label={t('study.city.stats.taughtMembers')}
                value={t('study.city.stats.ofTotal', { value: stats.taughtMemberCount, total: stats.memberCount })}
              />
              <Kpi label={t('study.city.stats.sessions')} value={String(stats.sessionCount)} />
              <Kpi label={t('study.city.stats.lessonsDone')} value={String(stats.lessonsDoneCount)} />
              <Kpi label={t('study.city.stats.copies')} value={String(stats.copyCount)} />
              <Kpi label={t('study.city.stats.average')} value={fmtPercent(stats.averagePercent, language)} />
            </View>

            <Label style={styles.blockLabel}>{t('study.city.stats.byMonth')}</Label>
            {stats.months.length === 0 ? (
              <Text style={styles.muted}>{t('study.city.stats.noData')}</Text>
            ) : (
              stats.months.map((m) => (
                <View key={m.month} style={styles.monthRow}>
                  <View style={styles.monthHead}>
                    <Text style={styles.monthName}>{monthName(m.month, t)}</Text>
                    <Text style={styles.rowMeta}>{fmtPercent(m.averagePercent, language)}</Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.round((m.sessionCount / maxSessions) * 100)}%` }]} />
                  </View>
                  <Text style={styles.rowMeta}>
                    {[
                      t('study.city.stats.sessionsCount', { count: m.sessionCount }),
                      t('study.city.stats.copiesCount', { count: m.copyCount }),
                      t('study.city.stats.taughtCount', { count: m.taughtMemberCount }),
                    ].join(' · ')}
                  </Text>
                </View>
              ))
            )}
          </>
        )
      )}
    </View>
  );
}

function Kpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, alert && { color: colors.clay }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  // Jusqu'à cinq onglets (Bertoua ×3, Journal, Évènements) : rangée défilante, pas de colonnes égales.
  tabsScroll: { marginTop: 16, flexGrow: 0 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.mossTint,
    gap: 4,
  },
  tab: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radii.sm, alignItems: 'center' },
  tabOn: { backgroundColor: colors.moss },
  tabText: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '500', color: colors.ink2 },
  tabTextOn: { color: colors.white },
  block: { marginTop: 16, gap: 8 },
  blockLabel: { marginTop: 8 },
  assemblyCard: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  cell: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 4,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  cellOn: { backgroundColor: colors.moss, borderColor: colors.mossDeep },
  cellText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3 },
  cellTextOn: { color: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  rowTitle: { flex: 1, fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  pillRow: { flexDirection: 'row', marginTop: 6 },
  pill: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillOn: { color: colors.moss, backgroundColor: colors.mossTint2 },
  pillOff: { color: colors.ink2, backgroundColor: colors.hair },
  missed: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay, marginTop: 4 },
  score: { fontFamily: fonts.mono, fontSize: 13.5, color: colors.moss },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  kpiValue: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
  kpiLabel: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  monthRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    gap: 6,
  },
  periodCard: { paddingHorizontal: 12, paddingVertical: 10 },
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
  alertBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.clay,
    backgroundColor: colors.paper2,
  },
  alertTitle: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '700', color: colors.clay },
  alertNames: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 2, lineHeight: 17 },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthName: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.mossTint2, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.moss },
});
