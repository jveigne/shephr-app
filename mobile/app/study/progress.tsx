import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import ErrorBanner from '@/components/ErrorBanner';
import { StudyCopySheet, StudyLanguagePill, studyLanguagesToMark } from '@/components/StudyQuestionList';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getMemberStudyProgress,
  getMyStudyProgress,
  getStudyCopy,
  getStudyUnitProgress,
  studyErrorMessage,
  type StudyCopyDetail,
  type StudyLessonProgress,
  type StudyPersonProgress,
  type StudyUnitProgress,
} from '@/services/assemblyApi';
import { fmtPoints, toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — AVANCEMENT, un écran selon son paramètre :
 * <ul>
 *   <li>`?unitId=` — une assemblée, par unité puis par membre (RG-ETU-17b ; lecteur `canView`,
 *       D-ETU-08 : notes et leçons faites, jamais le contenu des copies) ;</li>
 *   <li>`?mine=1` — *Ma progression* (D-ETU-10) : leçons faites par unité (3 / 5), note de chaque
 *       leçon (la meilleure, D-ETU-18) et note cumulée, toutes assemblées confondues (RG-ETU-17) ;</li>
 *   <li>`?userId=` — la même vue pour un membre, ouverte depuis l'avancement de son assemblée.</li>
 * </ul>
 * `bestCopyId` n'ouvre la copie que pour soi ou pour un dirigeant (`leader`), comme le dit le
 * contrat §4.8 ; le serveur refuse de toute façon les autres (RG-ETU-13).
 */
export default function StudyProgressScreen() {
  const params = useLocalSearchParams<{ unitId?: string; mine?: string; userId?: string; leader?: string; lang?: string }>();
  const unitId = typeof params.unitId === 'string' && params.unitId ? params.unitId : null;
  const userId = typeof params.userId === 'string' && params.userId ? params.userId : null;
  const mine = !unitId && !userId;
  const { t } = useLanguage();
  const { me } = useAuth();
  /**
   * D-ETU-26 / D-ETU-27 (JP 21/10) — langue de référence des pastilles FR / EN : celle de
   * l'assemblée (passée par l'appelant, `StudyUnitProgress` ne la porte pas) ; pour *Ma progression*,
   * celle de l'appelant, comme le serveur choisit la version affichée (contrat §11.4).
   */
  const refLanguage = typeof params.lang === 'string' && params.lang ? params.lang : mine ? me?.language ?? null : null;

  const [unit, setUnit] = useState<StudyUnitProgress | null>(null);
  const [person, setPerson] = useState<StudyPersonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<StudyCopyDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (unitId) setUnit(await getStudyUnitProgress(unitId));
      else setPerson(await (userId ? getMemberStudyProgress(userId) : getMyStudyProgress()));
      setError(null);
    } catch (e: any) {
      setError(studyErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }, [unitId, userId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
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

  // Lien vers la copie : soi, ou dirigeant de l'assemblée (contrat §4.8).
  const canOpenCopy = mine || (!!person && person.userId === me?.id) || params.leader === '1';

  const openCopy = async (l: StudyLessonProgress) => {
    if (!l.bestCopyId || opening) return;
    setOpening(l.chapterId);
    try {
      setCopy(await getStudyCopy(l.bestCopyId));
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
    } finally {
      setOpening(null);
    }
  };

  const title = unitId
    ? (unit?.unitName ?? t('study.progress.unitTitle'))
    : mine
      ? t('study.progress.mineTitle')
      : (person?.fullName ?? t('study.progress.memberTitle'));
  const kicker = unitId ? t('study.progress.unitTitle') : t('study.tile.title');

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
      <Text style={styles.title}>{title}</Text>

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : unitId ? (
        unit && <UnitView unit={unit} refLanguage={refLanguage} />
      ) : (
        person && (
          <PersonView
            person={person}
            refLanguage={refLanguage}
            canOpenCopy={canOpenCopy}
            opening={opening}
            onOpenCopy={openCopy}
          />
        )
      )}

      <StudyCopySheet copy={copy} onClose={() => setCopy(null)} />
    </ScreenShell>
  );
}

function fmtInstantDay(iso: string | null, t: (k: string, o?: any) => string): string {
  return iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '';
}

