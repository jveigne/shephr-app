// ---------------------------------------------------------------------------------------------
//  Texte copiable du compte rendu de réunion (§5.4 du plan Vie d'assemblée, JP 23/09).
//
//  Fonction PURE : aucune dépendance React ni réseau — la traduction est injectée (`t`), ce qui
//  permet de la relire et de la tester isolément. Le modèle fr de référence, à reproduire AU
//  CARACTÈRE PRÈS (espaces compris), est porté par les clés `assembly.report.*` de fr.json :
//
//      CR Assemblée 20/09/2026
//      *Assemblée de maison : Angers
//
//       - Nombre de frères présents  : 5
//      * Ammiel
//      * Beni
//      * Janvierthe
//      * Isaac-Moise
//      * Elsa Segoulin
//
//
//      Ce qui a été fait:
//
//      - Fraction de pain: Oui
//      - Lecture du livre L'église de maison dans les desseins éternels de Dieu, chapitre 13
//
//  Règles :
//    - date dd/MM/yyyy ; nom de l'assemblée = nom de l'unité ;
//    - présents par ordre alphabétique [HYPOTHÈSE §5.4] ; bloc des noms omis si l'option
//      « inclure la liste des présents » est décochée (D-ASM-14) — la ligne du nombre reste ;
//    - lecture : « chapitre 13 » / « chapitres 12 et 13 » / « chapitres 12, 13 et 14 »,
//      ligne omise sans chapitre lu ;
//    - module à parties (JP 24/09) : chaque groupe est préfixé de sa partie —
//      « partie 2, chapitres 12 et 13 » ; plusieurs parties : « partie 1, chapitre 20 ; partie 2, chapitre 1 » ;
//    - « *Assemblée de maison » ouvre un gras WhatsApp sans le fermer : reproduit tel quel
//      (❓ à confirmer JP, §5.4).
// ---------------------------------------------------------------------------------------------

/** Sous-ensemble de la signature i18next utilisé ici (interpolation `{{x}}`, sans échappement). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface MeetingReportInput {
  /** LocalDate « yyyy-MM-dd ». */
  meetingDate: string;
  unitName: string;
  /** Noms des présents (instantané RG-ASM-07 ou roster) ; l'ordre n'importe pas, on trie. */
  attendeeNames: string[];
  breadBreaking: boolean;
  /** Titre du livre du module lu ; ignoré sans chapitre. */
  bookTitle: string | null;
  /** Chapitres lus ; groupés par partie, triés et dédoublonnés ici. */
  chapters: ChapterRef[];
}

/** Un chapitre lu : sa partie (null si le module n'a pas de parties) et son numéro dans la partie. */
export interface ChapterRef {
  partNumber: number | null;
  number: number;
}

/** « 2026-09-20 » → « 20/09/2026 », sans passer par Date (pas de décalage de fuseau). */
export function formatMeetingDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

/** « chapitre 13 » / « chapitres 12 et 13 » / « chapitres 12, 13 et 14 ». */
function formatNumbers(numbers: number[], t: Translate): string {
  const nums = Array.from(new Set(numbers)).sort((a, b) => a - b);
  if (nums.length === 0) return '';
  if (nums.length === 1) return t('assembly.report.chapterOne', { n: nums[0] });
  const head = nums.slice(0, -1).join(', ');
  const last = nums[nums.length - 1];
  return t('assembly.report.chapterMany', { list: head, last });
}

/**
 * Sans parties : « chapitres 12 et 13 ». Avec parties : « partie 2, chapitres 12 et 13 », et
 * « partie 1, chapitre 20 ; partie 2, chapitre 1 » quand la lecture en couvre plusieurs.
 */
export function formatChapters(chapters: ChapterRef[], t: Translate): string {
  const byPart = new Map<number | null, number[]>();
  for (const c of chapters) byPart.set(c.partNumber, [...(byPart.get(c.partNumber) ?? []), c.number]);
  const parts = Array.from(byPart.keys()).sort((a, b) => (a ?? 0) - (b ?? 0));
  return parts
    .map((part) => {
      const text = formatNumbers(byPart.get(part)!, t);
      return part == null ? text : t('assembly.report.partGroup', { n: part, chapters: text });
    })
    .join(t('assembly.report.partSep'));
}

export function buildMeetingReport(
  input: MeetingReportInput,
  options: { includeAttendees: boolean },
  t: Translate,
): string {
  const names = [...input.attendeeNames].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const lines: string[] = [
    t('assembly.report.title', { date: formatMeetingDate(input.meetingDate) }),
    t('assembly.report.unitLine', { name: input.unitName }),
    '',
    t('assembly.report.countLine', { n: names.length }),
  ];
  if (options.includeAttendees) {
    for (const name of names) lines.push(t('assembly.report.attendeeLine', { name }));
  }
  lines.push('', '', t('assembly.report.doneTitle'), '');
  lines.push(
    t('assembly.report.breadLine', {
      value: input.breadBreaking ? t('assembly.report.yes') : t('assembly.report.no'),
    }),
  );
  const chapters = formatChapters(input.chapters, t);
  if (chapters && input.bookTitle) {
    lines.push(t('assembly.report.readingLine', { book: input.bookTitle, chapters }));
  }
  return lines.join('\n');
}
