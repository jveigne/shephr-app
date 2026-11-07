import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { StudyLiveBadge } from '../components/StudyLiveBadge';
import type { TeachingCourseSummary } from '../services/assemblyApi';
import { useTeachingBase, useTeachingMenu } from '../utils/teachingAccess';
import { EmptyState, ProgressBar, errCode, errMsg } from './Assembly';

// ---------------------------------------------------------------------------------------------
//  Enseignement — D-FIN-12 (JP 06/11, lot « FIN », contrat §11.2, maquette Enseignement écran 1).
//  Routes `/teaching` (AppShell) et `/my-teaching` (MemberShell). Tout ce qui s'apprend, au même
//  endroit : le premier enseignement mis en avant, Le Message de Bertoua (D-FIN-01 : l'étude EN
//  ASSEMBLÉE, écrans inchangés, pastille « En cours » conservée), les autres enseignements, Documents.
//  Une seule entrée disponible : ouverture directe (`useTeachingMenu`). Aucun prix, achat ni lien de
//  vente du livre (D-FIN-04).
// ---------------------------------------------------------------------------------------------

/** D-FIN-02 : compte non rattaché → mur « Rejoindre mon assemblée » (403 `TEACHING_JOIN_REQUIRED`). */
export function TeachingJoinWall() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="card" style={{ padding: 24, maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
      <Icon name="lock" size={20} style={{ color: 'var(--earth-700)' }} />
      <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 14.5, lineHeight: 1.5 }}>{t('teaching.errors.joinRequired')}</p>
      <Button variant="primary" onClick={() => navigate('/join')}>{t('documents.wall.join')}</Button>
    </div>
  );
}

/** Ligne d'avancement d'une carte : « Reprendre au chapitre 2 · 2 / 5 ». Tout vient du serveur. */
function courseLine(c: TeachingCourseSummary, t: ReturnType<typeof useTranslation>['t']): string {
  const progress = t('teaching.course.progress', { completed: c.completedCount, total: c.totalCount });
  if (!c.nextChapterId) return `${t('teaching.hub.allDone')} · ${progress}`;
  if (!c.lastActivityAt) return `${t('teaching.hub.start')} · ${progress}`;
  const resume = c.nextChapterNumber ? t('teaching.hub.resume', { number: c.nextChapterNumber }) : t('teaching.hub.resumeIntro');
  return `${resume} · ${progress}`;
}

const cardLink = { display: 'block', textDecoration: 'none', borderRadius: 'var(--radius-lg)', padding: '16px 18px' } as const;
const lightCard = { ...cardLink, background: 'var(--ivory-card)', border: '1px solid var(--line)', color: 'var(--ink-900)' } as const;

function FeaturedCourseCard({ course, base }: { course: TeachingCourseSummary; base: string }) {
  const { t } = useTranslation();
  const percent = course.totalCount > 0 ? (100 * course.completedCount) / course.totalCount : 0;
  return (
    <Link to={`${base}/course/${course.id}`} style={{ ...cardLink, padding: 18, background: 'var(--green-700)', color: 'var(--ivory)' }}>
      {course.author && <span style={{ display: 'block', fontSize: 12 }}>{course.author}</span>}
      <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 23, lineHeight: '28px', marginTop: 5 }}>{course.name}</span>
      <span style={{ display: 'block', fontSize: 13, marginTop: 8 }}>{courseLine(course, t)}</span>
      <span style={{ display: 'block', height: 5, borderRadius: 3, background: 'rgba(244,235,211,.25)', marginTop: 10 }}>
        <span style={{ display: 'block', width: `${percent}%`, height: 5, borderRadius: 3, background: 'var(--ivory)' }} />
      </span>
    </Link>
  );
}

function CourseCard({ course, base }: { course: TeachingCourseSummary; base: string }) {
  const { t } = useTranslation();
  const percent = course.totalCount > 0 ? (100 * course.completedCount) / course.totalCount : 0;
  return (
    <Link to={`${base}/course/${course.id}`} style={lightCard}>
      <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18 }}>{course.name}</span>
      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 3 }}>
        {[course.author, courseLine(course, t)].filter(Boolean).join(' · ')}
      </span>
      <span style={{ display: 'block', marginTop: 10 }}>
        <ProgressBar percent={percent} height={5} />
      </span>
    </Link>
  );
}

export function TeachingPage() {
  const { t } = useTranslation();
  const base = useTeachingBase();
  const menu = useTeachingMenu(base);

  const header = <TopBar title={t('nav.teaching')} crumbs={[t('common.brand'), t('nav.teaching')]} />;

  let body;
  if (menu.isLoading) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (errCode(menu.error) === 'TEACHING_JOIN_REQUIRED') {
    body = <TeachingJoinWall />;
  } else if (menu.kind === 'study' || menu.kind === 'documents' || menu.kind === 'course') {
    // Une seule entrée : pas de page intermédiaire, le retour du navigateur ne repasse pas ici.
    return <Navigate to={menu.to} replace />;
  } else if (menu.kind === 'none') {
    body = menu.error ? (
      <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(menu.error, t('common.error'))}</p>
    ) : (
      <EmptyState title={t('teaching.hub.emptyTitle')} text={t('teaching.hub.emptyText')} />
    );
  } else {
    const [first, ...others] = menu.courses;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
        {first && <FeaturedCourseCard course={first} base={base} />}
        {menu.showStudy && (
          <Link to={menu.links.study} style={{ ...lightCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span>
              <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18 }}>{t('nav.study')}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 3 }}>{t('teaching.hub.studyHint')}</span>
            </span>
            <StudyLiveBadge enabled={menu.showStudy} />
          </Link>
        )}
        {others.map((c) => (
          <CourseCard key={c.id} course={c} base={base} />
        ))}
        {menu.hasDocuments && (
          <Link to={menu.links.documents} style={lightCard}>
            <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18 }}>{t('nav.documents')}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 3 }}>{t('teaching.hub.documentsHint')}</span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="content">{body}</div>
    </>
  );
}
