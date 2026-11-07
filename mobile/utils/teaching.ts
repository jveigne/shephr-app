import type { TeachingBlock, TeachingRun } from '@/services/assemblyApi';

type Translate = (key: string, options?: any) => string;

/** Texte brut d'une suite de runs. */
export function runsText(runs: TeachingRun[] | null | undefined): string {
  return (runs ?? []).map((r) => r.text).join('');
}

/** Résumé de l'ouverture (maquette Enseignement, écran 3) : celui du chapitre, sinon son premier paragraphe. */
export function chapterSummary(summary: string | null | undefined, blocks: TeachingBlock[]): string {
  const own = summary?.trim();
  if (own) return own;
  return runsText(blocks.find((b) => b.type === 'p')?.runs).trim();
}

/** Contrat §3.3 : le chapitre 0 est l'introduction, jamais « Chapitre 0 ». */
export function chapterTitle(chapter: { number: number; title: string | null }, t: Translate): string {
  if (chapter.title?.trim()) return chapter.title;
  return chapter.number === 0 ? t('teaching.course.introduction') : t('teaching.chapter.short', { number: chapter.number });
}

/** En-tête de la lecture : « Chapitre 1 », ou « Introduction » pour le chapitre 0. */
export function chapterShortLabel(number: number, t: Translate): string {
  return number === 0 ? t('teaching.course.introduction') : t('teaching.chapter.short', { number });
}

/** Durée affichée d'une vidéo, en minutes entières, null sans durée connue. */
export function videoMinutes(durationSeconds: number | null | undefined): number | null {
  if (durationSeconds == null) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
}
