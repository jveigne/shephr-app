import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { TeachingBlocks } from '../components/TeachingBlocks';
import { TeachingVideoPlayer } from '../components/TeachingVideoPlayer';
import { useAuth } from '../hooks/useAuth';
import {
  completeTeachingChapter,
  getTeachingChapter,
  uncompleteTeachingChapter,
  type TeachingChapterContent,
  type TeachingMyProgress,
} from '../services/assemblyApi';
import { useTeachingBase } from '../utils/teachingAccess';
import {
  FONT_STEPS,
  chapterSummary,
  readFontStep,
  resolveInitialPosition,
  useTeachingProgressSync,
  videoMinutes,
  writeFontStep,
} from '../utils/teachingProgress';
import { ProgressBar, errCode, errMsg } from './Assembly';
import { TeachingJoinWall } from './Teaching';

// ---------------------------------------------------------------------------------------------
//  Un chapitre — D-FIN-07 / D-FIN-13 / D-FIN-16 (JP 06/11, contrat §5.4 à §5.7, §11.2, maquette
//  Enseignement écrans 3, 4, 5). Routes `/teaching/chapter/:id` et `/my-teaching/chapter/:id`.
//  - Ouverture : résumé du livre, « Lire · N min », « Regarder la vidéo · N min ».
//  - Lecture : texte continu, taille réglable et mémorisée, reprise automatique sur tout appareil
//    (position = index du bloc, envoi différé, `utils/teachingProgress`).
//  - Fin : vidéo si le chapitre en a une, « J'ai terminé » (annulable), « Chapitre suivant » ; au bout du
//    texte, et sous le lecteur après « Regarder la vidéo » (comme le mobile).
//  Chapitre sans contenu : 404 `TEACHING_CHAPTER_UNAVAILABLE`, « Contenu à venir » (D-FIN-14). Chapitre
//  sans vidéo publiée : ni bouton ni lecteur. Numéro 0 : titre seul, sans « Chapitre 0 » (§3.3).
// ---------------------------------------------------------------------------------------------

type Phase = 'open' | 'read' | 'watch';
const BIG_BUTTON = { justifyContent: 'center', padding: '13px 16px', fontSize: 15, width: '100%' } as const;
type TFn = ReturnType<typeof useTranslation>['t'];

function chapterName(c: TeachingChapterContent, t: TFn): string {
  if (c.title) return c.title;
  return c.number === 0 ? t('teaching.course.introduction') : t('teaching.course.chapterFallback', { number: c.number });
}

/** En-tête « CHAPITRE 1 · PARTIE 1 » ; rien pour l'introduction (§3.3). */
function eyebrowOf(c: TeachingChapterContent, t: TFn): string | null {
  if (c.number === 0) return null;
  return c.partNumber ? t('teaching.chapter.eyebrow', { number: c.number, part: c.partNumber }) : t('teaching.chapter.eyebrowNoPart', { number: c.number });
}

function watchLabel(minutes: number | null, t: TFn): string {
  return minutes == null ? t('teaching.chapter.watchNoDuration') : t('teaching.chapter.watch', { count: minutes });
}

function replayLabel(minutes: number | null, t: TFn): string {
  return minutes == null ? t('teaching.end.replayNoDuration') : t('teaching.end.replay', { count: minutes });
}

export function TeachingChapterPage() {
  const { id } = useParams();
  // `key` : un chapitre suivant repart de son ouverture, avec sa propre position.
  return <ChapterScreen key={id} id={id!} />;
}

function ChapterScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const base = useTeachingBase();
  const q = useQuery({
    queryKey: ['teaching', 'chapter', id],
    queryFn: () => getTeachingChapter(id),
    retry: false,
    // Reprise sur tout appareil : position toujours relue à l'ouverture, jamais servie d'un cache.
    gcTime: 0,
  });

  if (q.data) return <ChapterLoaded chapter={q.data} base={base} />;

  const code = errCode(q.error);
  let body;
  if (q.isLoading) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (code === 'TEACHING_JOIN_REQUIRED') {
    body = <TeachingJoinWall />;
  } else if (code === 'TEACHING_CHAPTER_UNAVAILABLE') {
    // D-FIN-14 : un lien gardé vers un chapitre dont le contenu a été retiré.
    body = (
      <div className="card" style={{ padding: 24, maxWidth: 520 }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--green-800)' }}>{t('teaching.course.comingSoon')}</p>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-700)' }}>{t('teaching.errors.chapterUnavailable')}</p>
        <Link to={base} style={{ display: 'inline-block', marginTop: 14, color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5 }}>{t('nav.teaching')}</Link>
      </div>
    );
  } else {
    body = <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(q.error, t('common.error'))}</p>;
  }
  return (
    <>
      <TopBar title={t('nav.teaching')} crumbs={[t('common.brand'), <Link key="t" to={base} style={{ color: 'inherit' }}>{t('nav.teaching')}</Link>]} />
      <div className="content">{body}</div>
    </>
  );
}

