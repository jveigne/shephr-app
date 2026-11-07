import { useCallback, useEffect, useRef } from 'react';
import { putTeachingProgress, type TeachingBlock, type TeachingChapterContent, type TeachingVideoRef } from '../services/assemblyApi';

// ---------------------------------------------------------------------------------------------
//  Lecture d'un chapitre — lot « FIN » (D-FIN-07 / D-FIN-13, JP 06/11 ; contrat §5.5).
//  Position et taille de texte mémorisées dans `localStorage`, toujours sous try/catch : le stockage
//  peut manquer (navigation privée, données effacées) et la page reste correcte sans lui. Le serveur
//  garde la position qui fait foi sur les autres appareils ; le local ne sert qu'à ne pas perdre les
//  dernières secondes quand le dernier envoi n'a pas abouti.
// ---------------------------------------------------------------------------------------------

/** §5.5 : au plus un envoi toutes les 10 s pendant la lecture, plus un à la sortie de l'écran. */
const SEND_INTERVAL_MS = 10_000;

const FONT_KEY = 'shephr.teaching.fontStep.v1';
const positionKey = (userId: string, chapterId: string) => `shephr.teaching.position.v1.${userId}.${chapterId}`;

/** Tailles du texte de lecture (px) ; la maquette écrit en 16 px, l'étape par défaut. */
export const FONT_STEPS = [14, 16, 18, 20, 22] as const;
const DEFAULT_FONT_STEP = 1;

function clampStep(step: number): number {
  return Math.max(0, Math.min(FONT_STEPS.length - 1, step));
}

export function readFontStep(): number {
  try {
    const raw = window.localStorage.getItem(FONT_KEY);
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isNaN(n) ? DEFAULT_FONT_STEP : clampStep(n);
  } catch {
    return DEFAULT_FONT_STEP;
  }
}

export function writeFontStep(step: number): void {
  try {
    window.localStorage.setItem(FONT_KEY, String(clampStep(step)));
  } catch {
    // Stockage indisponible : la taille vaut pour cette page seulement.
  }
}

function writeLocalPosition(userId: string, chapterId: string, position: number): void {
  try {
    window.localStorage.setItem(positionKey(userId, chapterId), JSON.stringify({ position, at: Date.now() }));
  } catch {
    // Stockage indisponible : le serveur garde la position.
  }
}

/**
 * Position de départ : celle du serveur, sauf si l'appareil en tient une plus récente que le dernier
 * envoi connu du serveur (sortie sans réseau). Bornée au dernier bloc : le contenu a pu changer.
 */
export function resolveInitialPosition(userId: string | undefined, chapter: TeachingChapterContent): number {
  const last = Math.max(0, chapter.blocks.length - 1);
  let position = chapter.progress?.position ?? 0;
  if (userId) {
    try {
      const raw = window.localStorage.getItem(positionKey(userId, chapter.id));
      const local = raw ? (JSON.parse(raw) as { position?: unknown; at?: unknown }) : null;
      const serverAt = chapter.progress ? Date.parse(chapter.progress.lastOpenedAt) : 0;
      if (local && typeof local.position === 'number' && typeof local.at === 'number' && local.at > serverAt) {
        position = local.position;
      }
    } catch {
      // Valeur illisible ou stockage indisponible : position du serveur.
    }
  }
  return Math.max(0, Math.min(last, position));
}

/**
 * Envoi différé de la position (§5.5). L'ouverture du chapitre s'enregistre par un premier envoi
 * (§5.4). 403 ou 404 : on abandonne, l'écriture n'a plus d'objet. Toute autre erreur (réseau, 5xx) :
 * on réessaie au prochain passage. `report` ne fait qu'enregistrer la position, sans réseau.
 */
export function useTeachingProgressSync(
  userId: string | undefined,
  chapterId: string,
  initialPosition: number,
  onLeave: () => void,
): { report: (position: number) => void; current: () => number } {
  const position = useRef(initialPosition);
  const sent = useRef<number | null>(null);
  const sending = useRef<Promise<void> | null>(null);
  const abandoned = useRef(false);
  const leave = useRef(onLeave);
  leave.current = onLeave;

  const flush = useCallback((): Promise<void> => {
    if (sending.current) return sending.current;
    if (abandoned.current || sent.current === position.current) return Promise.resolve();
    const value = position.current;
    const request = putTeachingProgress(chapterId, value)
      .then(() => {
        sent.current = value;
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403 || status === 404) abandoned.current = true;
      })
      .finally(() => {
        sending.current = null;
      });
    sending.current = request;
    return request;
  }, [chapterId]);

  useEffect(() => {
    void flush();
    const timer = window.setInterval(() => void flush(), SEND_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      // Sortie de l'écran : le dernier envoi d'abord (un envoi en cours est attendu, puis complété), la
      // relecture du parcours (`onLeave`) ensuite.
      void flush()
        .then(flush)
        .finally(() => leave.current());
    };
  }, [flush]);

  const report = useCallback(
    (next: number) => {
      if (next === position.current) return;
      position.current = next;
      if (userId) writeLocalPosition(userId, chapterId, next);
    },
    [userId, chapterId],
  );
  const current = useCallback(() => position.current, []);
  return { report, current };
}

/** Durée d'une vidéo en minutes entières (au moins 1) ; null si le navigateur ne l'a pas fournie au dépôt. */
export function videoMinutes(video: TeachingVideoRef | null | undefined): number | null {
  if (!video || video.durationSeconds == null) return null;
  return Math.max(1, Math.ceil(video.durationSeconds / 60));
}

/**
 * Résumé de l'ouverture (maquette Enseignement, écran 3 ; parité D-WEB-01 avec `mobile/utils/teaching.ts`) : celui du
 * chapitre, sinon son premier paragraphe. L'import du 06/11 n'en porte pas pour l'introduction ni les chapitres 17 et 27.
 */
export function chapterSummary(summary: string | null | undefined, blocks: TeachingBlock[]): string {
  const own = summary?.trim();
  if (own) return own;
  return (blocks.find((b) => b.type === 'p')?.runs ?? []).map((r) => r.text).join('').trim();
}