/** RG-ETU-17b — une assemblée : leçons faites ENSEMBLE, puis chaque membre (D-ETU-08). */
function UnitView({ unit, refLanguage }: { unit: StudyUnitProgress; refLanguage: string | null }) {
  const { t, language } = useLanguage();
  if (unit.modules.length === 0) {
    return (
      <Card variant="paper2" style={styles.empty}>
        <Ionicons name="school-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>{t('study.progress.noModules')}</Text>
      </Card>
    );
  }
  return (
    <>
      {unit.modules.map((m) => (
        <View key={m.moduleId} style={styles.block}>
          <Card style={styles.moduleCard}>
            <Text style={styles.moduleTitle}>{[m.code, m.name].filter(Boolean).join(' · ')}</Text>
            <LanguagePills languages={studyLanguagesToMark(m.languages, refLanguage)} />
            <Text style={styles.moduleStat}>
              {t('study.home.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })}
            </Text>
            <ProgressBar done={m.lessonsDone} total={m.totalLessons} />
            {!!m.lastSessionAt && (
              <Text style={styles.rowMeta}>{t('study.progress.lastSession', { date: fmtInstantDay(m.lastSessionAt, t) })}</Text>
            )}
          </Card>
          <Label style={styles.blockLabel}>{t('study.progress.members')}</Label>
          {m.members.length === 0 ? (
            <Text style={styles.muted}>{t('study.progress.noMembers')}</Text>
          ) : (
            m.members.map((r) => (
              <Pressable
                key={r.userId}
                onPress={() =>
                  router.push({
                    pathname: '/study/progress',
                    params: { userId: r.userId, leader: unit.leader ? '1' : '0', lang: refLanguage ?? '' },
                  })
                }
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.fullName}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t('study.home.lessonsDone', { done: r.lessonsDone, total: m.totalLessons })}
                  </Text>
                </View>
                <Text style={styles.score}>
                  {r.lessonsDone > 0
                    ? t('study.score', { score: fmtPoints(r.score, language), max: fmtPoints(r.maxScore, language) })
                    : '–'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
              </Pressable>
            ))
          )}
        </View>
      ))}
    </>
  );
}

/** D-ETU-10 — progression d'une personne : par unité, leçons faites, meilleure note, cumul. */
function PersonView({
  person,
  refLanguage,
  canOpenCopy,
  opening,
  onOpenCopy,
}: {
  person: StudyPersonProgress;
  refLanguage: string | null;
  canOpenCopy: boolean;
  opening: string | null;
  onOpenCopy: (l: StudyLessonProgress) => void;
}) {
  const { t, language } = useLanguage();
  if (person.modules.length === 0) {
    return (
      <Card variant="paper2" style={styles.empty}>
        <Ionicons name="school-outline" size={26} color={colors.ink3} />
        <Text style={styles.emptyText}>{t('study.progress.noModules')}</Text>
      </Card>
    );
  }
  return (
    <>
      {person.modules.map((m) => (
        <View key={m.moduleId} style={styles.block}>
          <Card style={styles.moduleCard}>
            <Text style={styles.moduleTitle}>{[m.code, m.name].filter(Boolean).join(' · ')}</Text>
            <LanguagePills languages={studyLanguagesToMark(m.languages, refLanguage)} />
            <Text style={styles.moduleStat}>
              {t('study.home.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })}
            </Text>
            <ProgressBar done={m.lessonsDone} total={m.totalLessons} />
            {m.lessonsDone > 0 && (
              <Text style={styles.cumulative}>
                {t('study.progress.cumulative', {
                  score: fmtPoints(m.score, language),
                  max: fmtPoints(m.maxScore, language),
                })}
              </Text>
            )}
          </Card>
          {m.lessons.map((l) => {
            const link = canOpenCopy && !!l.bestCopyId && l.bestSource === 'APP';
            return (
              <Pressable
                key={l.chapterId}
                disabled={!link}
                onPress={() => onOpenCopy(l)}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
              >
                <Ionicons
                  name={l.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={l.done ? colors.moss : colors.ink3}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle} numberOfLines={2}>
                    {l.title
                      ? t('study.lessonTitled', { number: l.number, title: l.title })
                      : t('study.lesson', { number: l.number })}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {l.done
                      ? [fmtInstantDay(l.doneAt, t), l.bestSource === 'PAPIER' ? t('study.results.paper') : null]
                          .filter(Boolean)
                          .join(' · ')
                      : t('study.progress.notDone')}
                  </Text>
                </View>
                {opening === l.chapterId ? (
                  <ActivityIndicator color={colors.moss} />
                ) : (
                  l.done && (
                    <Text style={styles.score}>
                      {t('study.score', { score: fmtPoints(l.bestScore, language), max: fmtPoints(l.maxScore, language) })}
                    </Text>
                  )
                )}
                {link && <Ionicons name="chevron-forward" size={18} color={colors.ink3} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
  );
}

/** D-ETU-27 (JP 21/10) — langues, autres que la référence, où des leçons de l'unité ont été faites. */
function LanguagePills({ languages }: { languages: ReturnType<typeof studyLanguagesToMark> }) {
  if (languages.length === 0) return null;
  return (
    <View style={styles.pills}>
      {languages.map((l) => (
        <StudyLanguagePill key={l} language={l} />
      ))}
    </View>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${pct}%` }]} />
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
  block: { marginTop: 20, gap: 8 },
  blockLabel: { marginTop: 8 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  moduleCard: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  moduleTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, letterSpacing: -0.2 },
  moduleStat: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  cumulative: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink2 },
  pills: { flexDirection: 'row', gap: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.mossTint2, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.moss },
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
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  lessonTitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  score: { fontFamily: fonts.mono, fontSize: 13.5, color: colors.moss },
});
