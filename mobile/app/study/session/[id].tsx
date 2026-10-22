import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import StudyQuestionList, {
  isAnswerable,
  isStudyAnswered,
  type StudyAnswerValue,
} from '@/components/StudyQuestionList';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  cancelStudySession,
  finishStudySession,
  getStudySession,
  putMyStudyAnswers,
  reviewMyStudyAnswer,
  startStudyCorrection,
  studyErrorCode,
  studyErrorMessage,
  type StudyQuestionView,
  type StudySessionDetail,
  type StudyVerdict,
} from '@/services/assemblyApi';
import {
  acknowledgeStudyDraft,
  emptyStudyDraft,
  isEmptyStudyAnswer,
  loadStudyDraft,
  pendingStudyInputs,
  purgeStudyDraft,
  saveStudyDraft,
  setDraftAnswer,
  type StudyDraft,
} from '@/services/studyDraft';
import { fmtPoints } from '@/utils/format';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — UNE SÉANCE, un seul écran en trois temps selon
 * `status` (RG-ETU-01) :
 * <ul>
 *   <li>*Répondre* (`REPONSES_OUVERTES`) — les questions de la leçon, compteur « 5 / 14 répondues ·
 *       enregistré ✓ ». D-ETU-11 : chaque saisie va d'abord au brouillon du téléphone
 *       (`services/studyDraft`, hors ligne compris), puis part en LOT (`PUT …/my-answers`, upsert :
 *       rejouer donne le même état) ; les `ignoredQuestionIds` sont retirées et signalées ;</li>
 *   <li>*Correction* (`CORRECTION`) — la saisie se verrouille côté téléphone (RG-ETU-03) ; on
 *       échange les téléphones : le voisin corrige la copie DU COMPTE CONNECTÉ (RG-ETU-10), les
 *       `PERSONNELLE` restent masquées (RG-ETU-08) ;</li>
 *   <li>*Ma note* (`TERMINEE`) — note / max, lien vers la progression ; le brouillon est purgé.</li>
 * </ul>
 * Panneau DIRIGEANT (`leader`, D-ETU-07) : nombre de répondants, *Passer à la correction*,
 * *Annuler* (D-ETU-22, confirmation), avis restants, *Terminer*. Le dirigeant est aussi répondant
 * (D-ETU-06) ; il voit les réponses du manuel à la demande (RG-ETU-12).
 *
 * <p>D-ETU-11 (JP 21/10, « hors ligne compris ») : la dernière séance reçue est gardée avec le
 * brouillon (`StudyDraft.session`) ; rouverte sans réseau (app tuée par l'OS), la séance s'affiche
 * depuis elle et le membre continue à répondre — le serveur tranche au retour (RG-ETU-04).
 *
 * <p>D-ETU-23 : pas de temps réel — l'écran relit la séance ≈ toutes les 5 s, SEULEMENT au premier
 * plan et tant qu'il a le focus (et jamais une fois terminée). Pas de react-query : useState +
 * useFocusEffect.
 */

const POLL_MS = 5000;
/** Délai entre la dernière frappe et l'écriture du brouillon + l'envoi du lot. */
const SAVE_DEBOUNCE_MS = 700;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export default function StudySessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const { t, language } = useLanguage();
  const { me } = useAuth();
  const userId = me?.id ?? null;

  const [detail, setDetail] = useState<StudySessionDetail | null>(null);
  const [draft, setDraft] = useState<StudyDraft>(emptyStudyDraft);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [offline, setOffline] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Références lues par les rappels asynchrones (minuterie, envoi) : toujours la dernière valeur.
  const draftRef = useRef<StudyDraft>(emptyStudyDraft());
  const statusRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const refreshingRef = useRef(false);
  // Pas d'écriture du brouillon avant sa lecture : elle écraserait les réponses gardées hors ligne.
  const draftLoadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `flush` relit la séance sur STUDY_SESSION_LOCKED : référence, pour éviter une dépendance circulaire.
  const refreshRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

  const applyDraft = useCallback((next: StudyDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const purge = useCallback(() => {
    if (userId && sessionId) void purgeStudyDraft(userId, sessionId);
    applyDraft(emptyStudyDraft());
  }, [userId, sessionId, applyDraft]);

  /**
   * Affiche la séance reçue du serveur et la garde avec le brouillon (D-ETU-11, réouverture hors
   * ligne) ; `TERMINEE` purge tout. Écrite seulement si elle a changé (pas toutes les 5 s).
   */
  const showDetail = useCallback(
    (fresh: StudySessionDetail) => {
      statusRef.current = fresh.session.status;
      setDetail(fresh);
      if (fresh.session.status === 'TERMINEE') {
        purge();
        return;
      }
      if (!userId || !sessionId || !draftLoadedRef.current) return;
      if (JSON.stringify(draftRef.current.session ?? null) === JSON.stringify(fresh)) return;
      const next: StudyDraft = { ...draftRef.current, session: fresh };
      applyDraft(next);
      void saveStudyDraft(userId, sessionId, next);
    },
    [userId, sessionId, purge, applyDraft],
  );

  /** Envoie le lot des saisies non accusées (D-ETU-11) — sans effet s'il n'y a rien. */
  const flush = useCallback(async () => {
    if (!userId || !sessionId || sendingRef.current) return;
    if (statusRef.current === 'TERMINEE') return;
    const inputs = pendingStudyInputs(draftRef.current);
    if (inputs.length === 0) return;
    sendingRef.current = true;
    try {
      const res = await putMyStudyAnswers(sessionId, inputs);
      let next = acknowledgeStudyDraft(draftRef.current, inputs, res.ignoredQuestionIds);
      // La séance gardée hors ligne suit la copie accusée (D-ETU-11).
      if (res.copy && next.session) next = { ...next, session: { ...next.session, myCopy: res.copy } };
      applyDraft(next);
      void saveStudyDraft(userId, sessionId, next);
      setOffline(false);
      setSendError(null);
      if (res.ignoredQuestionIds.length) setIgnoredCount((n) => n + res.ignoredQuestionIds.length);
      if (res.copy) setDetail((d) => (d ? { ...d, myCopy: res.copy } : d));
    } catch (e: any) {
      if (!e?.response) {
        // Hors ligne : le brouillon reste, le lot repartira au prochain rafraîchissement.
        setOffline(true);
      } else if (e.response.status >= 500) {
        setSendError(studyErrorMessage(e, t));
      } else {
        // Refus définitif du lot (séance terminée, forme invalide, droits) : le rejouer ne
        // changerait rien. On retire les saisies non accusées — la copie du serveur fait foi.
        const code = studyErrorCode(e);
        setSendError(studyErrorMessage(e, t));
        const kept: StudyDraft = { ...draftRef.current, answers: { ...draftRef.current.answers }, pending: [] };
        for (const i of inputs) delete kept.answers[i.questionId];
        applyDraft(kept);
        void saveStudyDraft(userId, sessionId, kept);
        if (code === 'STUDY_SESSION_LOCKED') void refreshRef.current?.(true);
      }
    } finally {
      sendingRef.current = false;
    }
  }, [userId, sessionId, t, applyDraft]);

  /** Relit la séance (cible du rafraîchissement ≈ 5 s, D-ETU-23), puis envoie le lot en attente. */
  const refresh = useCallback(
    async (force = false) => {
      if (!sessionId || refreshingRef.current) return;
      if (!force && statusRef.current === 'TERMINEE') return;
      refreshingRef.current = true;
      try {
        const fresh = await getStudySession(sessionId);
        showDetail(fresh);
        setLoadError(null);
        setOffline(false);
        if (fresh.session.status !== 'TERMINEE') void flush();
      } catch (e: any) {
        if (!e?.response) {
          // Hors ligne : la séance gardée avec le brouillon reste affichée (D-ETU-11).
          setOffline(true);
        } else if (studyErrorCode(e) === 'RESOURCE_NOT_FOUND' || e.response.status === 404) {
          // Annulée par le dirigeant (D-ETU-22) : plus rien à envoyer, ni à relire.
          statusRef.current = 'TERMINEE';
          setGone(true);
          setDetail(null);
          purge();
        } else {
          setLoadError(studyErrorMessage(e, t));
        }
      } finally {
        refreshingRef.current = false;
        setLoading(false);
      }
    },
    [sessionId, t, purge, flush, showDetail],
  );
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const persistNow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!userId || !sessionId) return;
    const ok = await saveStudyDraft(userId, sessionId, draftRef.current);
    setSaveState(ok ? 'saved' : 'failed');
    await flush();
  }, [userId, sessionId, flush]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        if (userId && sessionId) {
          const stored = await loadStudyDraft(userId, sessionId);
          if (cancelled) return;
          applyDraft(stored);
          draftLoadedRef.current = true;
          if (stored.pending.length === 0 && Object.keys(stored.answers).length > 0) setSaveState('saved');
          const cached = stored.session;
          if (cached) {
            // D-ETU-11 : la dernière séance reçue s'affiche en attendant le serveur (hors ligne compris).
            setDetail((d) => d ?? cached);
            if (statusRef.current == null) statusRef.current = cached.session.status;
          }
        }
        await refresh(true);
      })();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void refresh();
      }, POLL_MS);
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') void refresh();
      });
      return () => {
        cancelled = true;
        clearInterval(timer);
        sub.remove();
        // Quitter l'écran n'abandonne pas une frappe récente.
        if (saveTimer.current) void persistNow();
      };
    }, [userId, sessionId, refresh, applyDraft, persistNow]),
  );

  const onAnswer = (q: StudyQuestionView, value: Pick<StudyAnswerValue, 'valueText' | 'valueOptions' | 'done'>) => {
    if (statusRef.current !== 'REPONSES_OUVERTES') return; // RG-ETU-03 : verrouillé côté téléphone
    applyDraft(setDraftAnswer(draftRef.current, { questionId: q.id, ...value }));
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistNow(), SAVE_DEBOUNCE_MS);
  };

  const onReview = async (q: StudyQuestionView, verdict: StudyVerdict) => {
    if (reviewing) return;
    setReviewing(q.id);
    try {
      const copy = await reviewMyStudyAnswer(sessionId, q.id, verdict);
      setDetail((d) => (d ? { ...d, myCopy: copy } : d));
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
      if (studyErrorCode(e) === 'STUDY_SESSION_NOT_OPEN') void refresh(true);
    } finally {
      setReviewing(null);
    }
  };

  /** Geste du dirigeant ; sa réponse remplace la séance affichée. */
  const lead = async (action: () => Promise<StudySessionDetail>) => {
    if (busy) return;
    setBusy(true);
    try {
      await persistNow(); // ses propres réponses partent avant le passage (D-ETU-06)
      showDetail(await action());
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
      if (studyErrorCode(e) === 'STUDY_INVALID_TRANSITION') void refresh(true);
    } finally {
      setBusy(false);
    }
  };

  const onToCorrection = async () => {
    const ok = await confirmDialog(t('study.leader.toCorrection'), t('study.leader.toCorrectionConfirm'), t('study.leader.toCorrection'));
    if (ok) void lead(() => startStudyCorrection(sessionId));
  };

  const onFinish = async () => {
    const left = detail?.pendingReviewCount ?? 0;
    const ok = await confirmDialog(
      t('study.leader.finish'),
      left > 0 ? t('study.leader.finishConfirmLeft', { count: left }) : t('study.leader.finishConfirm'),
      t('study.leader.finish'),
    );
    if (ok) void lead(() => finishStudySession(sessionId));
  };

  const onCancel = async () => {
    const ok = await confirmDialog(t('study.leader.cancelTitle'), t('study.leader.cancelConfirm'), t('study.leader.cancel'), true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      await cancelStudySession(sessionId);
      purge();
      notify(t('study.tile.title'), t('study.leader.cancelled'));
      goBack();
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
      if (studyErrorCode(e) === 'STUDY_SESSION_NOT_CANCELLABLE') void refresh(true);
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

  const questions = detail?.questions ?? [];
  const answerable = questions.filter(isAnswerable);
  const answeredCount = answerable.filter((q) => isStudyAnswered(q, answers[q.id])).length;
  const writtenLeft = questions.filter((q) => {
    const a = answers[q.id];
    return q.type === 'OUVERTE' && isStudyAnswered(q, a) && !a?.verdict && !a?.adjusted;
  }).length;
  const hasAnything = answeredCount > 0;

  const header = (
    <View style={styles.headerRow}>
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
    </View>
  );

  if (loading && !detail) {
    return (
      <ScreenShell withTabBar={false}>
        {header}
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (gone || !detail) {
    return (
      <ScreenShell withTabBar={false}>
        {header}
        <Text style={styles.kicker}>{t('study.tile.title')}</Text>
        {gone ? (
          <Card variant="paper2" style={styles.empty}>
            <Ionicons name="close-circle-outline" size={26} color={colors.ink3} />
            <Text style={styles.emptyText}>{t('study.session.gone')}</Text>
          </Card>
        ) : (
          // Hors ligne sans séance gardée (jamais ouverte sur ce téléphone) : on le dit, le
          // rafraîchissement ≈ 5 s affichera la séance au retour du réseau.
          <ErrorBanner
            message={loadError ?? (offline ? t('study.session.offline') : t('study.errors.generic'))}
            onRetry={() => void refresh(true)}
          />
        )}
      </ScreenShell>
    );
  }

  const s = detail.session;
  const lessonTitle = s.lessonTitle
    ? t('study.lessonTitled', { number: s.lessonNumber, title: s.lessonTitle })
    : t('study.lesson', { number: s.lessonNumber });
  const myCopy = detail.myCopy;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false}>
        {header}
        <Text style={styles.kicker}>{[s.moduleCode, s.moduleName].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.title}>{lessonTitle}</Text>
        {!!detail.lessonPortion && <Text style={styles.subtitle}>{detail.lessonPortion}</Text>}
        <View style={styles.metaRow}>
          <StatusPill status={s.status} />
          <Text style={styles.meta} numberOfLines={1}>
            {s.unitName}
          </Text>
        </View>

        {offline && (
          <View style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.earthDeep} />
            <Text style={styles.offlineText}>
              {draft.pending.length ? t('study.session.offlinePending') : t('study.session.offline')}
            </Text>
          </View>
        )}
        {!!loadError && <ErrorBanner message={loadError} onRetry={() => void refresh(true)} />}
        {!!sendError && <ErrorBanner message={sendError} />}
        {ignoredCount > 0 && (
          <ErrorBanner message={t('study.session.ignored', { count: ignoredCount })} />
        )}

        {detail.leader && (
          <LeaderPanel
            detail={detail}
            busy={busy}
            showKey={showKey}
            onToggleKey={() => setShowKey((v) => !v)}
            onToCorrection={onToCorrection}
            onCancel={onCancel}
            onFinish={onFinish}
          />
        )}

        {s.status === 'REPONSES_OUVERTES' && (
          <>
            {detail.participant ? (
              <View style={styles.counter}>
                <Text style={styles.counterText}>
                  {t('study.session.answered', { done: answeredCount, total: answerable.length })}
                </Text>
                {saveState !== 'idle' && (
                  <Text style={[styles.counterText, saveState === 'failed' && { color: colors.clay }]}>
                    {' · '}
                    {t(`study.session.save.${saveState}`)}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.hint}>{t('study.session.readerHint')}</Text>
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
                <Card variant="tinted" style={styles.notice}>
                  <Ionicons name="swap-horizontal" size={20} color={colors.moss} />
                  <Text style={styles.noticeText}>{t('study.session.correctionHint')}</Text>
                </Card>
                <Text style={styles.written}>
                  {writtenLeft > 0
                    ? t('study.session.writtenLeft', { count: writtenLeft })
                    : t('study.session.writtenDone')}
                </Text>
                <StudyQuestionList
                  questions={questions}
                  answers={answers}
                  mode="review"
                  maskPersonal
                  busyQuestionId={reviewing}
                  onReview={onReview}
                />
              </>
            ) : (
              <Card variant="paper2" style={styles.empty}>
                <Ionicons name="hourglass-outline" size={26} color={colors.ink3} />
                <Text style={styles.emptyText}>
                  {detail.participant ? t('study.session.noAnswerCorrection') : t('study.session.readerHint')}
                </Text>
              </Card>
            )}
          </>
        )}

        {s.status === 'TERMINEE' && (
          <>
            {detail.participant && (
              <Card style={styles.scoreCard}>
                <Label style={{ color: colors.mossSoft }}>{t('study.session.myScore')}</Label>
                {myCopy ? (
                  <Text style={styles.scoreBig}>
                    {t('study.score', { score: fmtPoints(myCopy.score, language), max: fmtPoints(myCopy.maxScore, language) })}
                  </Text>
                ) : (
                  <Text style={styles.scoreEmpty}>{t('study.session.noCopy')}</Text>
                )}
                <Button
                  label={t('study.home.myProgress')}
                  variant="ghost"
                  height={44}
                  style={{ marginTop: 14 }}
                  onPress={() => router.push({ pathname: '/study/progress', params: { mine: '1' } })}
                />
              </Card>
            )}
            {myCopy && (
              <View style={{ marginTop: 16 }}>
                <StudyQuestionList questions={questions} answers={answers} mode="read" maskPersonal />
              </View>
            )}
          </>
        )}
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function StatusPill({ status }: { status: StudySessionDetail['session']['status'] }) {
  const { t } = useLanguage();
  const tone = status === 'TERMINEE' ? colors.ink3 : status === 'CORRECTION' ? colors.earthDeep : colors.moss;
  return (
    <Text style={[styles.pill, { color: tone, borderColor: tone }]}>{t(`study.status.${status}`)}</Text>
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
}: {
  detail: StudySessionDetail;
  busy: boolean;
  showKey: boolean;
  onToggleKey: () => void;
  onToCorrection: () => void;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const { t } = useLanguage();
  const s = detail.session;
  const left = detail.pendingReviewCount ?? 0;
  const openResults = () => router.push({ pathname: '/study/results/[id]', params: { id: s.id } });
  // RG-ETU-08 / D-ETU-09 (JP 21/10) : en CORRECTION, le téléphone du dirigeant (répondant lui aussi,
  // D-ETU-06) est entre les mains d'un voisin — pas de lien vers les copies des autres (réponses
  // personnelles, ajustement des points). Le panneau ne garde que les avis restants et *Terminer*
  // (plan §6.3) ; les résultats restent accessibles avant (REPONSES_OUVERTES) et après (TERMINEE).
  const resultsOpen = s.status !== 'CORRECTION';
  return (
    <Card style={styles.leaderCard}>
      <View style={styles.leaderHead}>
        <Label style={{ color: colors.mossSoft }}>{t('study.leader.panel')}</Label>
        {resultsOpen && (
          <Pressable onPress={openResults} hitSlop={8}>
            <Text style={styles.link}>{t('study.leader.results')}</Text>
          </Pressable>
        )}
      </View>

      {s.status === 'REPONSES_OUVERTES' && (
        <>
          {/* RG-ETU-14b : le nombre de répondants est réservé au dirigeant (`copyCount`). */}
          <Text style={styles.leaderStat}>{t('study.leader.respondents', { count: s.copyCount })}</Text>
          <Pressable onPress={onToggleKey} hitSlop={6} style={styles.toggle}>
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.moss} />
            <Text style={styles.link}>{showKey ? t('study.leader.hideKey') : t('study.leader.showKey')}</Text>
          </Pressable>
          <Button label={t('study.leader.toCorrection')} onPress={onToCorrection} loading={busy} fullWidth height={48} style={{ marginTop: 12 }} />
          <Button label={t('study.leader.cancel')} variant="danger" onPress={onCancel} disabled={busy} fullWidth height={44} style={{ marginTop: 8 }} />
        </>
      )}

      {s.status === 'CORRECTION' && (
        <>
          <Text style={styles.leaderStat}>
            {left > 0 ? t('study.leader.reviewsLeft', { count: left }) : t('study.leader.reviewsDone')}
          </Text>
          <Text style={styles.leaderHint}>{t('study.leader.respondents', { count: s.copyCount })}</Text>
          <Button label={t('study.leader.finish')} onPress={onFinish} loading={busy} fullWidth height={48} style={{ marginTop: 12 }} />
        </>
      )}

      {s.status === 'TERMINEE' && (
        <Text style={styles.leaderStat}>{t('study.leader.finished', { count: s.copyCount })}</Text>
      )}
    </Card>
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
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 15, color: colors.ink2, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 6 },
  meta: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  pill: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    overflow: 'hidden',
  },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  offline: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.earth + '1A',
  },
  offlineText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  counter: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginBottom: 10 },
  counterText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  written: { marginTop: 14, marginBottom: 10, fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  hint: { marginTop: 14, marginBottom: 10, fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  notice: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  leaderCard: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  leaderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leaderStat: { marginTop: 8, fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  leaderHint: { marginTop: 2, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3 },
  toggle: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  link: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.moss },
  scoreCard: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 20, alignItems: 'flex-start' },
  scoreBig: { marginTop: 6, fontFamily: fonts.serif, fontSize: 44, color: colors.moss, letterSpacing: -0.6 },
  scoreEmpty: { marginTop: 8, fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 16, color: colors.ink3 },
});
