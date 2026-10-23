import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import { StudyLanguagePill, studyLanguagesToMark } from '@/components/StudyQuestionList';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  finishStudySession,
  getStudyCatalog,
  getStudyMe,
  getStudyProgressOverview,
  listStudySessions,
  openStudySession,
  studyErrorCode,
  studyErrorMessage,
  type StudyAssembly,
  type StudyAssemblyOverview,
  type StudyLesson,
  type StudySessionSummary,
  type StudyUnitForAssembly,
} from '@/services/assemblyApi';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — ACCUEIL de la tuile « Le Message de Bertoua ».
 *
 * <p>D-ETU-28 (JP 23/10, remplace D-ETU-05) : atteint depuis l'accueil si le ministère a le module
 * `STUDY` et que le compte est rattaché (`isAttachedAccount`). Le contenu suit le rôle, tel que le dit `GET /study/me` :
 * <ul>
 *   <li>DIRIGEANT de l'assemblée (`leader`, D-ETU-07) — séance en cours (*Reprendre*) ou
 *       *Commencer* : unité → leçon, leçons faites cochées, unité verrouillée si son prérequis
 *       n'est pas fini dans l'assemblée (D-ETU-19) ; une séance oubliée qui bloque l'ouverture est
 *       proposée à *Terminer* (D-ETU-22) ; séances passées (→ résultats) et avancement ;</li>
 *   <li>RÉPONDANT (`participant`, D-ETU-06) — séance en cours (*Répondre* / *Corriger*) ou « Aucune
 *       étude en cours » ; *Ma progression* (D-ETU-10) ;</li>
 *   <li>sans assemblée (niveaux au-dessus, LEADER, SECRETARIAT) — avancement des assemblées du
 *       périmètre (`/study/progress`, D-ETU-08), jamais le contenu des copies.</li>
 * </ul>
 * Pas de react-query : useState + useFocusEffect.
 */
