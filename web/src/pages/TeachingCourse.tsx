import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { HierarchyLockedCompact } from '../components/LockedFeature';
import {
  getTeachingCourse,
  getTeachingLeaderSummary,
  type TeachingChapterSummary,
  type TeachingCourseDetail,
  type TeachingPartView,
} from '../services/assemblyApi';
import { useTeachingBase } from '../utils/teachingAccess';
import { videoMinutes } from '../utils/teachingProgress';
import { ProgressBar, errCode, errMsg } from './Assembly';
import { TeachingJoinWall } from './Teaching';

// ---------------------------------------------------------------------------------------------
//  Parcours d'un enseignement — D-FIN-13 / D-FIN-14 (JP 06/11, contrat §5.3, §11.2, maquette
//  Enseignement écran 2). Routes `/teaching/course/:id` et `/my-teaching/course/:id`. L'introduction
//  et les chapitres par partie, ordre libre, aucun bloqué ; un chapitre sans contenu reste dans la
//  liste, « Contenu à venir », et ne s'ouvre pas. Partie numéro 0 : aucun en-tête ; chapitre numéro 0 :
//  titre seul (§3.3). Disponibilité, totaux et chapitre à reprendre viennent du serveur.
//  Dirigeant : résumé gratuit, totaux seuls, sans nom (P-FIN-1) ; « Voir l'avancement de mes membres »
//  mène au suivi Caleb, sinon au verrou (D-FIN-03 : pas d'assemblée gratuite pour ce suivi).
// ---------------------------------------------------------------------------------------------

/** Lien `/teaching/:id` : le parcours du cours (routes du cadrage du lot, §11 du plan). */
export function TeachingCourseRedirect() {
  const { id } = useParams();
  const base = useTeachingBase();
  return <Navigate to={`${base}/course/${id}`} replace />;
}

type TFn = ReturnType<typeof useTranslation>['t'];

function chapterTitle(c: TeachingChapterSummary, t: TFn): string {
  if (c.title) return c.title;
  return c.number === 0 ? t('teaching.course.introduction') : t('teaching.course.chapterFallback', { number: c.number });
}

function ChapterMeta({ chapter, t }: { chapter: TeachingChapterSummary; t: TFn }) {
  if (!chapter.available) return <>{t('teaching.course.comingSoon')}</>;
  const parts: string[] = [];
  if (chapter.readingMinutes != null) parts.push(t('teaching.course.minutes', { count: chapter.readingMinutes }));
  if (chapter.video) {
    const min = videoMinutes(chapter.video);
    parts.push(min == null ? t('teaching.course.video') : t('teaching.course.videoMinutes', { count: min }));
  }
  return <>{parts.join(' · ')}</>;
}

function ChapterRow({ chapter, base, current }: { chapter: TeachingChapterSummary; base: string; current: boolean }) {
  const { t } = useTranslation();
  const done = !!chapter.progress?.completedAt;
  const mark = done ? <Icon name="check" size={14} /> : chapter.number === 0 ? '·' : chapter.number;
  const dotBg = done ? 'var(--green-800)' : current ? 'var(--earth-500)' : 'var(--line-soft)';
  const dotFg = done ? 'var(--ivory-card)' : current ? 'var(--green-900)' : 'var(--ink-700)';
  const row = (
    <>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, background: dotBg, color: dotFg }}>
        {mark}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, lineHeight: '19px', color: 'var(--ink-900)' }}>{chapterTitle(chapter, t)}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
          <ChapterMeta chapter={chapter} t={t} />
        </span>
      </span>
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    padding: '7px 12px',
    borderRadius: 'var(--radius-lg)',
    textDecoration: 'none',
    background: current ? 'var(--ivory-card)' : 'transparent',
    border: current ? '1px solid var(--earth-500)' : '1px solid transparent',
  } as const;
  // D-FIN-14 : un chapitre sans contenu ne s'ouvre pas.
  if (!chapter.available) return <div style={{ ...style, opacity: 0.65 }}>{row}</div>;
  return <Link to={`${base}/chapter/${chapter.id}`} style={style}>{row}</Link>;
}

/** Parties triées, chapitres de chaque partie triés ; `parts` vide = module sans parties. */
function useSections(course: TeachingCourseDetail | undefined) {
  return useMemo(() => {
    if (!course) return [];
    const chapters = [...course.chapters].sort((a, b) => a.orderIndex - b.orderIndex);
    if (course.parts.length === 0) return [{ part: null as TeachingPartView | null, chapters }];
    return [...course.parts]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((part) => ({ part: part as TeachingPartView | null, chapters: chapters.filter((c) => c.partId === part.id) }))
      .filter((s) => s.chapters.length > 0);
  }, [course]);
}

