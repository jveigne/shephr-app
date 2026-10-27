import type { StudyAnswerInput } from '../services/assemblyApi';

/**
 * D-ETU-11 (JP 21/10) / D-WEB-02 (JP 27/10) — BROUILLON d'une copie d'étude sur le web, port de
 * `mobile/services/studyDraft.ts` sur `localStorage`.
 *
 * Le poste garde, par compte ET par séance (`shephr.studyDraft.v1.{userId}.{sessionId}`), la
 * dernière saisie de chaque question avec son `answeredAt` (horloge du poste, RG-ETU-04), et la
 * liste des questions pas encore accusées par le serveur. La page envoie ce lot par
 * `PUT …/my-answers` : upsert par question, rejouer donne le même état — ni file ni `clientId`.
 *
 * Une réponse effacée reste dans le brouillon jusqu'à son accusé : envoyée vide, elle efface la
 * réponse côté serveur (contrat §2.3). Les `ignoredQuestionIds` sont RETIRÉES du brouillon ; le
 * brouillon est purgé à `TERMINEE` (hors rattrapage, D-ETU-44), après l'envoi d'un rattrapage, après
 * annulation (D-ETU-22) et sur 404.
 *
 * `localStorage` peut manquer ou lever (navigation privée, données bloquées) : TOUTES les lectures et
 * écritures sont sous `try/catch`, la page marche sans (le brouillon vit alors en mémoire seule).
 * Pas de détail de séance gardé ici (contrairement au mobile, D-ETU-11 « hors ligne compris ») : un
 * navigateur rouvert sans réseau ne charge de toute façon pas l'application.
 */

export interface StudyDraftAnswer {
  questionId: string;
  valueText: string | null;
  valueOptions: string[] | null;
  done: boolean | null;
  /** ISO — horloge du poste au moment de la saisie. */
  answeredAt: string;
}

export interface StudyDraft {
  /** Dernière saisie locale, par question. */
  answers: Record<string, StudyDraftAnswer>;
  /** Questions saisies et pas encore accusées par le serveur. */
  pending: string[];
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

export function loadStudyDraft(userId: string, sessionId: string): StudyDraft {
  try {
    const raw = window.localStorage.getItem(studyDraftKey(userId, sessionId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.answers && typeof parsed.answers === 'object' && Array.isArray(parsed.pending)) {
      return { answers: parsed.answers as StudyDraft['answers'], pending: (parsed.pending as unknown[]).filter((x): x is string => typeof x === 'string') };
    }
  } catch {
    // Brouillon illisible ou stockage indisponible : on repart de la copie du serveur.
  }
  return emptyStudyDraft();
}

/** `true` si le brouillon est bien sur le poste. */
export function saveStudyDraft(userId: string, sessionId: string, draft: StudyDraft): boolean {
  try {
    window.localStorage.setItem(studyDraftKey(userId, sessionId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function purgeStudyDraft(userId: string, sessionId: string): void {
  try {
    window.localStorage.removeItem(studyDraftKey(userId, sessionId));
  } catch {
    // ignore
  }
}

/** Pose la saisie d'une question (horodatée maintenant) et la marque à envoyer. */
export function setDraftAnswer(draft: StudyDraft, answer: Omit<StudyDraftAnswer, 'answeredAt'>): StudyDraft {
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
 * `pending` — une effacée sort aussi de `answers` ; les `ignoredQuestionIds` sont retirées (RG-ETU-04).
 */
export function acknowledgeStudyDraft(draft: StudyDraft, sent: StudyAnswerInput[], ignoredQuestionIds: string[]): StudyDraft {
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
  return { answers, pending };
}

/** Retire des questions du brouillon (refus définitif, ou hors plage en rattrapage). */
export function dropFromStudyDraft(draft: StudyDraft, questionIds: string[]): StudyDraft {
  if (questionIds.length === 0) return draft;
  const answers = { ...draft.answers };
  for (const id of questionIds) delete answers[id];
  return { answers, pending: draft.pending.filter((id) => !questionIds.includes(id)) };
}
