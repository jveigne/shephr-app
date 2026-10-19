/**
 * Texte du compte rendu de réunion d'assemblée — plan 23/09, §5.4 (lot L5).
 *
 * Généré CÔTÉ CLIENT, identique web et mobile, au caractère près du modèle fourni par JP :
 *
 *   CR Assemblée 20/09/2026
 *   *Assemblée de maison : Angers
 *
 *    - Nombre de frères présents  : 5
 *   * Ammiel
 *   * Beni
 *
 *
 *   Ce qui a été fait:
 *
 *   - Fraction de pain: Oui
 *   - Lecture du livre L'église de maison…, chapitre 13
 *
 * Fonction PURE : aucune dépendance React, la traduction est injectée (`t`). Les libellés vivent
 * dans `assemblyLife.report.*` (fr = modèle ci-dessus, espaces compris ; en = traduction).
 * - D-ASM-14 (JP 23/09) : `includeAttendees = false` omet la liste, la ligne du nombre reste.
 * - [HYPOTHÈSE §5.4] présents en ordre alphabétique.
 * - Le `*` de la 2ᵉ ligne ouvre un gras WhatsApp sans le fermer : reproduit tel quel (❓ JP).
 * - Module à parties (JP 24/09) : chaque groupe est préfixé de sa partie —
 *   « partie 2, chapitres 12 et 13 » ; plusieurs parties : « partie 1, chapitre 20 ; partie 2, chapitre 1 ».
 */

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface MeetingReportInput {
  /** 'yyyy-MM-dd' (LocalDate backend). */
  meetingDate: string;
  unitName: string;
  /** Noms des présents (instantané RG-ASM-07) — l'ordre est recalculé ici. */
  attendeeNames: string[];
  breadBreaking: boolean;
  /** Titre du livre du module lu ; null ou chapitres vides = pas de ligne « Lecture ». */
  bookTitle: string | null;
  /** Chapitres lus ; groupés par partie, triés et dédoublonnés à la génération. */
  chapters: ChapterRef[];
}

/** Un chapitre lu : sa partie (null si le module n'a pas de parties) et son numéro dans la partie. */
export interface ChapterRef {
  partNumber: number | null;
  number: number;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' (sans passer par Date : aucun décalage de fuseau). */
export function formatReportDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/**
 * `chapitre 13` / `chapitres 12 et 13` / `chapitres 12, 13 et 14`.
 * Lot L9 (JP 23/09) : numéros dédoublonnés et triés numériquement, comme le générateur web
 * (web/src/utils/meetingReport.ts) — les deux surfaces produisent le même texte au caractère près.
 */
function formatNumbers(input: number[], t: Translate): string {
  const numbers = Array.from(new Set(input)).sort((a, b) => a - b);
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return t('assemblyLife.report.chapterOne', { n: numbers[0] });
  const head = numbers.slice(0, -1).join(t('assemblyLife.report.chapterSep'));
  const last = numbers[numbers.length - 1];
  return t('assemblyLife.report.chapterMany', { list: head, last });
}

/**
 * Sans parties : `chapitres 12 et 13`. Avec parties : `partie 2, chapitres 12 et 13`, et
 * `partie 1, chapitre 20 ; partie 2, chapitre 1` quand la lecture en couvre plusieurs.
 */
export function formatChapters(chapters: ChapterRef[], t: Translate): string {
  const byPart = new Map<number | null, number[]>();
  for (const c of chapters) byPart.set(c.partNumber, [...(byPart.get(c.partNumber) ?? []), c.number]);
  const parts = Array.from(byPart.keys()).sort((a, b) => (a ?? 0) - (b ?? 0));
  return parts
    .map((part) => {
      const text = formatNumbers(byPart.get(part)!, t);
      return part == null ? text : t('assemblyLife.report.partGroup', { n: part, chapters: text });
    })
    .join(t('assemblyLife.report.partSep'));
}

export function buildMeetingReport(
  input: MeetingReportInput,
  includeAttendees: boolean,
  t: Translate,
): string {
  const names = [...input.attendeeNames].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const lines: string[] = [
    t('assemblyLife.report.header', { date: formatReportDate(input.meetingDate) }),
    t('assemblyLife.report.unitLine', { name: input.unitName }),
    '',
    t('assemblyLife.report.attendeeCount', { n: names.length }),
  ];
  if (includeAttendees) {
    for (const name of names) lines.push(`* ${name}`);
  }
  lines.push(
    '',
    '',
    t('assemblyLife.report.done'),
    '',
    t('assemblyLife.report.breadBreaking', {
      value: t(input.breadBreaking ? 'assemblyLife.report.yes' : 'assemblyLife.report.no'),
    }),
  );
  if (input.bookTitle && input.chapters.length > 0) {
    lines.push(
      t('assemblyLife.report.reading', {
        book: input.bookTitle,
        chapters: formatChapters(input.chapters, t),
      }),
    );
  }
  return lines.join('\n');
}

/**
 * Affichage écran d'une date 'yyyy-MM-dd' (« 20 septembre 2026 »), mois traduits via
 * `common.monthsLong` — hors texte du CR, qui garde `dd/MM/yyyy`.
 */
export function fmtIsoDay(isoDate: string, t: Translate): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = t('common.monthsLong').split(',');
  if (!y || !m || !d || !months[m - 1]) return isoDate;
  return `${d} ${months[m - 1]} ${y}`;
}