export default function StudyHomeScreen() {
  const { t } = useLanguage();
  const { me, hasStudy } = useAuth();
  const active = hasStudy && isAttachedAccount(me);

  const [assemblies, setAssemblies] = useState<StudyAssembly[]>([]);
  const [catalogs, setCatalogs] = useState<Record<string, StudyUnitForAssembly[]>>({});
  const [sessions, setSessions] = useState<Record<string, StudySessionSummary[]>>({});
  const [overview, setOverview] = useState<StudyAssemblyOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) {
      setLoading(false);
      return;
    }
    try {
      const { assemblies: list } = await getStudyMe();
      setAssemblies(list);
      const led = list.filter((a) => a.leader);
      const [cats, sess] = await Promise.all([
        Promise.all(led.map((a) => getStudyCatalog(a.unitId))),
        Promise.all(led.map((a) => listStudySessions(a.unitId))),
      ]);
      setCatalogs(Object.fromEntries(led.map((a, i) => [a.unitId, cats[i]])));
      setSessions(Object.fromEntries(led.map((a, i) => [a.unitId, sess[i]])));
      setOverview(list.length === 0 ? await getStudyProgressOverview() : []);
      setError(null);
    } catch (e: any) {
      setError(studyErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }, [active, t]);

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

  const openSession = (id: string) => router.push({ pathname: '/study/session/[id]', params: { id } });

  /** *Commencer* (D-ETU-07) ; sur STUDY_SESSION_ALREADY_OPEN, propose de *Terminer* l'oubliée (D-ETU-22). */
  const onStart = async (unitId: string, lesson: StudyLesson) => {
    if (opening) return;
    const lessonLabel = lesson.title
      ? t('study.lessonTitled', { number: lesson.number, title: lesson.title })
      : t('study.lesson', { number: lesson.number });
    const ok = await confirmDialog(t('study.home.startTitle'), t('study.home.startConfirm', { lesson: lessonLabel }), t('study.home.start'));
    if (!ok) return;
    setOpening(lesson.chapterId);
    try {
      const created = await openStudySession(unitId, lesson.chapterId);
      openSession(created.session.id);
    } catch (e: any) {
      if (studyErrorCode(e) !== 'STUDY_SESSION_ALREADY_OPEN') {
        notify(t('study.tile.title'), studyErrorMessage(e, t));
        return;
      }
      try {
        // Contrat §4.3 : relire `/study/me` pour retrouver la séance qui bloque.
        const fresh = await getStudyMe();
        setAssemblies(fresh.assemblies);
        const current = fresh.assemblies.find((a) => a.unitId === unitId)?.currentSession;
        if (!current) {
          notify(t('study.tile.title'), studyErrorMessage(e, t));
          return;
        }
        const forgotten = current.lessonTitle
          ? t('study.lessonTitled', { number: current.lessonNumber, title: current.lessonTitle })
          : t('study.lesson', { number: current.lessonNumber });
        const finish = await confirmDialog(
          t('study.home.forgottenTitle'),
          t('study.home.forgottenBody', { lesson: forgotten }),
          t('study.home.finishAndStart'),
        );
        if (!finish) return;
        await finishStudySession(current.id);
        const created = await openStudySession(unitId, lesson.chapterId);
        openSession(created.session.id);
      } catch (e2: any) {
        notify(t('study.tile.title'), studyErrorMessage(e2, t));
        void load();
      }
    } finally {
      setOpening(null);
    }
  };

  const anyParticipant = assemblies.some((a) => a.participant);

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={
        active ? <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>{t('study.kicker')}</Text>
      <Text style={styles.title}>{t('study.tile.title')}</Text>

      {!active ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>
            {hasStudy ? t('study.home.joinRequired') : t('study.home.moduleUnavailable')}
          </Text>
          {hasStudy && (
            <Text style={styles.link} onPress={() => router.push('/(auth)/join')}>
              {t('study.home.join')}
            </Text>
          )}
        </Card>
      ) : loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        <>
          {!!error && <ErrorBanner message={error} onRetry={load} />}

          {assemblies.map((a) => (
            <AssemblySection
              key={a.unitId}
              assembly={a}
              showName={assemblies.length > 1}
              catalog={catalogs[a.unitId] ?? []}
              sessions={sessions[a.unitId] ?? []}
              opening={opening}
              onOpenSession={openSession}
              onStart={(lesson) => void onStart(a.unitId, lesson)}
            />
          ))}

          {anyParticipant && (
            <Button
              label={t('study.home.myProgress')}
              variant="ghost"
              fullWidth
              height={48}
              style={{ marginTop: 20 }}
              iconLeft={<Ionicons name="trending-up-outline" size={18} color={colors.moss} />}
              onPress={() => router.push({ pathname: '/study/progress', params: { mine: '1' } })}
            />
          )}

          {assemblies.length === 0 && !error && <Overview rows={overview} />}
        </>
      )}
    </ScreenShell>
  );
}

function lessonLabelOf(t: (k: string, o?: any) => string, number: number, title: string | null) {
  return title ? t('study.lessonTitled', { number, title }) : t('study.lesson', { number });
}

function fmtInstantDay(iso: string | null, t: (k: string, o?: any) => string): string {
  return iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '';
}