function LeaderBlock({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [lockShown, setLockShown] = useState(false);
  const q = useQuery({
    queryKey: ['teaching', 'leader-summary', courseId],
    queryFn: () => getTeachingLeaderSummary(courseId),
    retry: false,
  });
  if (!q.data) return null;
  const s = q.data;
  const linkStyle = { color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5 } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
      <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* LEADER, SECRETARIAT, superAdmin ou dirigeant sans assemblée : totaux à 0, pas de phrase. */}
        {s.memberCount > 0 && (
          <span style={{ fontSize: 13.5, color: 'var(--ink-700)', flex: '1 1 220px' }}>
            {t('teaching.leader.summary', { started: s.startedCount, members: s.memberCount, count: s.startedCount })}
          </span>
        )}
        {s.canSeeDetails ? (
          <Link to="/hierarchy/vie" style={linkStyle}>{t('teaching.leader.seeProgress')}</Link>
        ) : (
          <button type="button" onClick={() => setLockShown(true)} style={{ ...linkStyle, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600 }}>
            {t('teaching.leader.seeProgress')}
          </button>
        )}
      </div>
      {/* D-FIN-03 : verrou Caleb existant, jamais un toast. Le serveur reste juge (403 de `/hierarchy`). */}
      {lockShown && <HierarchyLockedCompact context="teaching" />}
    </div>
  );
}

export function TeachingCoursePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const base = useTeachingBase();
  const q = useQuery({
    queryKey: ['teaching', 'course', id],
    queryFn: () => getTeachingCourse(id!),
    enabled: !!id,
    retry: false,
  });
  const course = q.data;
  const sections = useSections(course);

  const crumbs = [t('common.brand'), <Link key="t" to={base} style={{ color: 'inherit' }}>{t('nav.teaching')}</Link>];
  let body;
  if (q.isLoading) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (errCode(q.error) === 'TEACHING_JOIN_REQUIRED') {
    body = <TeachingJoinWall />;
  } else if (q.error || !course) {
    body = <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(q.error, t('common.error'))}</p>;
  } else {
    const next = course.nextChapterId ? course.chapters.find((c) => c.id === course.nextChapterId) ?? null : null;
    const resumeLabel = !next
      ? null
      : !course.lastActivityAt
        ? t('teaching.hub.start')
        : next.number === 0
          ? t('teaching.hub.resumeIntro')
          : t('teaching.hub.resume', { number: next.number });
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
        {course.author && <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{course.author}</div>}
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 27, lineHeight: '32px', color: 'var(--green-900)' }}>{course.name}</h2>
        {course.description && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-700)' }}>{course.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}><ProgressBar percent={course.totalCount > 0 ? (100 * course.completedCount) / course.totalCount : 0} height={5} /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-500)' }}>
            {t('teaching.course.progress', { completed: course.completedCount, total: course.totalCount })}
          </span>
        </div>
        {resumeLabel && next ? (
          <Link to={`${base}/chapter/${next.id}`} className="btn primary" style={{ justifyContent: 'center', margin: '8px 0', padding: '13px 16px', fontSize: 15 }}>
            {resumeLabel}
          </Link>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green-800)', margin: '8px 0' }}>{t('teaching.hub.allDone')}</div>
        )}
        {/* C-7 du contrat : le serveur dit si le bloc s'affiche. Un simple membre ne le voit pas. */}
        {course.leaderBlock && <LeaderBlock courseId={course.id} />}
        {sections.map(({ part, chapters }) => (
          <div key={part?.id ?? 'flat'} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {part && part.number !== 0 && (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-900)', margin: '10px 0 2px' }}>
                {part.title ? t('teaching.course.part', { number: part.number, title: part.title }) : t('teaching.course.partNoTitle', { number: part.number })}
              </div>
            )}
            {chapters.map((c) => (
              <ChapterRow key={c.id} chapter={c} base={base} current={c.id === course.nextChapterId} />
            ))}
          </div>
        ))}
        {/* §8.2 : phrase affichée au membre, ses dirigeants peuvent voir son avancement. */}
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('teaching.course.visibilityNote')}</p>
      </div>
    );
  }

  return (
    <>
      <TopBar title={t('nav.teaching')} crumbs={crumbs} />
      <div className="content">{body}</div>
    </>
  );
}
