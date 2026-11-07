import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  getStudyCatalog,
  getStudyMe,
  isTeachingRefusal,
  listTeachingCourses,
  type TeachingCourseSummary,
} from '@/services/assemblyApi';
import { readCachedCourses, writeCachedCourses } from '@/services/teachingCache';

/** Ce que la carte « Reprendre » de l'accueil propose (plan FIN §5.3, JP 06/11). */
export type TeachingResume =
  | { kind: 'session'; sessionId: string; unitName: string }
  | { kind: 'chapter'; course: TeachingCourseSummary; chapterId: string }
  | { kind: 'start'; course: TeachingCourseSummary }
  | null;

/**
 * D-FIN-12 (JP 06/11) — ce que contient la tuile « Enseignement » : Le Message de Bertoua, les enseignements et Documents.
 * Partagé par l'accueil et `app/teaching/index`, pour qu'une seule règle décide de chaque entrée :
 * <ul>
 *   <li>Bertoua : mêmes conditions qu'avant — compte rattaché, `hasStudy` (D-ETU-50) et `/study/catalog` non vide (D-ETU-54) ;
 *       pastille « En cours » tant qu'une séance de l'assemblée est ouverte ;</li>
 *   <li>Documents : mêmes conditions qu'avant — `hasDocuments` (RG-06) et compte rattaché (D-DOC-04) ;</li>
 *   <li>Enseignements : compte rattaché et `/courses` non vide. Aucun réglage par ministère : un ministère sans contenu ne
 *       voit rien (D-FIN-02).</li>
 * </ul>
 */
export function useTeachingHub() {
  const { me, hasDocuments, hasStudy: hasStudyModule } = useAuth();
  const userId = me?.id ?? null;
  // D-ETU-50 (JP 27/10) : étude gratuite — `hasStudy` ne dépend plus de l'abonnement STUDY (tout compte rattaché,
  // voir AuthContext) ; D-ETU-28 levée pour la tuile.
  const attached = isAttachedAccount(me);
  const studyAllowed = hasStudyModule && attached;
  const documents = hasDocuments && attached;

  // D-ETU-54 (JP 27/10) : la tuile n'apparaît que si `/study/catalog` est non vide. null = pas encore lu (tuile masquée).
  // Une panne ou une session expirée (lot FIN, JP 06/11 : `isTeachingRefusal`) garde la dernière valeur connue (ou montre la
  // tuile au premier lancement hors ligne : l'étude a son brouillon hors ligne) ; un refus du serveur (ex. 403
  // MODULE_ACCESS_DENIED si la plateforme coupe STUDY) la masque.
  const [studyCatalog, setStudyCatalog] = useState<boolean | null>(null);
  // Plan 21/10 (§6.3) — pastille « En cours » : une séance non terminée dans une assemblée du compte (`GET /study/me`).
  // Un échec la masque, sans plus.
  const [liveSession, setLiveSession] = useState<{ sessionId: string; unitName: string } | null>(null);
  // Liés au compte : un changement de session ne montre jamais les cours du compte précédent.
  const [loaded, setLoaded] = useState<{ userId: string; courses: TeachingCourseSummary[] } | null>(null);
  const courses = useMemo(
    () => (attached && loaded && loaded.userId === userId ? loaded.courses : null),
    [attached, loaded, userId],
  );

  const loadStudy = useCallback(async () => {
    if (!studyAllowed) return;
    const [catalog, mine] = await Promise.allSettled([getStudyCatalog(), getStudyMe()]);
    if (catalog.status === 'fulfilled') {
      setStudyCatalog(catalog.value.length > 0);
    } else {
      const refused = isTeachingRefusal(catalog.reason);
      setStudyCatalog((cur) => (refused ? false : (cur ?? true)));
    }
    const live = mine.status === 'fulfilled' ? mine.value.assemblies.find((a) => a.currentSession != null) : null;
    setLiveSession(live?.currentSession ? { sessionId: live.currentSession.id, unitName: live.unitName } : null);
  }, [studyAllowed]);

  const loadCourses = useCallback(async () => {
    if (!attached || !userId) return;
    try {
      const list = await listTeachingCourses();
      setLoaded({ userId, courses: list });
      void writeCachedCourses(userId, list);
    } catch (e) {
      if (isTeachingRefusal(e)) {
        setLoaded({ userId, courses: [] });
        void writeCachedCourses(userId, []);
      } else {
        // Lot FIN (JP 06/11) : une panne ou une session expirée n'efface rien, le dernier parcours connu reste ouvert.
        const cached = await readCachedCourses(userId);
        setLoaded((cur) => (cur && cur.userId === userId ? cur : { userId, courses: cached ?? [] }));
      }
    }
  }, [attached, userId]);

  const reload = useCallback(async () => {
    await Promise.all([loadStudy(), loadCourses()]);
  }, [loadStudy, loadCourses]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const study = studyAllowed && studyCatalog === true;
  const courseList = useMemo(() => courses ?? [], [courses]);

  // Une entrée encore inconnue : le nom de la tuile attend avant de se résoudre sur « une seule entrée ».
  const pending = attached && (courses === null || (studyAllowed && studyCatalog === null));
  const entryCount = (study ? 1 : 0) + (documents ? 1 : 0) + courseList.length;

  // Plan FIN §5.3 et contrat §11.1 : séance Bertoua ouverte, sinon chapitre en cours (le plus récemment lu), sinon
  // enseignement jamais ouvert, dans l'ordre du serveur (D-FIN-05 : l'usage). Tout terminé : pas de carte.
  const resume: TeachingResume = useMemo(() => {
    if (study && liveSession) return { kind: 'session', ...liveSession };
    const started = courseList
      .filter((c) => c.nextChapterId && c.lastActivityAt)
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
    const course = started[0];
    if (course?.nextChapterId) return { kind: 'chapter', course, chapterId: course.nextChapterId };
    const fresh = courseList.find((c) => c.nextChapterId && !c.lastActivityAt);
    return fresh ? { kind: 'start', course: fresh } : null;
  }, [study, liveSession, courseList]);

  return {
    attached,
    study,
    studyLive: study && liveSession != null,
    documents,
    courses: courseList,
    pending,
    entryCount,
    resume,
    reload,
  };
}
