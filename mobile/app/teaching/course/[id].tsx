import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Button from '@/components/Button';
import Card from '@/components/Card';
import CalebAssemblyLock from '@/components/CalebAssemblyLock';
import ErrorBanner from '@/components/ErrorBanner';
import TeachingJoinWall from '@/components/teaching/TeachingJoinWall';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getTeachingCourse,
  getTeachingLeaderSummary,
  isTeachingRefusal,
  teachingErrorCode,
  type TeachingChapterSummary,
  type TeachingCourseDetail,
  type TeachingLeaderSummary,
} from '@/services/assemblyApi';
import {
  applyPendingToCourse,
  flushTeachingProgress,
  readCachedCourse,
  readPendingProgress,
  removeCachedCourse,
  writeCachedCourse,
} from '@/services/teachingCache';
import { chapterShortLabel, chapterTitle, videoMinutes } from '@/utils/teaching';
import { goBack } from '@/utils/navigation';

/** Attente maximale du vidage de la file avant de relire le parcours. */
const FLUSH_WAIT_MS = 2_000;

/**
 * Parcours d'un enseignement — D-FIN-13 / D-FIN-14 (JP 06/11), maquette Enseignement, écran 2 : l'introduction et les
 * chapitres par partie, aucun bloqué. Un chapitre sans contenu reste à sa place, « Contenu à venir », et ne s'ouvre pas.
 * Partie et chapitre numéro 0 : ni en-tête ni « Chapitre 0 » (contrat §3.3). Totaux et chapitre à reprendre : le serveur.
 *
 * <p>D-FIN-03 (JP 06/11) : « Voir l'avancement de mes membres » n'apparaît que si le serveur dit `leaderBlock`, avec le
 * résumé gratuit (totaux, aucun nom, P-FIN-1). Sans Caleb, le lien ouvre le verrou existant, jamais un toast : texte neutre,
 * aucun prix, bouton ni champ de code (D-OFF-09). Avec Caleb, il mène au suivi de la « Vie de mon leadership ».
 *
 * <p>Hors ligne (lot FIN, JP 06/11) : le dernier parcours connu reste ouvert, une panne n'efface rien.
 * Pas de react-query : useState + useFocusEffect.
 */
