import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  AppState,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import TeachingBlocks from '@/components/teaching/TeachingBlocks';
import TeachingJoinWall from '@/components/teaching/TeachingJoinWall';
import VideoPlayer, { isVideoPlayerAvailable } from '@/components/teaching/VideoPlayer';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  getTeachingChapter,
  isTeachingRefusal,
  teachingErrorCode,
  type TeachingChapterContent,
} from '@/services/assemblyApi';
import {
  readCachedChapter,
  readPendingProgress,
  readReaderFontSize,
  recordTeachingComplete,
  recordTeachingPosition,
  removeCachedChapter,
  updateCachedChapterProgress,
  writeCachedChapter,
  writeReaderFontSize,
} from '@/services/teachingCache';
import { chapterShortLabel, chapterSummary, chapterTitle, videoMinutes } from '@/utils/teaching';
import { goBack } from '@/utils/navigation';

/** Tailles du texte de la liseuse (A− / A+) ; la maquette lit à 16. */
const FONT_SIZES = [14, 16, 18, 20, 23];
const DEFAULT_FONT_SIZE = 16;
/** Contrat §5.5 : au plus un envoi toutes les 10 s pendant la lecture, plus à la sortie de l'écran. */
const SEND_EVERY_MS = 10_000;
/** Texte déjà gardé sur l'appareil : au-delà de ce délai sans réponse du réseau, on l'affiche. */
const CACHE_AFTER_MS = 2_500;

/**
 * Un chapitre — D-FIN-13 (JP 06/11), D-FIN-07 pour la liseuse, maquette Enseignement, écrans 3 à 5. Un écran, trois temps :
 * <ul>
 *   <li>l'OUVERTURE : titre, résumé (celui du chapitre, sinon son premier paragraphe), « Lire · N min » et, si une vidéo est
 *       publiée, « Regarder la vidéo · N min » ;</li>
 *   <li>la LECTURE : texte continu, versets en carte, taille mémorisée sur l'appareil, reprise à la position enregistrée. La
 *       position est un INDEX de bloc (contrat §5.4), ce qui tient sur un autre appareil et à une autre taille de texte ;</li>
 *   <li>la FIN, au bout du texte (« un état, avec une carte ») : vidéo si le chapitre en a une, « J'ai terminé », annulable,
 *       « Chapitre suivant ». Ordre libre (D-FIN-01) : aucun chapitre n'est bloqué par un autre.</li>
 * </ul>
 * Hors ligne (lot FIN, JP 06/11) : le dernier texte lu reste lisible, la position et « J'ai terminé » attendent le réseau
 * (`services/teachingCache`), une panne ou une session expirée n'efface rien. Sans vidéo publiée : ni bouton ni lecteur.
 * `?resume=1` (carte « Reprendre », bouton du parcours) ouvre directement la lecture.
 */
export default function TeachingChapterScreen() {
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const chapterId = typeof id === 'string' ? id : '';
  // « Chapitre suivant » remplace l'écran : un chapitre = un état neuf.
  return <ChapterContent key={chapterId} chapterId={chapterId} resume={resume === '1'} />;
}

type Status = 'loading' | 'ready' | 'comingSoon' | 'join' | 'gone' | 'error';

