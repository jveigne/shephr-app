import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Modal, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import {
  StudyMemberActions,
  StudyNotesText,
  StudyQuestionList,
  fmtStudyPoints,
  isAnswerable,
  isStudyAnswered,
  studyRangeOf,
  topLevelOf,
  type StudyAnswerChange,
  type StudyAnswerValue,
} from '../components/StudyQuestionList';
import { useAuth } from '../hooks/useAuth';
import {
  cancelStudySession,
  finishStudySession,
  getStudySession,
  putMyStudyAnswers,
  reviewMyStudyAnswer,
  startStudyCorrection,
  submitStudyCatchUp,
  type StudyQuestionView,
  type StudySessionDetail,
  type StudySessionStatus,
  type StudyVerdict,
} from '../services/assemblyApi';
import {
  acknowledgeStudyDraft,
  dropFromStudyDraft,
  emptyStudyDraft,
  isEmptyStudyAnswer,
  loadStudyDraft,
  pendingStudyInputs,
  purgeStudyDraft,
  saveStudyDraft,
  setDraftAnswer,
  type StudyDraft,
} from '../utils/studyDraft';
import { isStudyModuleOff, useStudyAccess, useStudyBase } from '../utils/studyAccess';
import { LockedFeature } from '../components/LockedFeature';
import { moduleAccessDenied, studyCityAccessDenied } from '../services/entitlementsApi';
import { EmptyState, errCode } from './Assembly';
import { StudyCopyModal, StudyResultsModal, studyErrMsg } from './Study';

// ---------------------------------------------------------------------------------------------
//  « Le Message de Bertoua » — UNE SÉANCE d'étude sur le web (port de
//  `mobile/app/study/session/[id].tsx`).
//  D-ETU-14 levée (JP 27/10, décision n°3 — parité mobile → web, D-WEB-02) : le web pilote les
//  séances et y répond. Routes `/study/session/:id` (AppShell) et `/my-study/session/:id`
//  (MemberShell), sous FEATURES.study et l'accès de `useStudyAccess` (seul point de décision).
//
//  Un seul écran en trois temps selon `status` (RG-ETU-01) :
//   - REPONSES_OUVERTES — les questions, compteur « 5 / 14 répondues · Enregistré ✓ ». D-ETU-11 :
//     chaque saisie va au brouillon local (`utils/studyDraft`, localStorage par compte et par séance),
//     puis part en LOT (`PUT …/my-answers`, upsert) après ≈ 800 ms ; les `ignoredQuestionIds` sont
//     retirées et signalées (RG-ETU-04) ;
//   - CORRECTION — saisie verrouillée (RG-ETU-03) ; on échange les écrans : le voisin corrige la
//     copie DU COMPTE CONNECTÉ (RG-ETU-10), les PERSONNELLE restent masquées (RG-ETU-08) ;
//   - TERMINEE — « Ma note » (score du serveur, jamais recalculé, D-ETU-12), actions des membres
//     (D-ETU-36), copie en lecture ; le brouillon est purgé.
//  Panneau DIRIGEANT (`leader` du serveur, D-ETU-07, jamais recalculé) : répondants (RG-ETU-14b),
//  réponses du manuel à la demande (RG-ETU-12), *Passer à la correction* avec « S'arrêter après la
//  question » (D-ETU-40), *Annuler* (D-ETU-22), avis restants, *Terminer*, notes du dirigeant
//  repliées (D-ETU-35/37). Le dirigeant est aussi répondant (D-ETU-06) : ses réponses partent avant
//  chaque geste. En CORRECTION, ni lien Résultats ni copies des autres (RG-ETU-08 / D-ETU-09 :
//  l'écran est entre les mains d'un voisin).
//  D-ETU-23 : pas de temps réel — relecture ≈ 5 s (react-query `refetchInterval`), seulement onglet
//  visible, jamais une fois TERMINEE ni en rattrapage.
//  D-ETU-44/45/47 (JP 23/10) : MODE RATTRAPAGE — séance TERMINEE, `catchUpOpen` du serveur,
//  répondant sans copie envoyée : saisie comme en séance, aucune réponse du manuel, « Envoyer ma
//  copie » avec confirmation.
// ---------------------------------------------------------------------------------------------