export default function TeachingCourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = typeof id === 'string' ? id : '';
  const { t } = useLanguage();
  const { me, token } = useAuth();
  const userId = me?.id ?? null;

  const [course, setCourse] = useState<TeachingCourseDetail | null>(null);
  const [summary, setSummary] = useState<TeachingLeaderSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'join' | 'gone' | 'error'>('loading');
  const [offline, setOffline] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !courseId) return;
    // Réseau lent : le dernier parcours connu s'affiche sans attendre, la réponse le remplace.
    const known = await readCachedCourse(userId, courseId);
    if (known) {
      const shown = applyPendingToCourse(known, await readPendingProgress(userId));
      setCourse((cur) => cur ?? shown);
      setStatus((cur) => (cur === 'loading' ? 'ready' : cur));
    }
    // D'abord ce qui attend le réseau : le parcours relu doit voir la position et « J'ai terminé » du chapitre quitté.
    // Borné : un réseau qui traîne ne retient pas l'écran, la file repartira d'elle-même.
    await Promise.race([
      flushTeachingProgress(userId, token),
      new Promise((resolve) => setTimeout(resolve, FLUSH_WAIT_MS)),
    ]);
    try {
      const fresh = await getTeachingCourse(courseId);
      void writeCachedCourse(userId, fresh);
      setCourse(applyPendingToCourse(fresh, await readPendingProgress(userId)));
      setStatus('ready');
      setOffline(false);
      setSummary(fresh.leaderBlock ? await getTeachingLeaderSummary(courseId).catch(() => null) : null);
    } catch (e) {
      if (!isTeachingRefusal(e)) {
        // Lot FIN (JP 06/11) : une panne ou une session expirée n'efface rien ; sans copie, seule une erreur à réessayer.
        setStatus((cur) => (cur === 'ready' ? cur : 'error'));
        setOffline(true);
      } else if (teachingErrorCode(e) === 'TEACHING_JOIN_REQUIRED') {
        setStatus('join');
      } else {
        void removeCachedCourse(userId, courseId);
        setStatus('gone');
      }
    }
  }, [userId, token, courseId]);

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

  const sections = useMemo(() => {
    if (!course) return [];
    const byOrder = (a: TeachingChapterSummary, b: TeachingChapterSummary) => a.orderIndex - b.orderIndex;
    if (course.parts.length === 0) return [{ key: 'all', header: null, chapters: [...course.chapters].sort(byOrder) }];
    return [...course.parts]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((part) => ({
        key: part.id,
        header:
          part.number === 0
            ? null
            : part.title
              ? t('teaching.course.part', { number: part.number, title: part.title })
              : t('teaching.course.partShort', { number: part.number }),
        chapters: course.chapters.filter((c) => c.partId === part.id).sort(byOrder),
      }));
  }, [course, t]);

  const next = course?.chapters.find((c) => c.id === course.nextChapterId) ?? null;
  const started = !!course?.lastActivityAt;

  const openChapter = (chapterId: string, resume: boolean) =>
    router.push({ pathname: '/teaching/chapter/[id]', params: { id: chapterId, ...(resume ? { resume: '1' } : {}) } });

  const seeProgress = () => {
    // Serveur indisponible : la page de suivi tranche elle-même, son 403 y ramène le verrou.
    if (!summary || summary.canSeeDetails) router.push('/hierarchie/vie');
    else setShowLock(true);
  };

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>

      {status === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : status === 'join' ? (
        <TeachingJoinWall />
      ) : status === 'gone' ? (
        <Text style={styles.empty}>{t('teaching.errors.notFound')}</Text>
      ) : status === 'error' || !course ? (
        <ErrorBanner message={t('teaching.errors.offline')} onRetry={load} />
      ) : (
        <>
          {!!course.author && <Text style={styles.author}>{course.author}</Text>}
          <Text style={styles.title}>{course.name}</Text>
          {/* Contrat §5.3 et parité D-WEB-01 (JP 06/11) : la présentation saisie au back-office, comme sur le web. */}
          {!!course.description && <Text style={styles.description}>{course.description}</Text>}
          {course.totalCount > 0 && (
            <Text style={styles.progress}>
              {t('teaching.course.progress', { completed: course.completedCount, total: course.totalCount })}
            </Text>
          )}
          {offline && <Text style={styles.offline}>{t('teaching.reader.offlineCopy')}</Text>}
          {/* Plan FIN §5.4 (JP 06/11) : le membre sait que ses dirigeants peuvent voir son avancement. */}
          <Text style={styles.note}>{t('teaching.course.visibilityNote')}</Text>

          {!!next && (
            <Button
              label={
                !started
                  ? t('teaching.hub.start')
                  : next.number === 0
                    ? t('teaching.hub.resumeIntro')
                    : t('teaching.hub.resume', { number: next.number })
              }
              height={48}
              style={{ marginTop: 14 }}
              onPress={() => openChapter(next.id, started)}
            />
          )}

          {course.leaderBlock && (
            <>
              <Card style={styles.leader} onPress={seeProgress}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.leaderTitle}>{t('teaching.leader.seeProgress')}</Text>
                  {!!summary && summary.memberCount > 0 && (
                    <Text style={styles.leaderSummary}>
                      {t('teaching.leader.summary', { count: summary.startedCount, members: summary.memberCount })}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
              {showLock && <CalebAssemblyLock compact body={t('teaching.lock.calebBody')} />}
            </>
          )}

          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              {!!section.header && <Text style={styles.partHeader}>{section.header}</Text>}
              {section.chapters.map((c) => (
                <ChapterRow
                  key={c.id}
                  chapter={c}
                  current={c.id === course.nextChapterId && started}
                  onPress={() => openChapter(c.id, false)}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </ScreenShell>
  );
}

function ChapterRow({
  chapter,
  current,
  onPress,
}: {
  chapter: TeachingChapterSummary;
  current: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const done = !!chapter.progress?.completedAt;
  const minutes = videoMinutes(chapter.video?.durationSeconds);
  const meta = !chapter.available
    ? t('teaching.course.comingSoon')
    : [
        chapter.readingMinutes != null ? t('teaching.course.minutes', { count: chapter.readingMinutes }) : null,
        minutes != null ? t('teaching.course.videoMinutes', { count: minutes }) : null,
      ]
        .filter(Boolean)
        .join(' · ');
  const mark = done ? '✓' : chapter.number === 0 ? '·' : String(chapter.number);
  const label = chapterTitle(chapter, t);
  return (
    <Pressable
      onPress={chapter.available ? onPress : undefined}
      disabled={!chapter.available}
      accessibilityRole="button"
      accessibilityState={{ disabled: !chapter.available }}
      accessibilityLabel={`${chapterShortLabel(chapter.number, t)} · ${label} · ${meta}`}
      style={[styles.row, current && styles.rowCurrent]}
    >
      <View style={[styles.mark, done && styles.markDone, current && !done && styles.markCurrent]}>
        <Text style={[styles.markText, (done || current) && styles.markTextOn]}>{mark}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, !chapter.available && styles.rowTitleOff]}>{label}</Text>
        {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  loading: { marginTop: 40, alignItems: 'center' },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 28 },
  author: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 10 },
  title: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 32, color: colors.ink, marginTop: 4 },
  description: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.ink2, marginTop: 6 },
  progress: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2, marginTop: 6 },
  offline: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay, marginTop: 6 },
  section: { marginTop: 14, gap: 6 },
  partHeader: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.mossDeep, marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowCurrent: { backgroundColor: colors.paper, borderColor: colors.earthDeep },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint2,
  },
  markDone: { backgroundColor: colors.moss },
  markCurrent: { backgroundColor: colors.earthDeep },
  markText: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink },
  markTextOn: { color: colors.paper2 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 18, color: colors.ink },
  rowTitleOff: { color: colors.ink3 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2, marginTop: 2 },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 6, lineHeight: 17 },
  leader: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
  },
  leaderTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
  leaderSummary: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 2 },
});