function AssemblySection({
  assembly,
  showName,
  catalog,
  sessions,
  opening,
  onOpenSession,
  onStart,
}: {
  assembly: StudyAssembly;
  showName: boolean;
  catalog: StudyUnitForAssembly[];
  sessions: StudySessionSummary[];
  opening: string | null;
  onOpenSession: (id: string) => void;
  onStart: (lesson: StudyLesson) => void;
}) {
  const { t } = useLanguage();
  const [unitOpen, setUnitOpen] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState(false);
  const current = assembly.currentSession;
  const past = sessions.filter((s) => s.status === 'TERMINEE');
  const shownPast = allSessions ? past : past.slice(0, 5);

  const action = !current
    ? null
    : assembly.leader
      ? t('study.home.resume')
      : current.status === 'CORRECTION'
        ? t('study.home.correct')
        : t('study.home.answer');

  return (
    <View style={styles.section}>
      {(showName || assembly.leader) && <Label style={styles.sectionLabel}>{assembly.unitName}</Label>}

      {current ? (
        <Card style={styles.currentCard} onPress={() => onOpenSession(current.id)}>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t(`study.status.${current.status}`)}</Text>
          </View>
          <Text style={styles.currentTitle}>{lessonLabelOf(t, current.lessonNumber, current.lessonTitle)}</Text>
          <Text style={styles.currentSub}>{[current.moduleCode, current.moduleName].filter(Boolean).join(' · ')}</Text>
          {current.moduleLanguage && current.moduleLanguage !== assembly.language && (
            <View style={{ marginTop: 6 }}>
              <StudyLanguagePill language={current.moduleLanguage} />
            </View>
          )}
          <View style={styles.currentCta}>
            <Text style={styles.currentCtaText}>{action}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </View>
        </Card>
      ) : !assembly.leader ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="book-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyTitle}>{t('study.home.noCurrent')}</Text>
          <Text style={styles.emptyText}>{t('study.home.noCurrentHint')}</Text>
        </Card>
      ) : null}

      {assembly.leader && (
        <>
          <Label style={styles.blockLabel}>{current ? t('study.home.startOther') : t('study.home.startSession')}</Label>
          {catalog.length === 0 ? (
            <Text style={styles.muted}>{t('study.home.noCatalog')}</Text>
          ) : (
            catalog.map((u) => {
              const open = unitOpen === u.unit.moduleId;
              const done = u.unit.lessons.filter((l) => u.doneChapterIds.includes(l.chapterId)).length;
              return (
                <View key={u.unit.moduleId} style={styles.unitBlock}>
                  <Pressable
                    onPress={() => setUnitOpen(open ? null : u.unit.moduleId)}
                    style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                  >
                    <View style={[styles.rowIcon, u.locked && styles.rowIconLocked]}>
                      <Ionicons name={u.locked ? 'lock-closed-outline' : 'school-outline'} size={19} color={u.locked ? colors.ink3 : colors.moss} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {[u.unit.code, u.unit.name].filter(Boolean).join(' · ')}
                      </Text>
                      {/* D-ETU-26 (JP 21/10) : version de l'autre langue, proposée faute de mieux — jamais bloquée. */}
                      {u.unit.language && u.unit.language !== assembly.language && (
                        <View style={styles.pillRow}>
                          <StudyLanguagePill language={u.unit.language} />
                        </View>
                      )}
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {u.locked
                          ? t('study.home.locked')
                          : t('study.home.lessonsDone', { done, total: u.unit.lessons.length })}
                      </Text>
                    </View>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink3} />
                  </Pressable>
                  {open && (
                    <View style={styles.lessons}>
                      {!!u.unit.bookTitle && <Text style={styles.book}>{u.unit.bookTitle}</Text>}
                      {u.unit.lessons.map((l) => {
                        const isDone = u.doneChapterIds.includes(l.chapterId);
                        return (
                          <Pressable
                            key={l.chapterId}
                            disabled={u.locked || !!opening}
                            onPress={() => onStart(l)}
                            style={({ pressed }) => [
                              styles.lessonRow,
                              { opacity: u.locked ? 0.5 : pressed ? 0.85 : 1 },
                            ]}
                          >
                            <Ionicons
                              name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={isDone ? colors.moss : colors.ink3}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lessonTitle}>{lessonLabelOf(t, l.number, l.title)}</Text>
                              {!!l.portion && <Text style={styles.rowMeta}>{l.portion}</Text>}
                            </View>
                            {opening === l.chapterId ? (
                              <ActivityIndicator color={colors.moss} />
                            ) : (
                              <Text style={styles.lessonAction}>{isDone ? t('study.home.redo') : t('study.home.start')}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Label style={styles.blockLabel}>{t('study.home.sessions')}</Label>
          {past.length === 0 ? (
            <Text style={styles.muted}>{t('study.home.noSessions')}</Text>
          ) : (
            <>
              {shownPast.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: '/study/results/[id]', params: { id: s.id } })}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>
                        {lessonLabelOf(t, s.lessonNumber, s.lessonTitle)}
                      </Text>
                      {s.moduleLanguage && s.moduleLanguage !== assembly.language && (
                        <StudyLanguagePill language={s.moduleLanguage} />
                      )}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[s.moduleCode, fmtInstantDay(s.finishedAt ?? s.openedAt, t), t('study.home.copies', { count: s.copyCount })]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
                </Pressable>
              ))}
              {past.length > shownPast.length && (
                <Text style={styles.link} onPress={() => setAllSessions(true)}>
                  {t('study.home.allSessions', { count: past.length })}
                </Text>
              )}
            </>
          )}

          <Button
            label={t('study.home.unitProgress')}
            variant="soft"
            fullWidth
            height={46}
            style={{ marginTop: 14 }}
            onPress={() =>
              router.push({ pathname: '/study/progress', params: { unitId: assembly.unitId, lang: assembly.language } })
            }
          />
        </>
      )}
    </View>
  );
}

/** D-ETU-08 — vue d'ensemble des assemblées du périmètre (géographie), sans contenu de copie. */
function Overview({ rows }: { rows: StudyAssemblyOverview[] }) {
  const { t } = useLanguage();
  return (
    <View style={styles.section}>
      <Label style={styles.blockLabel}>{t('study.home.overviewTitle')}</Label>
      {rows.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="map-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('study.home.overviewEmpty')}</Text>
        </Card>
      ) : (
        rows.map((r) => (
          <Pressable
            key={r.unitId}
            onPress={() => router.push({ pathname: '/study/progress', params: { unitId: r.unitId } })}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {r.cityName ? `${r.unitName} · ${r.cityName}` : r.unitName}
              </Text>
              {r.modules.map((m) => (
                <View key={m.moduleId} style={styles.titleRow}>
                  <Text style={[styles.rowMeta, { flexShrink: 1 }]} numberOfLines={1}>
                    {[m.code ?? m.name, t('study.home.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })].join(' · ')}
                  </Text>
                  {/* D-ETU-27 : la vue d'ensemble ne porte pas la langue de l'assemblée — on ne
                      marque que les unités faites dans plusieurs langues. */}
                  {studyLanguagesToMark(m.languages, null).map((l) => (
                    <StudyLanguagePill key={l} language={l} />
                  ))}
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
          </Pressable>
        ))
      )}
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
  section: { marginTop: 20, gap: 8 },
  sectionLabel: { color: colors.mossSoft },
  blockLabel: { marginTop: 14 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  empty: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  link: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.moss, marginTop: 4 },
  currentCard: { backgroundColor: colors.moss, paddingHorizontal: 18, paddingVertical: 16 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.earth },
  liveText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.parchment,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentTitle: { marginTop: 8, fontFamily: fonts.serif, fontSize: 21, color: colors.white, letterSpacing: -0.2 },
  currentSub: { marginTop: 2, fontFamily: fonts.sans, fontSize: 12.5, color: colors.parchment },
  currentCta: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  currentCtaText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.white },
  unitBlock: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  rowIconLocked: { backgroundColor: colors.paper2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, letterSpacing: -0.1 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillRow: { flexDirection: 'row', marginTop: 4 },
  lessons: { marginLeft: 12, gap: 6 },
  book: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13.5, color: colors.ink2 },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  lessonTitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  lessonAction: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
});