const POLL_MS = 5000;
/** Délai entre la dernière frappe et l'envoi du lot. */
const SAVE_DEBOUNCE_MS = 800;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * D-ETU-44/45/47 (JP 23/10) — l'appelant rattrape cette séance : TERMINEE, `catchUpOpen` du serveur,
 * répondant, et pas de copie envoyée (aucune, ou non PAPIER sans `submittedAt`). Le tri est celui du
 * SERVEUR (`catchUpOpen`) : on ne le refait pas ici.
 */
function isCatchUpWriting(d: StudySessionDetail | null | undefined): boolean {
  if (!d || d.session.status !== 'TERMINEE' || !d.catchUpOpen || !d.participant) return false;
  const c = d.myCopy;
  return !c || (c.source !== 'PAPIER' && !c.submittedAt);
}

const sessionKey = (id: string) => ['assembly', 'study', 'session', id] as const;

const httpStatus = (err: unknown): number | null =>
  (err as { response?: { status?: number } })?.response?.status ?? null;

export function StudySessionPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const sessionId = id ?? '';
  // Une instance par séance ET par compte : le brouillon est lié aux deux (D-ETU-11).
  return <StudySessionView key={`${sessionId}:${me?.id ?? ''}`} sessionId={sessionId} userId={me?.id ?? null} />;
}

