import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import TeachingJoinWall from '@/components/teaching/TeachingJoinWall';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTeachingHub } from '@/hooks/useTeachingHub';
import type { TeachingCourseSummary } from '@/services/assemblyApi';
import { goBack } from '@/utils/navigation';

/**
 * Tuile « Enseignement » — D-FIN-12 (JP 06/11), maquette Enseignement, écran 1 : tout ce qui s'apprend, au même endroit.
 * Enseignements, Le Message de Bertoua (écrans inchangés, pastille « En cours » conservée) et Documents (déplacé ici depuis
 * l'accueil). L'accueil ouvre directement l'entrée quand il n'y en a qu'une : cet écran ne sert qu'à partir de deux.
 * Le livre se vend hors de l'app (D-FIN-04) : aucun prix, achat ni lien de vente.
 */
export default function TeachingHubScreen() {
  const { t } = useLanguage();
  const hub = useTeachingHub();
  const [refreshing, setRefreshing] = useState(false);
  const [first, ...others] = hub.courses;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await hub.reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.title}>{t('teaching.tile.title')}</Text>

      {!hub.attached ? (
        <TeachingJoinWall />
      ) : hub.pending && hub.entryCount === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : hub.entryCount === 0 ? (
        <Text style={styles.empty}>{t('teaching.hub.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {!!first && <CourseCard course={first} primary />}
          {hub.study && (
            <Entry
              title={t('study.tile.title')}
              hint={t('study.tile.hint')}
              badge={hub.studyLive ? t('study.tile.live') : undefined}
              onPress={() => router.push('/study')}
            />
          )}
          {others.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
          {hub.documents && (
            <Entry
              title={t('dashboard.tiles.documents')}
              hint={t('dashboard.tiles.documentsHint')}
              onPress={() => router.push('/documents')}
            />
          )}
        </View>
      )}
    </ScreenShell>
  );
}

function openCourse(id: string) {
  router.push({ pathname: '/teaching/course/[id]', params: { id } });
}

/** Le parcours principal est la grande carte de la maquette ; les enseignements ponctuels, des lignes. */
function CourseCard({ course, primary }: { course: TeachingCourseSummary; primary?: boolean }) {
  const { t } = useLanguage();
  const progress = t('teaching.course.progress', { completed: course.completedCount, total: course.totalCount });
  const state =
    course.nextChapterId == null
      ? t('teaching.hub.finished')
      : !course.lastActivityAt
        ? t('teaching.hub.start')
        : course.nextChapterNumber === 0
          ? t('teaching.hub.resumeIntro')
          : t('teaching.hub.resume', { number: course.nextChapterNumber });
  if (!primary) {
    return (
      <Entry
        title={course.name}
        hint={[course.author, `${state} · ${progress}`].filter(Boolean).join(' · ')}
        onPress={() => openCourse(course.id)}
      />
    );
  }
  const ratio = course.totalCount > 0 ? course.completedCount / course.totalCount : 0;
  return (
    <Pressable onPress={() => openCourse(course.id)} accessibilityRole="button" style={styles.primary}>
      {!!course.author && <Text style={styles.primaryAuthor}>{course.author}</Text>}
      <Text style={styles.primaryTitle}>{course.name}</Text>
      <Text style={styles.primaryState}>{`${state} · ${progress}`}</Text>
      <View style={styles.primaryTrack}>
        <View style={[styles.primaryFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

function Entry({
  title,
  hint,
  badge,
  onPress,
}: {
  title: string;
  hint: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.entry}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.entryTitle}>{title}</Text>
        <Text style={styles.entryHint}>{hint}</Text>
      </View>
      {!!badge && <Text style={styles.badge}>{badge}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  loading: { marginTop: 40, alignItems: 'center' },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 28 },
  list: { marginTop: 18, gap: 12 },
  primary: { backgroundColor: colors.mossSoft, borderRadius: radii.lg, padding: 18 },
  primaryAuthor: { fontFamily: fonts.sans, fontSize: 12, color: colors.white },
  primaryTitle: { fontFamily: fonts.serif, fontSize: 23, lineHeight: 28, color: colors.white, marginTop: 5 },
  primaryState: { fontFamily: fonts.sans, fontSize: 13, color: colors.white, marginTop: 8 },
  primaryTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(242,233,210,0.25)', marginTop: 10, overflow: 'hidden' },
  primaryFill: { height: 5, borderRadius: 3, backgroundColor: colors.white },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  entryTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  entryHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 3 },
  badge: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.mossDeep,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.parchment,
    overflow: 'hidden',
  },
});