function ChapterLoaded({ chapter, base }: { chapter: TeachingChapterContent; base: string }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('open');
  const [fontStep, setFontStep] = useState(readFontStep);
  const [initialPosition] = useState(() => resolveInitialPosition(me?.id, chapter));
  const [position, setPosition] = useState(initialPosition);
  const articleRef = useRef<HTMLDivElement>(null);

  const courseKey = ['teaching', 'course', chapter.moduleId];
  const refreshCourse = () => {
    void qc.invalidateQueries({ queryKey: courseKey });
    void qc.invalidateQueries({ queryKey: ['teaching', 'courses'] });
  };
  const { report, current } = useTeachingProgressSync(me?.id, chapter.id, initialPosition, refreshCourse);

  const setProgress = (progress: TeachingMyProgress | null) =>
    qc.setQueryData<TeachingChapterContent>(['teaching', 'chapter', chapter.id], (prev) => (prev ? { ...prev, progress } : prev));
  const onWriteError = (err: unknown) => {
    const code = errCode(err);
    push({ kind: 'error', title: code === 'TEACHING_CHAPTER_UNAVAILABLE' ? t('teaching.errors.chapterUnavailable') : errMsg(err, t('common.error')) });
  };
  const completeM = useMutation({
    mutationFn: () => completeTeachingChapter(chapter.id),
    onSuccess: (p) => {
      setProgress(p);
      refreshCourse();
    },
    onError: onWriteError,
  });
  const undoM = useMutation({
    mutationFn: () => uncompleteTeachingChapter(chapter.id),
    onSuccess: () => {
      if (chapter.progress) setProgress({ ...chapter.progress, completedAt: null });
      refreshCourse();
    },
    onError: onWriteError,
  });

  const fontSize = FONT_STEPS[fontStep];
  const changeFont = (delta: number) => {
    const next = Math.max(0, Math.min(FONT_STEPS.length - 1, fontStep + delta));
    setFontStep(next);
    writeFontStep(next);
  };

  // Reprise : à l'entrée en lecture, et après un changement de taille (le bloc lu reste en haut).
  useLayoutEffect(() => {
    if (phase !== 'read') {
      window.scrollTo(0, 0);
      return;
    }
    const at = current();
    if (at <= 0) {
      window.scrollTo(0, 0);
      return;
    }
    articleRef.current?.querySelector(`[data-block-index="${at}"]`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` lit une ref stable
  }, [phase, fontSize]);

  // Position = premier bloc présent dans la bande haute de l'écran. La page défile sur `window`.
  useEffect(() => {
    if (phase !== 'read' || !articleRef.current) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const index = Number((e.target as HTMLElement).dataset.blockIndex);
          if (e.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        if (visible.size === 0) return;
        const next = Math.min(...visible);
        report(next);
        setPosition(next);
      },
      { rootMargin: '-120px 0px -70% 0px' },
    );
    articleRef.current.querySelectorAll('[data-block-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [phase, report, chapter.blocks.length]);

  const name = chapterName(chapter, t);
  const summary = chapterSummary(chapter.summary, chapter.blocks);
  const minutes = videoMinutes(chapter.video);
  const eyebrow = eyebrowOf(chapter, t);
  const courseHref = `${base}/course/${chapter.moduleId}`;
  const crumbs = [
    t('common.brand'),
    <Link key="t" to={base} style={{ color: 'inherit' }}>{t('nav.teaching')}</Link>,
    <Link key="c" to={courseHref} style={{ color: 'inherit' }}>{chapter.moduleName}</Link>,
  ];
  const completed = !!chapter.progress?.completedAt;
  const busy = completeM.isPending || undoM.isPending;
  const end = (playing: boolean) => (
    <ChapterEnd
      chapter={chapter}
      minutes={minutes}
      playing={playing}
      completed={completed}
      busy={busy}
      courseHref={courseHref}
      nextHref={chapter.followingChapterId ? `${base}/chapter/${chapter.followingChapterId}` : null}
      onComplete={() => completeM.mutate()}
      onUndo={() => undoM.mutate()}
    />
  );

  if (phase === 'open' || phase === 'watch') {
    return (
      <>
        <TopBar title={chapter.moduleName} crumbs={crumbs} />
        <div className="content">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
            {eyebrow && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-500)', textTransform: 'uppercase' }}>{eyebrow}</div>}
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 27, lineHeight: '32px', color: 'var(--green-900)' }}>{name}</h2>
            {phase === 'watch' && chapter.video ? (
              <TeachingVideoPlayer videoId={chapter.video.id} title={chapter.video.title} posterUrl={chapter.video.posterUrl} />
            ) : (
              summary && <p style={{ margin: 0, fontSize: 15.5, lineHeight: '24px', color: 'var(--ink-900)', whiteSpace: 'pre-wrap' }}>{summary}</p>
            )}
            <Button variant="primary" style={{ ...BIG_BUTTON, marginTop: 8 }} onClick={() => setPhase('read')}>
              {initialPosition > 0 ? t('teaching.chapter.resumeReading') : t('teaching.chapter.read', { count: chapter.readingMinutes })}
            </Button>
            {/* D-FIN-16 : un chapitre sans vidéo publiée n'a ni bouton ni lecteur. */}
            {chapter.video && phase === 'open' && (
              <Button style={BIG_BUTTON} iconL={<Icon name="play" size={14} />} onClick={() => setPhase('watch')}>
                {watchLabel(minutes, t)}
              </Button>
            )}
            {/* D-FIN-07 (JP 06/11, parité mobile) : qui regarde la vidéo termine ici, sans passer par tout le texte. */}
            {phase === 'watch' && end(true)}
            {/* Dernier chapitre en vidéo : la carte de fin porte déjà « Retour au parcours ». */}
            {(phase === 'open' || chapter.followingChapterId) && (
              <Link to={courseHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5, marginTop: 4 }}>
                <Icon name="chevLeft" size={14} />
                {t('teaching.end.backToCourse')}
              </Link>
            )}
          </div>
        </div>
      </>
    );
  }

  const last = chapter.blocks.length - 1;
  const percent = last <= 0 ? 100 : (100 * position) / last;
  const readerBtn = { width: 44, height: 36, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--ivory)', color: 'var(--ink-900)', cursor: 'pointer' } as const;

  return (
    <>
      <div className="teaching-reader-bar">
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: 'var(--ink-500)' }}>
            <button
              type="button"
              onClick={() => setPhase('open')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', minWidth: 0 }}
            >
              <Icon name="chevLeft" size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chapter.number === 0 ? name : t('teaching.chapter.eyebrowNoPart', { number: chapter.number })}
              </span>
            </button>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" aria-label={t('teaching.reader.decreaseLabel')} disabled={fontStep === 0} style={{ ...readerBtn, fontSize: 13, opacity: fontStep === 0 ? 0.45 : 1 }} onClick={() => changeFont(-1)}>
                {t('teaching.reader.decrease')}
              </button>
              <button type="button" aria-label={t('teaching.reader.increaseLabel')} disabled={fontStep === FONT_STEPS.length - 1} style={{ ...readerBtn, fontSize: 16, opacity: fontStep === FONT_STEPS.length - 1 ? 0.45 : 1 }} onClick={() => changeFont(1)}>
                {t('teaching.reader.increase')}
              </button>
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <ProgressBar percent={percent} height={5} />
          </div>
        </div>
      </div>
      <div className="content">
        <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(18px, 4vw, 30px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 25, lineHeight: 1.25, color: 'var(--green-900)' }}>{name}</h2>
          <div ref={articleRef}>
            <TeachingBlocks blocks={chapter.blocks} fontSize={fontSize} />
          </div>
          {end(false)}
        </div>
      </div>
    </>
  );
}

/**
 * Fin du chapitre : un état, avec sa carte (D-FIN-07, JP 06/11). Aucun nouveau texte à écrire. Au bout du texte, et sous
 * le lecteur pour qui a choisi « Regarder la vidéo » ; `playing` : la vidéo joue déjà au-dessus, on ne la propose pas deux fois.
 */
function ChapterEnd({
  chapter,
  minutes,
  playing,
  completed,
  busy,
  courseHref,
  nextHref,
  onComplete,
  onUndo,
}: {
  chapter: TeachingChapterContent;
  minutes: number | null;
  playing: boolean;
  completed: boolean;
  busy: boolean;
  courseHref: string;
  nextHref: string | null;
  onComplete: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const [videoOpen, setVideoOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 25, color: 'var(--green-900)' }}>
        {chapter.number === 0 ? t('teaching.end.doneIntro') : t('teaching.end.done', { number: chapter.number })}
      </div>
      {chapter.video && !playing &&
        (videoOpen ? (
          <TeachingVideoPlayer videoId={chapter.video.id} title={chapter.video.title} posterUrl={chapter.video.posterUrl} />
        ) : (
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            style={{ border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--green-800)', color: 'var(--ivory)', font: 'inherit' }}
          >
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 190 }}>
              {chapter.video.posterUrl && (
                <img src={chapter.video.posterUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <span style={{ position: 'relative', width: 54, height: 54, borderRadius: 27, background: 'var(--ivory)', color: 'var(--green-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" size={22} />
              </span>
            </span>
            <span style={{ display: 'block', padding: '10px 14px 12px', fontSize: 13.5, background: 'var(--green-900)' }}>{replayLabel(minutes, t)}</span>
          </button>
        ))}
      {completed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontWeight: 600, fontSize: 14.5 }}>
            <Icon name="check" size={16} />
            {t('teaching.end.completed')}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>{t('teaching.end.undo')}</Button>
        </div>
      ) : (
        <Button variant="primary" style={BIG_BUTTON} disabled={busy} onClick={onComplete}>{t('teaching.end.complete')}</Button>
      )}
      {nextHref ? (
        <Link to={nextHref} style={{ display: 'block', textAlign: 'center', padding: 10, fontSize: 14.5, fontWeight: 600, color: 'var(--green-800)' }}>
          {t('teaching.end.next')}
        </Link>
      ) : (
        <Link to={courseHref} style={{ display: 'block', textAlign: 'center', padding: 10, fontSize: 14.5, fontWeight: 600, color: 'var(--green-800)' }}>
          {t('teaching.end.backToCourse')}
        </Link>
      )}
    </div>
  );
}