function StudySessionView({ sessionId, userId }: { sessionId: string; userId: string | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const base = useStudyBase();
  const { hasStudy, isLoading: accessLoading } = useStudyAccess();

  const sessionQ = useQuery({
    queryKey: sessionKey(sessionId),
    queryFn: () => getStudySession(sessionId),
    enabled: hasStudy && !!sessionId,
    // D-ETU-23 : relecture ≈ 5 s tant que la séance n'est pas terminée, jamais en rattrapage.
    refetchInterval: (query) => {
      const d = query.state.data;
      if (query.state.error && httpStatus(query.state.error) === 404) return false;
      // D-ETU-51 (JP 27/10) : 403 MODULE_ACCESS_DENIED = verrou, on ne relit pas.
      if (query.state.error && moduleAccessDenied(query.state.error)) return false;
      if (!d || d.session.status === 'TERMINEE' || isCatchUpWriting(d)) return false;
      return POLL_MS;
    },
    refetchIntervalInBackground: false,
    retry: (count, err) => httpStatus(err) == null ? count < 1 : false,
  });
  const detail = sessionQ.data ?? null;
  // D-ETU-51 (JP 27/10) : séance d'une assemblée dont la ville n'a pas ETUDE_SUIVI (lecteur « hiérarchie »).
  const cityLock = !detail ? studyCityAccessDenied(sessionQ.error) : null;
  const gone =
    !!sessionQ.error && (httpStatus(sessionQ.error) === 404 || errCode(sessionQ.error) === 'RESOURCE_NOT_FOUND');

  const [draft, setDraft] = useState<StudyDraft>(() => (userId ? loadStudyDraft(userId, sessionId) : emptyStudyDraft()));
  const [saveState, setSaveState] = useState<SaveState>(() =>
    draft.pending.length === 0 && Object.keys(draft.answers).length > 0 ? 'saved' : 'idle',
  );
  const [offline, setOffline] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [stopPicker, setStopPicker] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  // D-BER-06 (JP 29/10) : `canAdjust` = pilotage permis (`canPilot` des résultats, RG-BER-26).
  const [copyOpen, setCopyOpen] = useState<{ id: string; canAdjust: boolean } | null>(null);

  // Références lues par les rappels asynchrones (minuterie, envoi) : toujours la dernière valeur.
  const draftRef = useRef<StudyDraft>(draft);
  const statusRef = useRef<StudySessionStatus | null>(null);
  const catchUpRef = useRef(false);
  const questionIdsRef = useRef<Set<string> | null>(null);
  const sendingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const applyDraft = useCallback(
    (next: StudyDraft, persist = true) => {
      draftRef.current = next;
      setDraft(next);
      if (persist && userId) saveStudyDraft(userId, sessionId, next);
    },
    [userId, sessionId],
  );

  const purge = useCallback(() => {
    if (userId) purgeStudyDraft(userId, sessionId);
    draftRef.current = emptyStudyDraft();
    setDraft(draftRef.current);
  }, [userId, sessionId]);

  const refetch = useCallback(() => void qc.invalidateQueries({ queryKey: sessionKey(sessionId) }), [qc, sessionId]);

  /** Envoie le lot des saisies non accusées (D-ETU-11) — sans effet s'il n'y a rien. */
  const flush = useCallback(async () => {
    if (!userId || !sessionId || sendingRef.current) return;
    if (statusRef.current === 'TERMINEE' && !catchUpRef.current) return;
    // D-ETU-41 (JP 23/10) : en REPONSES_OUVERTES / CORRECTION, une saisie qui vise une question
    // retirée par la coupe part TELLE QUELLE (le serveur la garde pour la séance suivante, ou la
    // renvoie dans `ignoredQuestionIds`). D-ETU-44 : seul le RATTRAPAGE l'abandonne (le serveur
    // refuserait le lot entier pour une question hors plage).
    const known = questionIdsRef.current;
    if (catchUpRef.current && known && known.size > 0) {
      const outside = draftRef.current.pending.filter((qid) => !known.has(qid));
      if (outside.length > 0) applyDraft(dropFromStudyDraft(draftRef.current, outside));
    }
    const inputs = pendingStudyInputs(draftRef.current);
    if (inputs.length === 0) return;
    sendingRef.current = true;
    let again = false;
    try {
      const res = await putMyStudyAnswers(sessionId, inputs);
      applyDraft(acknowledgeStudyDraft(draftRef.current, inputs, res.ignoredQuestionIds));
      setOffline(false);
      setSendError(null);
      if (res.ignoredQuestionIds.length) setIgnoredCount((n) => n + res.ignoredQuestionIds.length);
      if (res.copy) {
        const copy = res.copy;
        qc.setQueryData<StudySessionDetail>(sessionKey(sessionId), (d) => (d ? { ...d, myCopy: copy } : d));
      }
      again = draftRef.current.pending.length > 0; // ressaisie pendant l'envoi
      setSaveState(again ? 'saving' : 'saved');
    } catch (e: unknown) {
      const status = httpStatus(e);
      setSaveState('failed');
      if (status == null) {
        // Hors ligne : le brouillon reste, le lot repartira au prochain rafraîchissement.
        setOffline(true);
      } else if (status >= 500) {
        setSendError(studyErrMsg(e, t));
      } else {
        // Refus définitif du lot (séance terminée, forme invalide, droits) : le rejouer ne
        // changerait rien. On retire les saisies non accusées — la copie du serveur fait foi.
        setSendError(studyErrMsg(e, t));
        applyDraft(dropFromStudyDraft(draftRef.current, inputs.map((i) => i.questionId)));
        const code = errCode(e);
        if (code === 'STUDY_SESSION_LOCKED' || code === 'STUDY_CATCH_UP_CLOSED') refetch();
      }
    } finally {
      sendingRef.current = false;
    }
    if (again) setTimeout(() => void flushRef.current?.(), 0);
  }, [userId, sessionId, t, qc, applyDraft, refetch]);
  flushRef.current = flush;

  /** Envoie tout de suite (fin de l'anti-rebond, geste du dirigeant, onglet masqué, démontage). */
  const persistNow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await flush();
  }, [flush]);

  // Chaque séance reçue : statut, mode rattrapage, plage ; TERMINEE (hors rattrapage) purge le
  // brouillon ; sinon le lot en attente repart (relecture ≈ 5 s, D-ETU-23).
  useEffect(() => {
    if (!detail) return;
    statusRef.current = detail.session.status;
    catchUpRef.current = isCatchUpWriting(detail);
    questionIdsRef.current = new Set(detail.questions.map((q) => q.id));
    if (detail.session.status === 'TERMINEE' && !catchUpRef.current) {
      purge();
      return;
    }
    void flush();
  }, [detail, sessionQ.dataUpdatedAt, purge, flush]);

  // Séance annulée par le dirigeant (D-ETU-22) : plus rien à envoyer.
  useEffect(() => {
    if (gone) {
      statusRef.current = 'TERMINEE';
      catchUpRef.current = false;
      purge();
    }
  }, [gone, purge]);

  // Onglet masqué ou page quittée : on n'abandonne pas une frappe récente. En rattrapage (pas de
  // relecture), le lot en attente repart toutes les 5 s et au retour du réseau.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void persistNow();
    };
    const onOnline = () => void flushRef.current?.();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => {
      if (catchUpRef.current && document.visibilityState === 'visible' && draftRef.current.pending.length > 0) {
        void flushRef.current?.();
      }
    }, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (draftRef.current.pending.length > 0) void flushRef.current?.();
    };
  }, [persistNow]);

  const onAnswer = (q: StudyQuestionView, value: StudyAnswerChange) => {
    // RG-ETU-03 : verrouillé à la correction — sauf le rattrapage non envoyé (D-ETU-44).
    if (statusRef.current !== 'REPONSES_OUVERTES' && !catchUpRef.current) return;
    applyDraft(setDraftAnswer(draftRef.current, { questionId: q.id, ...value }));
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistNow(), SAVE_DEBOUNCE_MS);
  };

  const invalidateStudy = () => void qc.invalidateQueries({ queryKey: ['assembly', 'study'] });

  const onReview = async (q: StudyQuestionView, verdict: StudyVerdict) => {
    if (reviewing) return;
    setReviewing(q.id);
    try {
      const copy = await reviewMyStudyAnswer(sessionId, q.id, verdict);
      qc.setQueryData<StudySessionDetail>(sessionKey(sessionId), (d) => (d ? { ...d, myCopy: copy } : d));
    } catch (e) {
      push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
      if (errCode(e) === 'STUDY_SESSION_NOT_OPEN') refetch();
    } finally {
      setReviewing(null);
    }
  };

  /** Geste du dirigeant : ses réponses partent d'abord (D-ETU-06) ; la réponse remplace la séance affichée. */
  const lead = async (action: () => Promise<StudySessionDetail>) => {
    if (busy) return;
    setBusy(true);
    try {
      await persistNow();
      const fresh = await action();
      qc.setQueryData(sessionKey(sessionId), fresh);
      invalidateStudy();
    } catch (e) {
      push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
      const code = errCode(e);
      if (code === 'STUDY_INVALID_TRANSITION' || code === 'STUDY_SESSION_NOT_CANCELLABLE') refetch();
    } finally {
      setBusy(false);
    }
  };

  const onFinish = () => {
    const left = detail?.pendingReviewCount ?? 0;
    setConfirm({
      title: t('assembly.study.leader.finishTitle'),
      body: left > 0 ? t('assembly.study.leader.finishConfirmLeft', { count: left }) : t('assembly.study.leader.finishConfirm'),
      label: t('assembly.study.leader.finish'),
      onConfirm: () => void lead(() => finishStudySession(sessionId)),
    });
  };

  const onCancel = () => {
    setConfirm({
      title: t('assembly.study.leader.cancelTitle'),
      body: t('assembly.study.leader.cancelConfirm'),
      label: t('assembly.study.leader.cancel'),
      danger: true,
      onConfirm: async () => {
        if (busy) return;
        setBusy(true);
        try {
          await cancelStudySession(sessionId);
          statusRef.current = 'TERMINEE';
          purge();
          push({ kind: 'ok', title: t('assembly.study.leader.cancelled') });
          // D-ETU-22 : on quitte la page avant d'oublier la séance (sinon relecture → 404).
          navigate(base);
          qc.removeQueries({ queryKey: sessionKey(sessionId) });
          invalidateStudy();
        } catch (e) {
          push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
          if (errCode(e) === 'STUDY_SESSION_NOT_CANCELLABLE' || errCode(e) === 'STUDY_INVALID_TRANSITION') refetch();
        } finally {
          setBusy(false);
        }
      },
    });
  };

  /**
   * D-ETU-44 (JP 23/10) — « Envoyer ma copie » : le lot en attente part d'abord ; s'il reste des
   * saisies non accusées, l'envoi est refusé (copie incomplète) ; sinon envoi, relecture, purge.
   */
  const submitCatchUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await persistNow();
      if (draftRef.current.pending.length > 0) {
        push({ kind: 'error', title: t('assembly.study.title'), msg: t('assembly.study.session.catchUpNotSent') });
        return;
      }
      await submitStudyCatchUp(sessionId);
      catchUpRef.current = false;
      purge();
      await qc.invalidateQueries({ queryKey: sessionKey(sessionId) });
      invalidateStudy();
      push({ kind: 'ok', title: t('assembly.study.session.catchUpSent') });
    } catch (e) {
      push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
      const code = errCode(e);
      if (code === 'STUDY_CATCH_UP_CLOSED' || code === 'STUDY_CATCH_UP_EMPTY') refetch();
    } finally {
      setBusy(false);
    }
  };

  // Copie du serveur, recouverte par le brouillon (la saisie locale la plus récente gagne).
  const answers = useMemo(() => {
    const map: Record<string, StudyAnswerValue | undefined> = {};
    for (const a of detail?.myCopy?.answers ?? []) map[a.questionId] = a;
    for (const d of Object.values(draft.answers)) {
      const server = map[d.questionId];
      map[d.questionId] = isEmptyStudyAnswer(d)
        ? { valueText: null, valueOptions: null, done: false }
        : { ...server, valueText: d.valueText, valueOptions: d.valueOptions, done: !!d.done };
    }
    return map;
  }, [detail?.myCopy, draft.answers]);

  const questions = useMemo(() => detail?.questions ?? [], [detail?.questions]);
  const answerable = questions.filter(isAnswerable);
  const answeredCount = answerable.filter((q) => isStudyAnswered(q, answers[q.id])).length;
  const writtenLeft = questions.filter((q) => {
    const a = answers[q.id];
    return q.type === 'OUVERTE' && isStudyAnswered(q, a) && !a?.verdict && !a?.adjusted;
  }).length;
  const hasAnything = answeredCount > 0;

  const back = (
    <Link to={base} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit' }}>
      {t('assembly.study.session.back')}
    </Link>
  );

  const shell = (title: ReactNode, body: ReactNode) => (
    <>
      <TopBar title={title} crumbs={[t('common.brand'), back]} />
      <div className="content narrow">{body}</div>
    </>
  );

  if (accessLoading) return shell(t('assembly.study.title'), <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>);
  if (!hasStudy) {
    return shell(
      t('assembly.study.title'),
      <EmptyState title={t('assembly.study.moduleOff')} text={t('assembly.study.moduleOffHint')} />,
    );
  }
  if (gone) return shell(t('assembly.study.title'), <EmptyState title={t('assembly.study.title')} text={t('assembly.study.session.gone')} />);
  if (cityLock) return shell(t('assembly.study.title'), <LockedFeature denied={cityLock} compact />);
  if (!detail && isStudyModuleOff(sessionQ.error)) {
    return shell(
      t('assembly.study.title'),
      <EmptyState title={t('assembly.study.moduleOff')} text={t('assembly.study.moduleOffHint')} />,
    );
  }
  if (!detail) {
    if (sessionQ.isLoading) return shell(t('assembly.study.title'), <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>);
    return shell(
      t('assembly.study.title'),
      <div className="card" style={{ padding: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--err)', flex: 1 }}>{studyErrMsg(sessionQ.error, t)}</span>
        <Button onClick={() => refetch()}>{t('common.retryLater')}</Button>
      </div>,
    );
  }

  const s = detail.session;
  const lessonTitle = [t('assembly.study.lesson', { n: s.lessonNumber }), s.lessonTitle].filter(Boolean).join(' — ');
  const myCopy = detail.myCopy;
  // D-ETU-38 (JP 23/10) : « Leçon 1 · questions 1 à 20 ».
  const range = studyRangeOf(s, questions);
  const catchUp = isCatchUpWriting(detail);
  // D-ETU-44 / D-ETU-47 : copie de rattrapage envoyée, réponses écrites en attente de l'avis du dirigeant.
  const awaitingReview = !!myCopy?.submittedAt && writtenLeft > 0;

  const counter = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '14px 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--green-700)' }}>
      <span>{t('assembly.study.session.answered', { done: answeredCount, total: answerable.length })}</span>
      {saveState !== 'idle' && (
        <span style={{ color: saveState === 'failed' ? 'var(--err)' : undefined }}>· {t(`assembly.study.session.save.${saveState}`)}</span>
      )}
    </div>
  );

  return (
    <>
      <TopBar title={lessonTitle} crumbs={[t('common.brand'), back, t('assembly.study.lesson', { n: s.lessonNumber })]} />
      <div className="content narrow" style={{ maxWidth: 860 }}>
        {/* En-tête : unité, leçon, portion, plage, statut, assemblée. */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--earth-700)' }}>
          {[s.moduleCode, s.moduleName].filter(Boolean).join(' · ')}
        </div>
        {detail.lessonPortion && (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink-700)', marginTop: 4 }}>
            {detail.lessonPortion}
          </div>
        )}
        {range && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--green-700)', marginTop: 6 }}>
            {t('assembly.study.session.rangeLine', { n: s.lessonNumber, first: range.first, last: range.last })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <Badge tone={s.status === 'TERMINEE' ? 'ok' : s.status === 'CORRECTION' ? 'earth' : 'warn'} dot>
            {t(`assembly.study.status.${s.status}`)}
          </Badge>
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>{s.unitName}</span>
        </div>

        {offline && (
          <Notice icon="warning" tone="warn">
            {draft.pending.length ? t('assembly.study.session.offlinePending') : t('assembly.study.session.offline')}
          </Notice>
        )}
        {!offline && !!sessionQ.error && <Notice icon="warning" tone="err">{studyErrMsg(sessionQ.error, t)}</Notice>}
        {sendError && <Notice icon="warning" tone="err">{sendError}</Notice>}
        {ignoredCount > 0 && <Notice icon="info" tone="warn">{t('assembly.study.session.ignored', { count: ignoredCount })}</Notice>}

        {detail.leader && (
          <LeaderPanel
            detail={detail}
            busy={busy}
            showKey={showKey}
            onToggleKey={() => setShowKey((v) => !v)}
            onToCorrection={() => setStopPicker(true)}
            onCancel={onCancel}
            onFinish={onFinish}
            onResults={() => setResultsOpen(true)}
          />
        )}

        {s.status === 'REPONSES_OUVERTES' && (
          <>
            {detail.participant ? (
              counter
            ) : (
              <p style={{ margin: '14px 0 10px', fontSize: 13, color: 'var(--ink-500)' }}>{t('assembly.study.session.readerHint')}</p>
            )}
            <StudyQuestionList
              questions={questions}
              answers={answers}
              mode="answer"
              showKey={detail.leader && showKey}
              disabled={!detail.participant}
              onAnswer={onAnswer}
            />
          </>
        )}

        {s.status === 'CORRECTION' && (
          <>
            {detail.participant && hasAnything ? (
              <>
                <Notice icon="copy" tone="green">{t('assembly.study.session.correctionHint')}</Notice>
                <div style={{ margin: '14px 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--green-700)' }}>
                  {writtenLeft > 0
                    ? t('assembly.study.session.writtenLeft', { count: writtenLeft })
                    : t('assembly.study.session.writtenDone')}
                </div>
                <StudyQuestionList
                  questions={questions}
                  answers={answers}
                  mode="review"
                  maskPersonal
                  busyQuestionId={reviewing}
                  onReview={(q, v) => void onReview(q, v)}
                />
              </>
            ) : (
              <div style={{ marginTop: 16 }}>
                <EmptyState
                  title={t('assembly.study.status.CORRECTION')}
                  text={detail.participant ? t('assembly.study.session.noAnswerCorrection') : t('assembly.study.session.waitCorrection')}
                />
              </div>
            )}
          </>
        )}

        {catchUp && (
          <>
            {/* D-ETU-44 (JP 23/10) : rattrapage — ni corrections ni réponses du manuel avant l'envoi. */}
            <Notice icon="history" tone="green" title={t('assembly.study.session.catchUpTitle')}>
              {t('assembly.study.session.catchUpHint')}
            </Notice>
            {counter}
            <StudyQuestionList questions={questions} answers={answers} mode="answer" onAnswer={onAnswer} />
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                iconL={<Icon name="arrowRight" size={14} />}
                disabled={!hasAnything || busy}
                onClick={() =>
                  setConfirm({
                    title: t('assembly.study.session.catchUpSubmitTitle'),
                    body: t('assembly.study.session.catchUpSubmitConfirm', { done: answeredCount, total: answerable.length }),
                    label: t('assembly.study.session.catchUpSubmit'),
                    onConfirm: () => void submitCatchUp(),
                  })
                }
              >
                {t('assembly.study.session.catchUpSubmit')}
              </Button>
            </div>
          </>
        )}

        {s.status === 'TERMINEE' && !catchUp && (
          <>
            {detail.participant && (
              <div className="card" style={{ marginTop: 16, padding: 20 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--green-600)' }}>
                  {t('assembly.study.session.myScore')}
                </div>
                {myCopy ? (
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 40, color: 'var(--green-700)', marginTop: 4 }}>
                    {t('assembly.study.scoreOf', { score: fmtStudyPoints(myCopy.score, lang), max: fmtStudyPoints(myCopy.maxScore, lang) })}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink-500)', marginTop: 8 }}>
                    {t('assembly.study.session.noCopy')}
                  </div>
                )}
                {awaitingReview && (
                  <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>{t('assembly.study.session.awaitingReview')}</div>
                )}
                <div style={{ marginTop: 12 }}>
                  <Link to={base} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--green-700)' }}>
                    {t('assembly.study.session.myProgress')} →
                  </Link>
                </div>
              </div>
            )}
            {/* D-ETU-36 (JP 23/10) : actions des membres, montrées à tous une fois la séance terminée. */}
            {(detail.memberActions ?? []).some((a) => a && a.trim()) && (
              <div className="card" style={{ marginTop: 16, padding: 16, background: 'var(--green-50)' }}>
                <StudyMemberActions actions={detail.memberActions} />
              </div>
            )}
            {myCopy && (
              <div style={{ marginTop: 16 }}>
                <StudyQuestionList questions={questions} answers={answers} mode="read" maskPersonal />
              </div>
            )}
          </>
        )}
      </div>

      {detail.leader && stopPicker && (
        <StopAfterModal
          questions={questions}
          onClose={() => setStopPicker(false)}
          onConfirm={(last) => {
            setStopPicker(false);
            void lead(() => startStudyCorrection(sessionId, last));
          }}
        />
      )}
      {confirm && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={confirm.title}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button
                variant={confirm.danger ? 'danger' : 'primary'}
                disabled={busy}
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  void c.onConfirm();
                }}
              >
                {confirm.label}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{confirm.body}</p>
        </Modal>
      )}
      {/* RG-ETU-08 / D-ETU-09 : jamais en CORRECTION (le lien est masqué dans le panneau). */}
      {resultsOpen && detail.leader && s.status !== 'CORRECTION' && (
        <StudyResultsModal sessionId={sessionId} onClose={() => setResultsOpen(false)} onOpenCopy={(cid, canAdjust) => setCopyOpen({ id: cid, canAdjust })} />
      )}
      {copyOpen && <StudyCopyModal copyId={copyOpen.id} canAdjust={copyOpen.canAdjust} onClose={() => setCopyOpen(null)} />}
    </>
  );
}

