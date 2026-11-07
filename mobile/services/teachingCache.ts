import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeTeachingChapter,
  isTeachingRefusal,
  putTeachingProgress,
  uncompleteTeachingChapter,
  type TeachingChapterContent,
  type TeachingCourseDetail,
  type TeachingCourseSummary,
} from '@/services/assemblyApi';

/**
 * Lot « FIN » (JP 06/11, contrat 06/11 §11.1) — l'enseignement HORS LIGNE sur l'appareil, lié au COMPTE, jamais au jeton.
 *
 * <p>Deux choses, en AsyncStorage :
 * <ul>
 *   <li>le dernier texte lu, `shephr.teaching.v1.{userId}.{chapterId}` (+ `.courses`, `.course.{id}` pour rouvrir le
 *       parcours sans réseau) : une panne ou une session expirée ne l'efface pas, seul un refus du serveur le fait ;</li>
 *   <li>la file d'avancement, `shephr.teaching.pending.v1.{userId}` : position et « J'ai terminé » de chaque chapitre,
 *       la dernière valeur seulement (écritures idempotentes, contrat §5.5 à §5.7). Vidée au retour du réseau et au retour
 *       au premier plan (`TeachingProgressSync`). Un refus du serveur abandonne l'écriture (contrat §5.5, `isTeachingRefusal`).</li>
 * </ul>
 * La taille du texte est un réglage de l'appareil, pas du compte (contrat §11.1).
 */

/** Borne du nombre de chapitres gardés (les plus récents), comme `documentReadCache`. */
const MAX_CHAPTERS = 60;
const FONT_SIZE_KEY = 'shephr.teaching.fontSize.v1';

const key = (userId: string, suffix: string) => `shephr.teaching.v1.${userId}.${suffix}`;
const pendingKey = (userId: string) => `shephr.teaching.pending.v1.${userId}`;
const indexSuffix = 'index';

/** Écritures sérialisées (lecture-modification-écriture), comme `services/studyDraft`. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function readJson<T>(storageKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Stockage plein : le hors ligne n'est qu'un confort, jamais une erreur montrée. */
async function writeJson(storageKey: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // voir ci-dessus
  }
}

async function removeKey(storageKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch {
    // voir ci-dessus
  }
}

// ─── Texte et parcours ───────────────────────────────────────────────────────────────────────────

export function readCachedCourses(userId: string): Promise<TeachingCourseSummary[] | null> {
  return readJson<TeachingCourseSummary[]>(key(userId, 'courses'));
}

export function writeCachedCourses(userId: string, courses: TeachingCourseSummary[]): Promise<void> {
  return writeJson(key(userId, 'courses'), courses);
}

export function readCachedCourse(userId: string, id: string): Promise<TeachingCourseDetail | null> {
  return readJson<TeachingCourseDetail>(key(userId, `course.${id}`));
}

export function writeCachedCourse(userId: string, course: TeachingCourseDetail): Promise<void> {
  return writeJson(key(userId, `course.${course.id}`), course);
}

export function removeCachedCourse(userId: string, id: string): Promise<void> {
  return removeKey(key(userId, `course.${id}`));
}

export function readCachedChapter(userId: string, chapterId: string): Promise<TeachingChapterContent | null> {
  return readJson<TeachingChapterContent>(key(userId, chapterId));
}

export function writeCachedChapter(userId: string, chapter: TeachingChapterContent): Promise<void> {
  return serial(async () => {
    await writeJson(key(userId, chapter.id), chapter);
    const index = (await readJson<string[]>(key(userId, indexSuffix))) ?? [];
    const next = [chapter.id, ...index.filter((id) => id !== chapter.id)];
    await Promise.all(next.slice(MAX_CHAPTERS).map((id) => removeKey(key(userId, id))));
    await writeJson(key(userId, indexSuffix), next.slice(0, MAX_CHAPTERS));
  });
}

export function removeCachedChapter(userId: string, chapterId: string): Promise<void> {
  return serial(() => removeKey(key(userId, chapterId)));
}

/** Position et fin de lecture du texte gardé, à la sortie de l'écran : une relecture hors ligne reprend au bon bloc. */
export function updateCachedChapterProgress(
  userId: string,
  chapterId: string,
  change: { position: number; completed: boolean },
): Promise<void> {
  return serial(async () => {
    const cached = await readJson<TeachingChapterContent>(key(userId, chapterId));
    if (!cached) return;
    const now = new Date().toISOString();
    await writeJson(key(userId, chapterId), {
      ...cached,
      progress: {
        position: change.position,
        lastOpenedAt: now,
        completedAt: change.completed ? (cached.progress?.completedAt ?? now) : null,
      },
    });
  });
}

