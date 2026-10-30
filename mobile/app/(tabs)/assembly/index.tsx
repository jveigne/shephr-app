import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import Label from '@/components/Label';
import SelectField from '@/components/SelectField';
import ErrorBanner from '@/components/ErrorBanner';
import CalebAssemblyLock from '@/components/CalebAssemblyLock';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getMyMeetings,
  getMyProgress,
  getProgressOverview,
  getUnitProgress,
  listAssemblyUnits,
  listMeetings,
  listTeachingModules,
  type AssemblyUnit,
  type MeetingSummary,
  type ModuleProgress,
  type MyProgress,
  type TeachingModule,
  type UnitProgress,
} from '@/services/assemblyApi';
import { hierarchyAccessDenied } from '@/services/entitlementsApi';
import { useCalebAssemblyGate } from '@/hooks/useCalebAssemblyGate';
import { fmtIsoDay, formatChapters } from '@/utils/meetingReport';

type Tab = 'meetings' | 'progress';

/**
 * Vie d'assemblée — §6.3 plan 23/09 (lot L5).
 *
 * Réunions de l'assemblée choisie (par année) et avancement des modules d'enseignement.
 * Lecture = public de D-ASM-11 (tri et filtrage faits par le serveur, RG-ASM-05) ; le bouton
 * « Nouveau CR » n'apparaît que si le serveur dit `canWrite` (D-ASM-03 : DIRIGEANT_UNITE de
 * l'assemblée). Pas de react-query côté mobile : useState + useFocusEffect.
 *
 * D-ASM-17 (JP 25/09) : un MEMBRE voit son assemblée en lecture seule — ses présences sur chaque
 * réunion, « Mon avancement » (chapitres lus lors des réunions où il était présent) et les CR des
 * réunions suivies dans une assemblée quittée depuis.
 *
 * D-OFF-02 / D-OFF-04 (JP 27/10, plan `05_Plan_Offres_Caleb_Nehemie.md` §3.2-§3.3) : `/units` renvoie
 * l'assemblée gratuite du compte et, avec l'offre Caleb, les assemblées de sa CHAÎNE de supervision
 * (jamais la géographie). Un 403 `MODULE_ACCESS_DENIED` / `HIERARCHIE_SUIVI` sur une assemblée
 * (droit échu entre-temps) remplace son contenu par le verrou Caleb (`CalebAssemblyLock`) ; une
 * assemblée demandée depuis la Hiérarchie mais absente de `/units` l'affiche aussi.
 *
 * Verrou Caleb D'AVANCE (revue 27/10, recette n°3 / n°4 — `hooks/useCalebAssemblyGate`, comme le
 * web) : les assemblées DIRIGÉES absentes de `/units` sont proposées avec un cadenas (sans Caleb,
 * la seconde d'un dirigeant d'unité, P-02) et ouvrent le verrou sans appeler le serveur ; un
 * manager sans assemblée listée et sans le code `HIERARCHIE_SUIVI` voit le verrou à la place de
 * « Aucune assemblée visible » (sa chaîne en contient).
 */