interface ConfirmState {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const NOTICE_TONE: Record<'green' | 'warn' | 'err', { bg: string; fg: string }> = {
  green: { bg: 'var(--green-50)', fg: 'var(--green-700)' },
  warn: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  err: { bg: 'var(--err-bg)', fg: 'var(--err)' },
};

function Notice({
  icon,
  tone,
  title,
  children,
}: {
  icon: string;
  tone: 'green' | 'warn' | 'err';
  title?: string;
  children: ReactNode;
}) {
  const c = NOTICE_TONE[tone];
  return (
    <div
      style={{
        marginTop: 14,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 14px',
        borderRadius: 'var(--radius)',
        background: c.bg,
        fontSize: 13.5,
        lineHeight: 1.45,
        color: 'var(--ink-800)',
      }}
    >
      <span style={{ color: c.fg, display: 'inline-flex', marginTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        {title && <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/** D-ETU-07 — pilotage, réservé aux DIRIGEANT_UNITE de l'assemblée (`leader` du serveur). */
function LeaderPanel({
  detail,
  busy,
  showKey,
  onToggleKey,
  onToCorrection,
  onCancel,
  onFinish,
  onResults,
}: {
  detail: StudySessionDetail;
  busy: boolean;
  showKey: boolean;
  onToggleKey: () => void;
  onToCorrection: () => void;
  onCancel: () => void;
  onFinish: () => void;
  onResults: () => void;
}) {
  const { t } = useTranslation();
  const [notesOpen, setNotesOpen] = useState(false);
  const s = detail.session;
  const left = detail.pendingReviewCount ?? 0;
  // D-ETU-35/36 (JP 23/10) : à TERMINEE, les actions des membres ont leur propre bloc (pour tous).
  const panelActions = s.status === 'TERMINEE' ? null : detail.memberActions;
  const hasNotes =
    !!detail.moduleLeaderNotes?.trim() || !!detail.lessonLeaderNotes?.trim() || (panelActions ?? []).some((a) => a && a.trim());
  // RG-ETU-08 / D-ETU-09 (JP 21/10) : en CORRECTION, l'écran du dirigeant (répondant lui aussi,
  // D-ETU-06) est entre les mains d'un voisin — pas de lien vers les copies des autres.
  const resultsAllowed = s.status !== 'CORRECTION';
  const stat = { fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-900)', marginTop: 8 } as const;
  const linkBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--green-700)',
    fontWeight: 600,
    fontSize: 13.5,
    cursor: 'pointer',
  } as const;
  return (
    <div className="card" style={{ marginTop: 16, padding: '14px 18px', borderLeft: '3px solid var(--green-700)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--green-600)' }}>
          {t('assembly.study.leader.panel')}
        </span>
        {resultsAllowed && (
          <button type="button" style={linkBtn} onClick={onResults}>
            {t('assembly.study.leader.results')} <Icon name="chevRight" size={12} />
          </button>
        )}
      </div>

      {s.status === 'REPONSES_OUVERTES' && (
        <>
          {/* RG-ETU-14b : le nombre de répondants est réservé au dirigeant (`copyCount`). */}
          <div style={stat}>{t('assembly.study.leader.respondents', { count: s.copyCount })}</div>
          <button type="button" style={{ ...linkBtn, marginTop: 8 }} onClick={onToggleKey}>
            <Icon name={showKey ? 'eyeOff' : 'eye'} size={15} />
            {showKey ? t('assembly.study.leader.hideKey') : t('assembly.study.leader.showKey')}
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Button variant="primary" disabled={busy} onClick={onToCorrection}>
              {t('assembly.study.leader.toCorrection')}
            </Button>
            <Button variant="danger" disabled={busy} onClick={onCancel}>
              {t('assembly.study.leader.cancel')}
            </Button>
          </div>
        </>
      )}

      {s.status === 'CORRECTION' && (
        <>
          <div style={stat}>
            {left > 0 ? t('assembly.study.leader.reviewsLeft', { count: left }) : t('assembly.study.leader.reviewsDone')}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>
            {t('assembly.study.leader.respondents', { count: s.copyCount })}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" disabled={busy} onClick={onFinish}>
              {t('assembly.study.leader.finish')}
            </Button>
          </div>
        </>
      )}

      {s.status === 'TERMINEE' && <div style={stat}>{t('assembly.study.leader.finished', { count: s.copyCount })}</div>}

      {/* D-ETU-35 (JP 23/10) : « Notes du dirigeant », repliées par défaut (texte brut, D-ETU-37). */}
      {hasNotes && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
          <button type="button" style={linkBtn} aria-expanded={notesOpen} onClick={() => setNotesOpen((v) => !v)}>
            <Icon name="chevDown" size={14} style={{ transform: notesOpen ? 'rotate(180deg)' : undefined }} />
            {t('assembly.study.leader.notes')}
          </button>
          {notesOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <StudyNotesText title={t('assembly.study.briefing.unitNotes')} text={detail.moduleLeaderNotes} />
              <StudyNotesText title={t('assembly.study.briefing.lessonNotes')} text={detail.lessonLeaderNotes} />
              <StudyMemberActions title={t('assembly.study.briefing.memberActions')} actions={panelActions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * D-ETU-40 (JP 23/10) — « S'arrêter après la question : [N] » : questions de premier niveau de la
 * plage (une sous-question suit son parent, D-ETU-38), défaut = la dernière ; *Passer à la
 * correction* confirme. La dernière choisie → corps omis (« absent = dernière de la leçon »).
 */
function StopAfterModal({
  questions,
  onClose,
  onConfirm,
}: {
  questions: StudyQuestionView[];
  onClose: () => void;
  onConfirm: (lastQuestionNumber: string | null) => void;
}) {
  const { t } = useTranslation();
  const top = topLevelOf(questions);
  const last = top[top.length - 1]?.number ?? null;
  const [pick, setPick] = useState<string | null>(last);
  const cut = !!pick && pick !== last;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('assembly.study.leader.toCorrection')}
      sub={t('assembly.study.leader.stopAfter')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!pick} onClick={() => onConfirm(cut ? pick : null)}>
            {t('assembly.study.leader.toCorrection')}
          </Button>
        </>
      }
    >
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '45vh', overflowY: 'auto' }}>
        {top.map((q) => {
          const selected = q.number === pick;
          return (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPick(q.number)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                textAlign: 'left',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${selected ? 'var(--green-700)' : 'var(--line)'}`,
                background: selected ? 'var(--green-50)' : 'var(--ivory)',
                cursor: 'pointer',
                color: 'var(--ink-900)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--earth-700)', minWidth: 42 }}>
                {t('assembly.study.answer.number', { number: q.number })}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.statement}
              </span>
              {q.number === last && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-700)' }}>{t('assembly.study.leader.stopLast')}</span>
              )}
            </button>
          );
        })}
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5 }}>
        {cut ? t('assembly.study.leader.stopAfterCut', { number: pick }) : t('assembly.study.leader.toCorrectionConfirm')}
      </p>
    </Modal>
  );
}

