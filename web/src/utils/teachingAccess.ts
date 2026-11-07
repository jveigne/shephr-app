import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listTeachingCourses, type TeachingCourseSummary } from '../services/assemblyApi';
import { getAccessibleModules, isAttachedAccount } from '../services/authApi';
import { useStudyAccess, useStudyMenuState } from './studyAccess';

/**
 * Accès aux enseignements individuels — SEUL point de décision du web (D-FIN-02, JP 06/11 ; contrat
 * §11.2) : compte rattaché (`isAttachedAccount`) ET `/courses` non vide. Aucun flag `FEATURES`, aucun
 * « CMCI » en dur : un ministère voit l'enseignement parce qu'il a du contenu. Le serveur reste juge
 * (403 `TEACHING_JOIN_REQUIRED`). Les suivis Caleb et Néhémie ne se décident PAS ici : ils viennent
 * des 403 enrichis et de `/teaching/localities`.
 */
export function useTeachingAccess(options?: { enabled?: boolean }): {
  hasTeaching: boolean;
  courses: TeachingCourseSummary[];
  isLoading: boolean;
  error: unknown;
} {
  const { me } = useAuth();
  const enabled = (options?.enabled ?? true) && isAttachedAccount(me);
  const q = useQuery({
    queryKey: ['teaching', 'courses'],
    queryFn: listTeachingCourses,
    enabled,
    retry: false,
  });
  const courses = enabled ? q.data ?? [] : [];
  return { hasTeaching: courses.length > 0, courses, isLoading: enabled && q.isLoading, error: enabled ? q.error : null };
}

/** Préfixe des pages selon le shell, sur le modèle de `useStudyBase` : `/my-teaching` (MemberShell) ou `/teaching`. */
export type TeachingBase = '/teaching' | '/my-teaching';

export function useTeachingBase(): TeachingBase {
  const { pathname } = useLocation();
  return pathname.startsWith('/my-teaching') ? '/my-teaching' : '/teaching';
}

/** Pages déjà existantes de chaque shell, regroupées sous « Enseignement » (leurs routes restent valides). */
function linksOf(base: TeachingBase): { study: string; documents: string } {
  return base === '/my-teaching'
    ? { study: '/my-study', documents: '/my-documents' }
    : { study: '/study', documents: '/documents' };
}

export type TeachingMenuKind = 'none' | 'hub' | 'study' | 'documents' | 'course';

export interface TeachingMenu {
  /** `hub` = au moins deux entrées ; `study` / `documents` / `course` = une seule, ouverte directement. */
  kind: TeachingMenuKind;
  /** Cible de l'entrée de menu (`''` si `kind = 'none'`). */
  to: string;
  /** Nom d'origine du seul enseignement (`kind = 'course'`). */
  courseName: string | null;
  showStudy: boolean;
  hasDocuments: boolean;
  courses: TeachingCourseSummary[];
  links: { study: string; documents: string };
  isLoading: boolean;
  error: unknown;
}

/**
 * D-FIN-12 (JP 06/11) — entrée « Enseignement » du menu et de la page : regroupe Le Message de Bertoua
 * (accessible et catalogue non vide, D-ETU-54), Documents (`DOCUMENTS` et compte rattaché, D-WEB-03) et
 * chaque enseignement. Une seule entrée disponible : son nom d'origine et accès direct (mêmes règles
 * que la tuile mobile, parité D-WEB-01).
 */
export function useTeachingMenu(base: TeachingBase, options?: { enabled?: boolean }): TeachingMenu {
  const { me } = useAuth();
  const enabled = options?.enabled ?? true;
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules, enabled });
  const { hasStudy } = useStudyAccess({ enabled });
  const study = useStudyMenuState(hasStudy);
  const { courses, isLoading: coursesLoading, error } = useTeachingAccess({ enabled });
  const hasDocuments = enabled && (modulesQ.data ?? []).includes('DOCUMENTS') && isAttachedAccount(me);
  const showStudy = enabled && study.visible;
  const links = linksOf(base);

  const count = courses.length + (showStudy ? 1 : 0) + (hasDocuments ? 1 : 0);
  const single = courses.length === 1 ? courses[0] : null;
  const shared = { showStudy, hasDocuments, courses, links, error, isLoading: enabled && (modulesQ.isLoading || study.isLoading || coursesLoading) };

  if (count === 0) return { ...shared, kind: 'none', to: '', courseName: null };
  if (count > 1) return { ...shared, kind: 'hub', to: base, courseName: null };
  if (showStudy) return { ...shared, kind: 'study', to: links.study, courseName: null };
  if (hasDocuments) return { ...shared, kind: 'documents', to: links.documents, courseName: null };
  return { ...shared, kind: 'course', to: `${base}/course/${single!.id}`, courseName: single!.name };
}