function ChapterContent({ chapterId, resume }: { chapterId: string; resume: boolean }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { me, token } = useAuth();
  const userId = me?.id ?? null;
  const attached = isAttachedAccount(me);

  const [chapter, setChapter] = useState<TeachingChapterContent | null>(null);
  const [status, setStatus] = useState<Status>(attached ? 'loading' : 'join');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [mode, setMode] = useState<'opening' | 'reading'>('opening');
  const [watching, setWatching] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [percent, setPercent] = useState(0);

  /** Position à la dernière lecture : ce qui attend encore le réseau passe avant la copie du serveur. */
  const savedPosition = useRef<number | null>(null);
  /** Bloc en haut de l'écran : la position de lecture. */
  const position = useRef(0);
  const lastSent = useRef<number | null>(null);
  const reading = useRef(false);
  const completedRef = useRef(false);
  const scroller = useRef<ScrollView>(null);
  /** Place de chaque bloc dans son conteneur. */
  const blockLayouts = useRef<({ top: number; height: number } | undefined)[]>([]);
  /** Haut du texte dans le défilement (sous le titre) ; null tant qu'il n'est pas mesuré. */
  const blocksTop = useRef<number | null>(null);
  /** Bloc à rétablir après une mise en page (reprise, changement de taille) ; null = l'utilisateur mène. */
  const restoreTo = useRef<number | null>(null);
  const resumed = useRef(false);

  // ─── Chargement ──────────────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!attached || !userId || !chapterId) return;
    const pending = (await readPendingProgress(userId))[chapterId];
    const cached = await readCachedChapter(userId, chapterId);

    const show = (next: TeachingChapterContent, fromCache: boolean) => {
      savedPosition.current = pending?.position ?? next.progress?.position ?? 0;
      const done = pending?.complete ?? !!next.progress?.completedAt;
      completedRef.current = done;
      setCompleted(done);
      setChapter(next);
      setOfflineCopy(fromCache);
      setStatus('ready');
    };

    // Réseau lent : le texte gardé s'affiche sans attendre, la réponse le remplace si elle arrive avant l'entrée en lecture.
    let answered = false;
    const timer = cached
      ? setTimeout(() => {
          if (!answered) show(cached, true);
        }, CACHE_AFTER_MS)
      : null;

    try {
      const fresh = await getTeachingChapter(chapterId);
      answered = true;
      if (timer) clearTimeout(timer);
      void writeCachedChapter(userId, fresh);
      if (!reading.current) show(fresh, false);
      else setOfflineCopy(false); // déjà en lecture sur le texte gardé : on ne déplace pas le lecteur
    } catch (e) {
      answered = true;
      if (timer) clearTimeout(timer);
      const code = teachingErrorCode(e);
      if (!isTeachingRefusal(e)) {
        // Lot FIN (JP 06/11) : une panne ou une session expirée n'efface rien.
        if (cached) show(cached, true);
        else setStatus((cur) => (cur === 'ready' ? cur : 'error'));
      } else if (code === 'TEACHING_JOIN_REQUIRED') {
        setStatus('join');
      } else {
        // Refus du serveur (chapitre retiré ou à venir, D-FIN-14) : le texte gardé ne doit plus se relire.
        void removeCachedChapter(userId, chapterId);
        setStatus(code === 'TEACHING_CHAPTER_UNAVAILABLE' ? 'comingSoon' : 'gone');
      }
    }
  }, [attached, userId, chapterId]);

  useEffect(() => {
    void load();
    void readReaderFontSize().then((size) => {
      if (size != null && FONT_SIZES.includes(size)) setFontSize(size);
    });
  }, [load]);

  // ─── Position de lecture ─────────────────────────────────────────────────────────────────────

  /** Contrat §5.5 : envoi différé. Écrit d'abord sur l'appareil (`teachingCache`), une panne ne perd rien. */
  const sendPosition = useCallback(() => {
    if (!userId || !reading.current || restoreTo.current != null) return;
    if (position.current === lastSent.current) return;
    lastSent.current = position.current;
    void recordTeachingPosition(userId, token, chapterId, position.current);
  }, [userId, token, chapterId]);

  /** À la sortie : la position part, et la copie gardée la retient pour une relecture hors ligne. */
  const leave = useCallback(() => {
    sendPosition();
    if (userId && lastSent.current != null) {
      void updateCachedChapterProgress(userId, chapterId, {
        position: lastSent.current,
        completed: completedRef.current,
      });
    }
  }, [sendPosition, userId, chapterId]);

  useEffect(() => {
    if (mode !== 'reading') return;
    const timer = setInterval(sendPosition, SEND_EVERY_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') leave();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [mode, sendPosition, leave]);

  useFocusEffect(
    useCallback(() => {
      return () => leave();
    }, [leave]),
  );

  /** L'ouverture s'enregistre par `PUT …/progress` (contrat §5.4) : c'est elle qui fait de ce chapitre « en cours ». */
  const recordOpening = useCallback(
    (at: number) => {
      if (!userId) return;
      lastSent.current = at;
      void recordTeachingPosition(userId, token, chapterId, at);
    },
    [userId, token, chapterId],
  );

  const startReading = useCallback(() => {
    if (!chapter) return;
    const last = Math.max(0, chapter.blocks.length - 1);
    const at = Math.min(Math.max(0, savedPosition.current ?? 0), last);
    position.current = at;
    restoreTo.current = at > 0 ? at : null;
    reading.current = true;
    recordOpening(at);
    setWatching(false);
    setMode('reading');
  }, [chapter, recordOpening]);

  const startWatching = () => {
    const at = Math.max(0, savedPosition.current ?? 0);
    position.current = at;
    recordOpening(at);
    setWatching(true);
  };

  // « Reprendre » (accueil, parcours) : directement la lecture, une seule fois.
  useEffect(() => {
    if (!resume || status !== 'ready' || !chapter || resumed.current) return;
    resumed.current = true;
    startReading();
  }, [resume, status, chapter, startReading]);

  /** Attend la mesure du texte ET du bloc visé : rien ne se rétablit sur une mise en page périmée. */
  const applyRestore = useCallback(() => {
    const target = restoreTo.current;
    if (target == null || blocksTop.current == null || !blockLayouts.current[target]) return;
    requestAnimationFrame(() => {
      const layout = blockLayouts.current[target];
      if (restoreTo.current !== target || !layout || blocksTop.current == null) return;
      scroller.current?.scrollTo({ y: Math.max(0, blocksTop.current + layout.top - 12), animated: false });
      restoreTo.current = null;
    });
  }, []);

  const onBlockLayout = useCallback(
    (index: number, top: number, height: number) => {
      blockLayouts.current[index] = { top, height };
      if (restoreTo.current === index) applyRestore();
    },
    [applyRestore],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (restoreTo.current != null) return;
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const top = blocksTop.current ?? 0;
    const inBlocks = contentOffset.y - top;
    const layouts = blockLayouts.current;
    let index = 0;
    while (index < layouts.length - 1) {
      const layout = layouts[index];
      if (layout && layout.top + layout.height > inBlocks + 16) break;
      index += 1;
    }
    position.current = index;
    const last = layouts[layouts.length - 1];
    const end = last ? top + last.top + last.height - layoutMeasurement.height : 0;
    const next = end > 0 ? Math.min(100, Math.max(0, Math.round((contentOffset.y / end) * 100))) : 100;
    setPercent((cur) => (cur === next ? cur : next));
  };

  const changeFontSize = (delta: number) => {
    const index = FONT_SIZES.indexOf(fontSize) + delta;
    const next = FONT_SIZES[index];
    if (next == null) return;
    // Le bloc en haut de l'écran reste en haut de l'écran après la nouvelle mise en page.
    restoreTo.current = position.current > 0 ? position.current : null;
    if (restoreTo.current != null) blockLayouts.current[restoreTo.current] = undefined; // sa place va changer
    setFontSize(next);
    void writeReaderFontSize(next);
  };

  // ─── « J'ai terminé » ────────────────────────────────────────────────────────────────────────

  const setDone = (done: boolean) => {
    if (!userId) return;
    completedRef.current = done;
    setCompleted(done);
    sendPosition();
    void recordTeachingComplete(userId, token, chapterId, done);
    void updateCachedChapterProgress(userId, chapterId, {
      position: lastSent.current ?? position.current,
      completed: done,
    });
  };

  // ─── Rendu ───────────────────────────────────────────────────────────────────────────────────

  if (status !== 'ready' || !chapter) {
    return (
      <ScreenShell withTabBar={false}>
        <BackButton />
        {status === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        ) : status === 'join' ? (
          <TeachingJoinWall />
        ) : status === 'comingSoon' ? (
          <Text style={styles.empty}>{t('teaching.errors.chapterUnavailable')}</Text>
        ) : status === 'gone' ? (
          <Text style={styles.empty}>{t('teaching.errors.notFound')}</Text>
        ) : (
          <ErrorBanner
            message={t('teaching.errors.offline')}
            onRetry={() => {
              setStatus('loading');
              void load();
            }}
          />
        )}
      </ScreenShell>
    );
  }

  const title = chapterTitle(chapter, t);
  const videoCount = videoMinutes(chapter.video?.durationSeconds);
  const canPlay = !!chapter.video && isVideoPlayerAvailable();

  const end = <ChapterEnd chapter={chapter} completed={completed} playing={watching} onDone={setDone} />;

  if (mode === 'opening') {
    const part = chapter.partNumber != null && chapter.partNumber > 0 ? chapter.partNumber : null;
    const eyebrow =
      chapter.number === 0
        ? t('teaching.course.introduction')
        : part != null
          ? t('teaching.chapter.eyebrow', { number: chapter.number, part })
          : t('teaching.chapter.short', { number: chapter.number });
    return (
      <ScreenShell withTabBar={false}>
        <BackButton />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.openingTitle}>{title}</Text>
        {offlineCopy && <Text style={styles.offline}>{t('teaching.reader.offlineCopy')}</Text>}
        <Text style={styles.summary}>{chapterSummary(chapter.summary, chapter.blocks)}</Text>
        {watching && !!chapter.video ? (
          <View style={{ marginTop: 18 }}>
            <VideoPlayer video={chapter.video} label={watchLabel(t, videoCount)} autoStart />
          </View>
        ) : null}
        <Button
          label={t('teaching.chapter.read', { count: chapter.readingMinutes })}
          height={48}
          style={{ marginTop: 18 }}
          onPress={startReading}
        />
        {!watching && canPlay && (
          <Button
            label={watchLabel(t, videoCount)}
            variant="soft"
            height={48}
            style={{ marginTop: 10 }}
            onPress={startWatching}
          />
        )}
        {/* Binaire d'avant `expo-video` : ni lecteur ni bouton, et on le dit. */}
        {!!chapter.video && !canPlay && <Text style={styles.note}>{t('teaching.video.updateRequired')}</Text>}
        {watching && end}
      </ScreenShell>
    );
  }

  return (
    <View style={[styles.reader, { paddingTop: insets.top + 8 }]}>
      <View style={styles.readerBar}>
        <BackButton />
        <Text style={styles.readerLabel} numberOfLines={1}>
          {chapterShortLabel(chapter.number, t)}
        </Text>
        <Pressable
          onPress={() => changeFontSize(-1)}
          disabled={fontSize === FONT_SIZES[0]}
          accessibilityRole="button"
          accessibilityLabel={t('teaching.reader.decreaseLabel')}
          style={[styles.fontButton, fontSize === FONT_SIZES[0] && styles.fontButtonOff]}
        >
          <Text style={styles.fontSmall}>{t('teaching.reader.decrease')}</Text>
        </Pressable>
        <Pressable
          onPress={() => changeFontSize(1)}
          disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
          accessibilityRole="button"
          accessibilityLabel={t('teaching.reader.increaseLabel')}
          style={[styles.fontButton, fontSize === FONT_SIZES[FONT_SIZES.length - 1] && styles.fontButtonOff]}
        >
          <Text style={styles.fontLarge}>{t('teaching.reader.increase')}</Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      {offlineCopy && <Text style={styles.offlineBar}>{t('teaching.reader.offlineCopy')}</Text>}
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={120}
        onContentSizeChange={applyRestore}
        onScrollBeginDrag={() => {
          // Le doigt reprend la main : plus rien à rétablir.
          restoreTo.current = null;
        }}
        contentContainerStyle={[styles.readerContent, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.readerTitle}>{title}</Text>
        <View
          onLayout={(e) => {
            blocksTop.current = e.nativeEvent.layout.y;
            applyRestore();
          }}
        >
          <TeachingBlocks blocks={chapter.blocks} fontSize={fontSize} onBlockLayout={onBlockLayout} />
        </View>
        {end}
      </ScrollView>
    </View>
  );
}

function watchLabel(t: (key: string, options?: any) => string, minutes: number | null): string {
  return minutes != null ? t('teaching.chapter.watch', { count: minutes }) : t('teaching.chapter.watchShort');
}

function BackButton() {
  const { t } = useLanguage();
  return (
    <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')} style={styles.back}>
      <Ionicons name="chevron-back" size={22} color={colors.ink2} />
    </Pressable>
  );
}

/**
 * Fin du chapitre (maquette Enseignement, écran 5) : un état, sans nouveau texte à écrire. `playing` : la vidéo joue déjà au-dessus
 * (arrivée par « Regarder la vidéo »), on ne la propose pas deux fois.
 */
function ChapterEnd({
  chapter,
  completed,
  playing,
  onDone,
}: {
  chapter: TeachingChapterContent;
  completed: boolean;
  playing: boolean;
  onDone: (done: boolean) => void;
}) {
  const { t } = useLanguage();
  const minutes = videoMinutes(chapter.video?.durationSeconds);
  const next = chapter.followingChapterId;
  return (
    <View style={styles.end}>
      <Text style={styles.endTitle}>
        {chapter.number === 0 ? t('teaching.end.doneIntro') : t('teaching.end.done', { number: chapter.number })}
      </Text>

      {!!chapter.video && !playing && isVideoPlayerAvailable() && (
        <VideoPlayer
          video={chapter.video}
          label={minutes != null ? t('teaching.end.replay', { count: minutes }) : t('teaching.end.replayShort')}
        />
      )}
      {!!chapter.video && !isVideoPlayerAvailable() && <Text style={styles.note}>{t('teaching.video.updateRequired')}</Text>}

      {completed ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.moss} />
          <Text style={styles.doneText}>{t('teaching.end.completed')}</Text>
          <Pressable onPress={() => onDone(false)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.undo}>{t('teaching.end.undo')}</Text>
          </Pressable>
        </View>
      ) : (
        <Button label={t('teaching.end.complete')} height={48} onPress={() => onDone(true)} />
      )}

      <Pressable
        onPress={() =>
          next
            ? router.replace({ pathname: '/teaching/chapter/[id]', params: { id: next } })
            : router.replace({ pathname: '/teaching/course/[id]', params: { id: chapter.moduleId } })
        }
        accessibilityRole="link"
        style={styles.nextLink}
      >
        <Text style={styles.nextText}>{next ? t('teaching.end.next') : t('teaching.end.backToCourse')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  loading: { marginTop: 40, alignItems: 'center' },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 28 },
  eyebrow: {
    marginTop: 12,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink2,
    textTransform: 'uppercase',
  },
  openingTitle: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 32, color: colors.ink, marginTop: 8 },
  summary: { fontFamily: fonts.sans, fontSize: 15.5, lineHeight: 24, color: colors.ink, marginTop: 14 },
  note: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18, marginTop: 10 },
  offline: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay, marginTop: 8 },
  reader: { flex: 1, backgroundColor: colors.parchment },
  readerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  readerLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  fontButton: {
    width: 44,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  fontButtonOff: { opacity: 0.4 },
  fontSmall: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink },
  fontLarge: { fontFamily: fonts.sans, fontSize: 16, color: colors.ink },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.hair,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
    overflow: 'hidden',
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.moss },
  offlineBar: { fontFamily: fonts.sans, fontSize: 12, color: colors.clay, marginHorizontal: 20, marginTop: 6 },
  readerContent: { paddingHorizontal: 20, paddingTop: 16 },
  readerTitle: { fontFamily: fonts.serif, fontSize: 25, lineHeight: 30, color: colors.ink, marginBottom: 14 },
  end: {
    marginTop: 28,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
    gap: 14,
  },
  endTitle: { fontFamily: fonts.serif, fontSize: 25, color: colors.ink },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
  },
  doneText: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.moss },
  undo: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, textDecorationLine: 'underline' },
  nextLink: { alignItems: 'center', paddingVertical: 10 },
  nextText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.moss },
});