export default function AssemblyIndexScreen() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('meetings');
  // D-ASM-18 (JP 08/10) : ouverture depuis la Hiérarchie, présélectionnée sur une assemblée.
  // `at` change à chaque appui : la présélection s'applique une fois par ouverture, puis l'on
  // garde le choix fait dans la liste déroulante.
  const params = useLocalSearchParams<{ unitId?: string; at?: string }>();
  const requestedUnit = params.unitId ? `${params.unitId}|${params.at ?? ''}` : null;
  const appliedRequest = useRef<string | null>(null);

  const [units, setUnits] = useState<AssemblyUnit[]>([]);
  const [pickedUnitId, setUnitId] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [progress, setProgress] = useState<UnitProgress | null>(null);
  const [modules, setModules] = useState<TeachingModule[]>([]);
  const [overviewModule, setOverviewModule] = useState<string | null>(null);
  const [overview, setOverview] = useState<UnitProgress[]>([]);
  const [myProgress, setMyProgress] = useState<MyProgress | null>(null);
  const [myMeetings, setMyMeetings] = useState<MeetingSummary[]>([]);
  // D-OFF-02 (JP 27/10) : assemblée dont le serveur a refusé la lecture (403 HIERARCHIE_SUIVI), et
  // assemblée demandée par la Hiérarchie hors de `/units` (sans l'offre Caleb).
  const [lockedUnitId, setLockedUnitId] = useState<string | null>(null);
  const [requestedLocked, setRequestedLocked] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listedIds = useMemo(() => (loading ? null : units.map((u) => u.id)), [loading, units]);
  const caleb = useCalebAssemblyGate(listedIds);
  const lockedLed = caleb.lockedLed;
  // Sélection EFFECTIVE (dérivée, sans effet) : le choix s'il est listé par le serveur ou verrouillé
  // d'avance (D-OFF-02), sinon la première assemblée listée (le serveur trie celles où l'on écrit en
  // tête), à défaut la première assemblée dirigée verrouillée.
  const unitId =
    pickedUnitId &&
    (units.some((u) => u.id === pickedUnitId) || lockedLed.some((a) => a.id === pickedUnitId))
      ? pickedUnitId
      : units[0]?.id ?? lockedLed[0]?.id ?? null;
  const unit = units.find((u) => u.id === unitId) ?? null;
  const unitListed = !!unit;
  const lockedSel = unit ? null : lockedLed.find((a) => a.id === unitId) ?? null;
  const unitOptions = [
    ...units.map((u) => ({
      id: u.id,
      name: u.cityName ? `${u.name} · ${u.cityName}` : u.name,
    })),
    // D-OFF-02 / P-02 (JP 27/10) : assemblée dirigée hors de `/units` — cadenas, verrou Caleb.
    ...lockedLed.map((a) => ({
      id: a.id,
      name: [a.name, a.cityName, t('assemblyLife.lockedUnit')].filter(Boolean).join(' · '),
    })),
  ];
  // Vue d'ensemble réservée à qui voit plusieurs assemblées (dirigeants au-dessus, §6.2/§6.3).
  const showOverview = units.length > 1;
  const isMember = !!unit?.member;
  const unitLocked = (!!unitId && lockedUnitId === unitId) || lockedSel != null;
  const pickUnit = (id: string) => {
    setRequestedLocked(false);
    setUnitId(id);
  };

  const loadUnits = useCallback(async () => {
    const list = await listAssemblyUnits();
    setUnits(list);
    const wanted =
      requestedUnit && appliedRequest.current !== requestedUnit ? requestedUnit.split('|')[0] : null;
    appliedRequest.current = requestedUnit;
    if (wanted) {
      // Hors de `/units` : retenue quand même — si le compte la dirige, elle est proposée avec un
      // cadenas (verrou Caleb) ; sinon la sélection retombe sur la première assemblée listée.
      setRequestedLocked(!list.some((u) => u.id === wanted));
      setUnitId(wanted);
      setTab('meetings');
    }
    return list;
  }, [requestedUnit]);

  const loadUnitData = useCallback(async () => {
    // D-OFF-02 : une assemblée verrouillée d'avance (hors `/units`) n'est pas lue — verrou direct.
    if (!unitId || !unitListed) {
      setMeetings([]);
      setProgress(null);
      return;
    }
    try {
      const [m, p] = await Promise.all([listMeetings(unitId, year), getUnitProgress(unitId)]);
      setMeetings(m);
      setProgress(p);
      setLockedUnitId((cur) => (cur === unitId ? null : cur));
    } catch (e) {
      if (!hierarchyAccessDenied(e)) throw e;
      // Verrou Caleb à la place du contenu, jamais un bandeau d'erreur (D-OFF-02).
      setMeetings([]);
      setProgress(null);
      setLockedUnitId(unitId);
    }
  }, [unitId, unitListed, year]);

  const loadOverview = useCallback(async () => {
    if (!showOverview) {
      setOverview([]);
      return;
    }
    const [mods, ov] = await Promise.all([
      listTeachingModules(),
      getProgressOverview(overviewModule ?? undefined),
    ]);
    setModules(mods);
    setOverview(ov);
  }, [showOverview, overviewModule]);

  const loadMine = useCallback(async () => {
    if (!isMember) {
      setMyProgress(null);
      setMyMeetings([]);
      return;
    }
    const [p, m] = await Promise.all([getMyProgress(), getMyMeetings()]);
    setMyProgress(p);
    setMyMeetings(m);
  }, [isMember]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      await loadUnits();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? t('assemblyLife.loadFailed'));
    }
  }, [loadUnits, t]);

  // Liste des assemblées : au focus (un CR créé ailleurs peut changer l'avancement).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await loadAll();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [loadAll]),
  );

  // Données de l'assemblée choisie : au focus et à chaque changement d'assemblée / d'année.
  useFocusEffect(
    useCallback(() => {
      loadUnitData().catch((e: any) =>
        setError(e?.response?.data?.message ?? t('assemblyLife.loadFailed')),
      );
    }, [loadUnitData, t]),
  );

  useFocusEffect(
    useCallback(() => {
      loadOverview().catch((e: any) =>
        setError(e?.response?.data?.message ?? t('assemblyLife.loadFailed')),
      );
    }, [loadOverview, t]),
  );

  useFocusEffect(
    useCallback(() => {
      loadMine().catch((e: any) =>
        setError(e?.response?.data?.message ?? t('assemblyLife.loadFailed')),
      );
    }, [loadMine, t]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
      await Promise.all([loadUnitData(), loadOverview(), loadMine(), caleb.reload()]);
    } catch {
      // l'erreur est déjà affichée par le bandeau
    } finally {
      setRefreshing(false);
    }
  };

  const openNew = () => {
    if (!unit) return;
    router.push({
      pathname: '/(tabs)/assembly/form',
      params: { unitId: unit.id, unitName: unit.name },
    } as unknown as Href);
  };

  // Journal PDF (JP 08/10) : lecture seule, réservé aux dirigeants — un MEMBRE garde sa vue de
  // ses propres présences (D-ASM-17), sans compilation de l'assemblée.
  const openJournal = () => {
    if (!unit) return;
    router.push({
      pathname: '/(tabs)/assembly/journal',
      params: { unitId: unit.id, unitName: unit.name, cityName: unit.cityName ?? '' },
    } as unknown as Href);
  };

  return (
    <ScreenShell
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.moss} />}
    >
      <Text style={styles.title}>{t('assemblyLife.title')}</Text>
      <Text style={styles.subtitle}>{t('assemblyLife.subtitle')}</Text>

      {!!error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {loading ? (
        <View style={{ marginTop: 50, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : units.length === 0 && lockedLed.length === 0 ? (
        caleb.showChainLock ? (
          // D-OFF-02 (JP 27/10, recette n°4) : un manager sans assemblée gratuite n'a pas « aucune
          // assemblée » — celles de sa chaîne relèvent de l'offre Caleb.
          <CalebAssemblyLock />
        ) : (
          <>
            {/* M-08 (D-FIX, JP 29/10) : l'assemblée demandée par la Hiérarchie hors de `/units` garde
                son verrou Caleb même quand aucune assemblée n'est listée. */}
            {requestedLocked && <CalebAssemblyLock compact />}
            <Card style={styles.emptyCard}>
              <Ionicons name="home-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('assemblyLife.noUnits')}</Text>
            </Card>
          </>
        )
      ) : (
        <>
          {/* Liste déroulante plutôt que des pastilles : un dirigeant de ville/région peut voir
              des dizaines d'assemblées (retour JP 08/10). Le serveur trie déjà les assemblées
              où l'on écrit en tête. */}
          {unitOptions.length > 1 && (
            <SelectField
              label={t('assemblyLife.unitPicker')}
              options={unitOptions}
              pick={unitOptions.find((o) => o.id === unitId) ?? null}
              onChange={(o) => pickUnit(o.id)}
            />
          )}
          {unitOptions.length === 1 && (unit ?? lockedSel) && (
            <Text style={styles.unitName}>
              {(unit ?? lockedSel)!.name}
              {(unit ?? lockedSel)!.cityName ? (
                <Text style={styles.unitCity}> · {(unit ?? lockedSel)!.cityName}</Text>
              ) : null}
            </Text>
          )}

          {/* Assemblée demandée par la Hiérarchie hors de `/units` ; si elle est dirigée par le compte,
              elle est sélectionnée et le verrou plein suffit. */}
          {requestedLocked && !lockedSel && <CalebAssemblyLock compact />}

          {unitLocked ? (
            <CalebAssemblyLock />
          ) : (
            <>
              <View style={styles.tabRow}>
                <Pressable
                  style={[styles.tabBtn, tab === 'meetings' && styles.tabBtnOn]}
                  onPress={() => setTab('meetings')}
                >
                  <Text style={[styles.tabText, tab === 'meetings' && styles.tabTextOn]}>
                    {t('assemblyLife.tabMeetings')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabBtn, tab === 'progress' && styles.tabBtnOn]}
                  onPress={() => setTab('progress')}
                >
                  <Text style={[styles.tabText, tab === 'progress' && styles.tabTextOn]}>
                    {t('assemblyLife.tabProgress')}
                  </Text>
                </Pressable>
              </View>

              {tab === 'meetings' ? (
                <>
                  <MeetingsView
                    meetings={meetings}
                    year={year}
                    setYear={setYear}
                    canWrite={!!unit?.canWrite}
                    isMember={isMember}
                    onNew={openNew}
                    onJournal={openJournal}
                    t={t}
                  />
                  {/* D-ASM-17 : CR des réunions suivies dans une assemblée quittée depuis. */}
                  {isMember && myMeetings.some((m) => m.unitId !== unitId) && (
                    <>
                      <Text style={styles.sectionTitle}>{t('assemblyLife.otherMeetingsTitle')}</Text>
                      <MeetingRows meetings={myMeetings.filter((m) => m.unitId !== unitId)} showUnit t={t} />
                    </>
                  )}
                </>
              ) : (
                <>
                  {isMember && <MyProgressView progress={myProgress} t={t} />}
                  {isMember && <Text style={styles.sectionTitle}>{t('assemblyLife.progress.assemblyTitle')}</Text>}
                  <UnitProgressView progress={progress} t={t} />
                  {showOverview && (
                    <OverviewView
                      overview={overview}
                      modules={modules}
                      moduleId={overviewModule}
                      setModuleId={setOverviewModule}
                      t={t}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </ScreenShell>
  );
}

type T = (k: string, o?: any) => string;

function MeetingsView({
  meetings,
  year,
  setYear,
  canWrite,
  isMember,
  onNew,
  onJournal,
  t,
}: {
  meetings: MeetingSummary[];
  year: number;
  setYear: (y: number) => void;
  canWrite: boolean;
  isMember: boolean;
  onNew: () => void;
  onJournal: () => void;
  t: T;
}) {
  const thisYear = new Date().getFullYear();
  return (
    <>
      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear(year - 1)} hitSlop={8} style={styles.yearBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.ink2} />
        </Pressable>
        <Text style={styles.yearText}>{year}</Text>
        <Pressable
          onPress={() => year < thisYear && setYear(year + 1)}
          disabled={year >= thisYear}
          hitSlop={8}
          style={[styles.yearBtn, year >= thisYear && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
        </Pressable>
      </View>

      {canWrite ? (
        <Pressable style={styles.newBtn} onPress={onNew}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.newBtnText}>{t('assemblyLife.newReport')}</Text>
        </Pressable>
      ) : (
        <Text style={styles.readOnly}>{t(isMember ? 'assemblyLife.memberHint' : 'assemblyLife.readOnly')}</Text>
      )}

      {!isMember && (
        <Pressable style={styles.journalBtn} onPress={onJournal}>
          <Ionicons name="document-text-outline" size={17} color={colors.moss} />
          <Text style={styles.journalBtnText}>{t('assemblyLife.journal.open')}</Text>
        </Pressable>
      )}

      {meetings.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('assemblyLife.noMeetings', { year })}</Text>
        </Card>
      ) : (
        <MeetingRows meetings={meetings} showAttendance={isMember} t={t} />
      )}
    </>
  );
}

/** Lignes de réunions ; `showAttendance` : présence du caller (D-ASM-17), `showUnit` : nom de l'assemblée. */
function MeetingRows({
  meetings,
  showAttendance = false,
  showUnit = false,
  t,
}: {
  meetings: MeetingSummary[];
  showAttendance?: boolean;
  showUnit?: boolean;
  t: T;
}) {
  return (
    <Card style={{ marginTop: 14, paddingVertical: 0 }}>
      {meetings.map((m, i) => (
        <Pressable
          key={m.id}
          onPress={() => router.push(`/(tabs)/assembly/meeting/${m.id}` as Href)}
          style={[styles.row, i < meetings.length - 1 && styles.rowBorder]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle}>
              {fmtIsoDay(m.meetingDate, t)}
              {showUnit && m.unitName ? <Text style={styles.unitCity}> · {m.unitName}</Text> : null}
            </Text>
            <Text style={styles.rowSub} numberOfLines={2}>
              {t('assemblyLife.attendees', { count: m.attendeeCount })}
              {m.breadBreaking ? ` · ${t('assemblyLife.breadBreaking')}` : ''}
              {' · '}
              {m.chapters.length > 0
                ? `${m.bookTitle ?? m.moduleName ?? ''} — ${formatChapters(m.chapters, t)}`
                : t('assemblyLife.noReading')}
            </Text>
          </View>
          {showAttendance && (
            <Text style={[styles.presence, m.attended ? styles.presenceOn : styles.presenceOff]}>
              {t(m.attended ? 'assemblyLife.present' : 'assemblyLife.absent')}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </Pressable>
      ))}
    </Card>
  );
}

/** D-ASM-17 — « Mon avancement » : chapitres lus lors des réunions où le membre était présent. */
function MyProgressView({ progress, t }: { progress: MyProgress | null; t: T }) {
  if (!progress) return null;
  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('assemblyLife.progress.mineTitle')}</Text>
      <Text style={styles.readOnly}>
        {progress.attendedCount === 0
          ? t('assemblyLife.progress.mineEmpty')
          : t('assemblyLife.progress.mineSub', { count: progress.attendedCount })}
      </Text>
      {progress.attendedCount > 0 && progress.modules.length > 0 && (
        <Card style={styles.progressCard}>
          {progress.modules.map((mp) => (
            <ModuleProgressBlock key={mp.moduleId} mp={mp} t={t} />
          ))}
        </Card>
      )}
    </>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${w}%` }]} />
    </View>
  );
}

function ModuleProgressBlock({ mp, t }: { mp: ModuleProgress; t: T }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.modHead}>
        <Text style={styles.modName} numberOfLines={2}>
          {mp.bookTitle || mp.moduleName}
          {!mp.active && <Text style={styles.modInactive}> ({t('assemblyLife.progress.inactive')})</Text>}
        </Text>
        <Text style={styles.modPct}>{mp.percent}%</Text>
      </View>
      <ProgressBar percent={mp.percent} />
      <Text style={styles.modMeta}>
        {t('assemblyLife.progress.readOf', { read: mp.readCount, total: mp.totalCount })}
        {' · '}
        {mp.lastChapterNumber != null && mp.lastReadDate
          ? mp.lastPartNumber != null
            ? t('assemblyLife.progress.lastInPart', {
                part: mp.lastPartNumber,
                n: mp.lastChapterNumber,
                date: fmtIsoDay(mp.lastReadDate, t),
              })
            : t('assemblyLife.progress.last', {
                n: mp.lastChapterNumber,
                date: fmtIsoDay(mp.lastReadDate, t),
              })
          : t('assemblyLife.progress.notStarted')}
      </Text>
    </View>
  );
}

function UnitProgressView({ progress, t }: { progress: UnitProgress | null; t: T }) {
  if (!progress || progress.modules.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Ionicons name="book-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>{t('assemblyLife.progress.noModules')}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.progressCard}>
      {progress.modules.map((mp) => (
        <ModuleProgressBlock key={mp.moduleId} mp={mp} t={t} />
      ))}
    </Card>
  );
}

function OverviewView({
  overview,
  modules,
  moduleId,
  setModuleId,
  t,
}: {
  overview: UnitProgress[];
  modules: TeachingModule[];
  moduleId: string | null;
  setModuleId: (id: string | null) => void;
  t: T;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{t('assemblyLife.progress.overviewTitle')}</Text>
      {modules.length > 1 && (
        <View style={styles.chipWrap}>
          <Chip label={t('common.all')} selected={!moduleId} onPress={() => setModuleId(null)} />
          {modules.map((m) => (
            <Chip
              key={m.id}
              label={m.bookTitle || m.name}
              selected={moduleId === m.id}
              onPress={() => setModuleId(moduleId === m.id ? null : m.id)}
            />
          ))}
        </View>
      )}
      {overview.length === 0 ? (
        <Text style={styles.readOnly}>{t('assemblyLife.progress.overviewEmpty')}</Text>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {overview.map((row) => (
            <Card key={row.unitId} style={styles.ovCard}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {row.unitName}
                {row.cityName ? <Text style={styles.unitCity}> · {row.cityName}</Text> : null}
              </Text>
              <Label style={{ marginTop: 2, fontSize: 10.5 }}>
                {row.lastMeetingDate
                  ? t('assemblyLife.progress.lastMeeting', { date: fmtIsoDay(row.lastMeetingDate, t) })
                  : t('assemblyLife.progress.noMeetingYet')}
              </Label>
              {row.modules.length === 0 ? (
                <Text style={styles.modMeta}>{t('assemblyLife.progress.notStarted')}</Text>
              ) : (
                row.modules.map((mp) => <ModuleProgressBlock key={mp.moduleId} mp={mp} t={t} />)
              )}
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  unitName: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 16 },
  unitCity: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  tabRow: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: colors.mossTint,
    borderRadius: 99,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 99, alignItems: 'center' },
  tabBtnOn: {
    backgroundColor: colors.paper,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.08,
  },
  tabText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink3 },
  tabTextOn: { color: colors.moss },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 16 },
  yearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  yearText: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
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
  journalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairStrong,
    backgroundColor: colors.paper2,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
  },
  journalBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.moss },
  readOnly: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 14, lineHeight: 18 },
  emptyCard: { marginTop: 16, paddingVertical: 30, alignItems: 'center', gap: 10 },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 19,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hair },
  presence: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, overflow: 'hidden' },
  presenceOn: { color: colors.moss, backgroundColor: colors.mossTint2 },
  presenceOff: { color: colors.ink3, backgroundColor: colors.hair },
  rowTitle: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowSub: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  progressCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 16, gap: 18 },
  modHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  modName: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  modInactive: { fontWeight: '400', color: colors.ink3 },
  modPct: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.mossSoft },
  modMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, lineHeight: 16 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.mossTint2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.moss },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 24 },
  ovCard: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
});
