import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StudyAnswerInput, StudySessionDetail } from '@/services/assemblyApi';

/**
 * D-ETU-11 (JP 21/10) — BROUILLON d'une copie d'étude, hors ligne compris.
 *
 * <p>Le téléphone garde, par compte ET par séance (`shephr.studyDraft.v1.{userId}.{sessionId}`), la
 * dernière saisie de chaque question avec son `answeredAt` (horloge du téléphone, RG-ETU-04), et la
 * liste des questions pas encore accusées par le serveur. L'écran envoie ce lot par
 * `PUT …/my-answers` : upsert par question, rejouer donne le même état — d'où **ni** file
 * générique (pas de généralisation d'`eventQueue.ts`) **ni** `clientId` par réponse.
 *
 * <p>Une réponse effacée (texte blanc, aucune case, `done = false`) reste dans le brouillon jusqu'à
 * son accusé : envoyée vide, elle efface la réponse côté serveur (contrat §2.3, « décocher »).
 * Les `ignoredQuestionIds` (saisies après `correctionAt + 2 min`) sont RETIRÉES du brouillon ;
 * le brouillon entier est purgé quand la séance est `TERMINEE` (ou n'existe plus).
 *
 * <p>D-ETU-11 (JP 21/10, « hors ligne compris ») : la même clé garde aussi le DERNIER détail de la
 * séance reçu du serveur (`session`, jamais `TERMINEE`). Un membre dont l'OS a tué l'app, qui rouvre
 * la séance sans réseau, retrouve ainsi les questions et continue à répondre ; la séance relue au
 * retour du réseau le remplace. Purgé avec le brouillon.
 *
 * <p>D-ETU-44 (JP 23/10) : RATTRAPAGE à la maison — la même clé sert à la copie de rattrapage d'une
 * séance `TERMINEE` (seule exception au « jamais `TERMINEE` » ci-dessus) : brouillon et séance
 * gardés jusqu'à « Envoyer ma copie » (ou la fermeture de la fenêtre, D-ETU-45), puis purgés.
 */

export interface StudyDraftAnswer {
  questionId: string;
  valueText: string | null;
  valueOptions: string[] | null;
  done: boolean | null;
  /** ISO — horloge du téléphone au moment de la saisie. */
  answeredAt: string;
}

export interface StudyDraft {
  /** Dernière saisie locale, par question. */
  answers: Record<string, StudyDraftAnswer>;
  /** Questions saisies et pas encore accusées par le serveur. */
  pending: string[];
  /** Dernier détail de la séance reçu (D-ETU-11, réouverture hors ligne) ; absent si jamais reçu. */
  session?: StudySessionDetail | null;
}

const KEY_PREFIX = 'shephr.studyDraft.v1';

export const emptyStudyDraft = (): StudyDraft => ({ answers: {}, pending: [] });

export function studyDraftKey(userId: string, sessionId: string): string {
  return `${KEY_PREFIX}.${userId}.${sessionId}`;
}

/** Réponse vide = effacement (contrat §2.3). */
export function isEmptyStudyAnswer(a: Pick<StudyDraftAnswer, 'valueText' | 'valueOptions' | 'done'>): boolean {
  return !a.valueText?.trim() && !(a.valueOptions && a.valueOptions.length > 0) && !a.done;
}

/** Écritures sérialisées (lecture-modification-écriture), comme `services/documentReadCache`. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

export async function loadStudyDraft(userId: string, sessionId: string): Promise<StudyDraft> {
  await chain.catch(() => undefined);
  try {
    const raw = await AsyncStorage.getItem(studyDraftKey(userId, sessionId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.answers && Array.isArray(parsed.pending)) {
      const draft = parsed as StudyDraft;
      // Détail illisible (format d'une version antérieure) : on garde les réponses, sans lui.
      const cached = draft.session;
      const usable = !!cached && typeof cached === 'object' && !!cached.session && Array.isArray(cached.questions);
      return usable ? draft : { answers: draft.answers, pending: draft.pending };
    }
  } catch {
    // Brouillon illisible : on repart de la copie du serveur.
  }
  return emptyStudyDraft();
}

/** `true` si le brouillon est bien sur le téléphone (« enregistré ✓ »). */
export function saveStudyDraft(userId: string, sessionId: string, draft: StudyDraft): Promise<boolean> {
  return serial(async () => {
    try {
      await AsyncStorage.setItem(studyDraftKey(userId, sessionId), JSON.stringify(draft));
      return true;
    } catch {
      return false;
    }
  }).catch(() => false);
}

/** Séance TERMINEE ou disparue (annulée, D-ETU-22) : plus rien à envoyer. */
export function purgeStudyDraft(userId: string, sessionId: string): Promise<void> {
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(studyDraftKey(userId, sessionId));
    } catch {
      // ignore
    }
  }).catch(() => undefined);
}

/** Pose la saisie d'une question (horodatée maintenant) et la marque à envoyer. */
export function setDraftAnswer(
  draft: StudyDraft,
  answer: Omit<StudyDraftAnswer, 'answeredAt'>,
): StudyDraft {
  const entry: StudyDraftAnswer = { ...answer, answeredAt: new Date().toISOString() };
  return {
    ...draft,
    answers: { ...draft.answers, [answer.questionId]: entry },
    pending: draft.pending.includes(answer.questionId) ? draft.pending : [...draft.pending, answer.questionId],
  };
}

/** Le lot à envoyer : les saisies non accusées (une réponse vide efface, contrat §2.3). */
export function pendingStudyInputs(draft: StudyDraft): StudyAnswerInput[] {
  return draft.pending
    .map((id) => draft.answers[id])
    .filter((a): a is StudyDraftAnswer => !!a)
    .map((a) => ({
      questionId: a.questionId,
      valueText: a.valueText?.trim() ? a.valueText : null,
      valueOptions: a.valueOptions && a.valueOptions.length ? a.valueOptions : null,
      done: a.done ?? null,
      answeredAt: a.answeredAt,
    }));
}

/**
 * Accusé d'un lot : les questions envoyées et NON ressaisies depuis (même `answeredAt`) sortent de
 * `pending` — une effacée sort aussi de `answers` (le serveur n'a plus de ligne) ; les
 * `ignoredQuestionIds` sont retirées du brouillon (RG-ETU-04).
 */
export function acknowledgeStudyDraft(
  draft: StudyDraft,
  sent: StudyAnswerInput[],
  ignoredQuestionIds: string[],
): StudyDraft {
  const answers = { ...draft.answers };
  let pending = [...draft.pending];
  for (const s of sent) {
    const cur = answers[s.questionId];
    if (!cur || cur.answeredAt !== s.answeredAt) continue; // ressaisie pendant l'envoi : reste à envoyer
    pending = pending.filter((id) => id !== s.questionId);
    if (isEmptyStudyAnswer(cur)) delete answers[s.questionId];
  }
  for (const id of ignoredQuestionIds) {
    delete answers[id];
    pending = pending.filter((p) => p !== id);
  }
  return { ...draft, answers, pending };
}