// ─── Taille du texte ─────────────────────────────────────────────────────────────────────────────

export async function readReaderFontSize(): Promise<number | null> {
  const value = await readJson<number>(FONT_SIZE_KEY);
  return typeof value === 'number' ? value : null;
}

export function writeReaderFontSize(size: number): Promise<void> {
  return writeJson(FONT_SIZE_KEY, size);
}

// ─── File d'avancement ───────────────────────────────────────────────────────────────────────────

export interface TeachingPendingEntry {
  position?: number;
  /** true = `PUT …/complete`, false = `DELETE …/complete` ; absent = rien à envoyer. */
  complete?: boolean;
}

type PendingStore = Record<string, TeachingPendingEntry>;

export async function readPendingProgress(userId: string): Promise<PendingStore> {
  await chain.catch(() => undefined);
  const store = await readJson<PendingStore>(pendingKey(userId));
  return store && typeof store === 'object' ? store : {};
}

function enqueue(userId: string, chapterId: string, change: TeachingPendingEntry): Promise<void> {
  return serial(async () => {
    const store = (await readJson<PendingStore>(pendingKey(userId))) ?? {};
    store[chapterId] = { ...store[chapterId], ...change };
    await writeJson(pendingKey(userId), store);
  });
}

/** Retire une entrée envoyée, sauf si une saisie plus récente l'a changée entre-temps. */
function settle(userId: string, chapterId: string, sent: TeachingPendingEntry): Promise<void> {
  return serial(async () => {
    const store = (await readJson<PendingStore>(pendingKey(userId))) ?? {};
    if (JSON.stringify(store[chapterId]) !== JSON.stringify(sent)) return;
    delete store[chapterId];
    await writeJson(pendingKey(userId), store);
  });
}

async function drain(userId: string, token: string | null): Promise<void> {
  const store = (await readJson<PendingStore>(pendingKey(userId))) ?? {};
  for (const [chapterId, entry] of Object.entries(store)) {
    try {
      if (entry.position != null) await putTeachingProgress(chapterId, entry.position, token);
      if (entry.complete === true) await completeTeachingChapter(chapterId, token);
      else if (entry.complete === false) await uncompleteTeachingChapter(chapterId, token);
      await settle(userId, chapterId, entry);
    } catch (e) {
      // Contrat §5.5 : un refus abandonne l'écriture (un 400 / 422 ne passerait pas davantage au prochain essai). Panne,
      // 401, 429 ou jeton refusé (403 sans code) : tout reste en file, sans insister contre le serveur.
      if (!isTeachingRefusal(e)) return;
      await settle(userId, chapterId, entry);
    }
  }
}

/** Vidages l'un après l'autre : deux envois de la même entrée ne se croisent jamais. */
let flushes: Promise<void> = Promise.resolve();

/** Vide la file du compte ; ne lève jamais. `token` : le jeton de CE compte (voir `apiClient`). */
export function flushTeachingProgress(userId: string, token: string | null): Promise<void> {
  flushes = flushes.then(() => drain(userId, token)).catch(() => undefined);
  return flushes;
}

/** Envoi différé de la position (contrat §5.5) : d'abord écrite sur l'appareil, puis envoyée. */
export async function recordTeachingPosition(
  userId: string,
  token: string | null,
  chapterId: string,
  position: number,
): Promise<void> {
  await enqueue(userId, chapterId, { position });
  await flushTeachingProgress(userId, token);
}

/** « J'ai terminé » ou son annulation : gardé sur l'appareil si le réseau manque. */
export async function recordTeachingComplete(
  userId: string,
  token: string | null,
  chapterId: string,
  complete: boolean,
): Promise<void> {
  await enqueue(userId, chapterId, { complete });
  await flushTeachingProgress(userId, token);
}

/** Le parcours affiche aussi ce qui attend le réseau : « J'ai terminé » hors ligne ne disparaît pas au retour à la liste. */
export function applyPendingToCourse(course: TeachingCourseDetail, pending: PendingStore): TeachingCourseDetail {
  const chapters = course.chapters.map((c) => {
    const change = pending[c.id]?.complete;
    if (change == null || !c.available) return c;
    const now = new Date().toISOString();
    return {
      ...c,
      progress: {
        position: c.progress?.position ?? 0,
        lastOpenedAt: c.progress?.lastOpenedAt ?? now,
        completedAt: change ? (c.progress?.completedAt ?? now) : null,
      },
    };
  });
  return { ...course, chapters, completedCount: chapters.filter((c) => c.available && c.progress?.completedAt).length };
}
