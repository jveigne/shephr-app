/**
 * Journal PDF de l'assemblée (JP 08/10) — les comptes rendus d'une période, mis en page.
 *
 * Généré CÔTÉ CLIENT, sans endpoint dédié : la liste des réunions (`/units/{id}/meetings?year=`)
 * et le détail de chacune (`/meetings/{id}`, présents compris) suffisent, et leurs gardes de
 * lecture (RG-ASM-05) s'appliquent telles quelles. Ce module est PUR (aucune dépendance React) :
 * calcul des périodes et HTML du document ; l'écran `app/(tabs)/assembly/journal.tsx` s'occupe du
 * chargement et de l'impression (expo-print).
 *
 * - Périodicités : mois, trimestre, semestre, année civile — toujours contenues dans une seule
 *   année, d'où un seul appel de liste par période.
 * - Le texte de chaque CR reprend les briques du modèle §5.4 (`formatChapters`, Oui/Non de la
 *   fraction de pain) sans le recopier tel quel : le format WhatsApp n'a pas de sens sur papier.
 * - D-ASM-14 appliqué au journal : la liste nominative des présents est optionnelle, le nombre
 *   reste toujours.
 * - D-ASM-18 (JP 08/10) : journal CONSOLIDÉ de plusieurs assemblées (`buildConsolidatedJournalHtml`),
 *   généré depuis la Hiérarchie — que des nombres, JAMAIS la liste des présents.
 */
import type { MeetingDetail, UnitMeetingStats } from '@/services/assemblyApi';
import { colors } from '@/theme/colors';
import { aggregate, averageAttendance, isAlert } from '@/utils/assemblyHierarchyStats';
import { fmtIsoDay, formatChapters, formatReportDate, type Translate } from '@/utils/meetingReport';

export type Periodicity = 'month' | 'quarter' | 'semester' | 'year';

export const PERIODICITIES: Periodicity[] = ['month', 'quarter', 'semester', 'year'];

/** Une période : `index` = mois (0-11), trimestre (0-3), semestre (0-1) ; ignoré pour l'année. */
export interface Period {
  kind: Periodicity;
  year: number;
  index: number;
}

/** Nombre de mois couverts par chaque périodicité. */
const SPAN: Record<Periodicity, number> = { month: 1, quarter: 3, semester: 6, year: 12 };

const pad = (n: number) => String(n).padStart(2, '0');

/** Période en cours (contenant la date du jour) pour une périodicité donnée. */
export function currentPeriod(kind: Periodicity, today = new Date()): Period {
  return { kind, year: today.getFullYear(), index: Math.floor(today.getMonth() / SPAN[kind]) };
}

/** Période précédente (`delta = -1`) ou suivante (`+1`), en passant d'une année à l'autre. */
export function shiftPeriod(p: Period, delta: number): Period {
  const perYear = 12 / SPAN[p.kind];
  const abs = p.year * perYear + p.index + delta;
  return { kind: p.kind, year: Math.floor(abs / perYear), index: ((abs % perYear) + perYear) % perYear };
}

/** Bornes 'yyyy-MM-dd' incluses de la période. */
export function periodRange(p: Period): { from: string; to: string } {
  const firstMonth = p.kind === 'year' ? 0 : p.index * SPAN[p.kind];
  const lastMonth = firstMonth + SPAN[p.kind] - 1;
  const lastDay = new Date(p.year, lastMonth + 1, 0).getDate();
  return {
    from: `${p.year}-${pad(firstMonth + 1)}-01`,
    to: `${p.year}-${pad(lastMonth + 1)}-${pad(lastDay)}`,
  };
}

/** La période commence après aujourd'hui : rien à journaliser, on ne la propose pas. */
export function isFuturePeriod(p: Period, today = new Date()): boolean {
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return periodRange(p).from > todayIso;
}

/** « octobre 2026 », « 3e trimestre 2026 », « 1er semestre 2026 », « 2026 ». */
export function periodLabel(p: Period, t: Translate): string {
  switch (p.kind) {
    case 'month':
      return `${t('common.monthsLong').split(',')[p.index]} ${p.year}`;
    case 'quarter':
      return `${t('assemblyLife.journal.quarters').split(',')[p.index]} ${p.year}`;
    case 'semester':
      return `${t('assemblyLife.journal.semesters').split(',')[p.index]} ${p.year}`;
    default:
      return String(p.year);
  }
}

/** Nom de fichier sûr : « Journal-Montesson-2026-T3.pdf ». */
export function journalFileName(unitName: string, p: Period): string {
  const unit = unitName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix =
    p.kind === 'month' ? pad(p.index + 1)
      : p.kind === 'quarter' ? `T${p.index + 1}`
        : p.kind === 'semester' ? `S${p.index + 1}`
          : '';
  return `Journal-${unit || 'assemblee'}-${p.year}${suffix ? `-${suffix}` : ''}.pdf`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Feuille de style commune aux deux journaux (mono-assemblée et consolidé, D-ASM-18). */
const JOURNAL_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${colors.ink}; font-size: 11pt; margin: 0; }
  h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; font-weight: normal; margin: 0; }
  header { border-bottom: 2px solid ${colors.moss}; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 24pt; color: ${colors.moss}; }
  .sub { font-size: 12pt; color: ${colors.ink2}; margin-top: 4px; }
  .meta { font-size: 9pt; color: ${colors.ink3}; margin-top: 6px; }
  h2 { font-size: 15pt; color: ${colors.moss}; margin: 18px 0 8px; }
  .stats { display: flex; gap: 10px; }
  .stat { flex: 1; background: ${colors.paper2}; border: 1px solid ${colors.parchmentDeep}; border-radius: 8px; padding: 10px; }
  .stat-value { font-family: Georgia, serif; font-size: 18pt; color: ${colors.moss}; }
  .stat-label { font-size: 8.5pt; color: ${colors.ink3}; text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
  .readings { margin: 6px 0 0; padding-left: 18px; }
  .readings li { margin: 3px 0; }
  .muted { color: ${colors.ink3}; }
  .meeting { page-break-inside: avoid; border-top: 1px solid ${colors.parchmentDeep}; padding: 10px 0 6px; }
  h3 { font-size: 13pt; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; vertical-align: top; width: 32%; font-weight: 600; color: ${colors.ink2}; padding: 3px 8px 3px 0; font-size: 10pt; }
  td { vertical-align: top; padding: 3px 0; }
  .names { font-size: 9.5pt; color: ${colors.ink2}; margin-top: 2px; line-height: 1.45; }
`;

const stat = (value: string | number, label: string) =>
  `<div class="stat"><div class="stat-value">${esc(String(value))}</div><div class="stat-label">${esc(label)}</div></div>`;

export interface JournalInput {
  unitName: string;
  cityName: string | null;
  period: Period;
  /** Détails des réunions de la période, dans n'importe quel ordre (triés ici par date). */
  meetings: MeetingDetail[];
  includeAttendees: boolean;
  /** Date d'édition, 'yyyy-MM-dd'. */
  generatedOn: string;
  /** Langue de l'app ('fr'/'en'), pour la virgule décimale de la présence moyenne. */
  locale?: string;
}

/**
 * Document HTML du journal, prêt pour `Print.printToFileAsync` (A4) : en-tête, synthèse de la
 * période (réunions, présence moyenne, fractions de pain, lectures par livre), puis chaque CR
 * dans l'ordre chronologique.
 */
export function buildJournalHtml(input: JournalInput, t: Translate): string {
  const tj = (k: string, o?: Record<string, unknown>) => t(`assemblyLife.journal.${k}`, o);
  const meetings = [...input.meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const count = meetings.length;
  const totalPresent = meetings.reduce((s, m) => s + m.attendees.length, 0);
  const avg = count === 0 ? 0 : Math.round((totalPresent / count) * 10) / 10;
  const bread = meetings.filter((m) => m.breadBreaking).length;

  // Lectures de la période, regroupées par livre (un module = un livre).
  const readings = new Map<string, MeetingDetail['chapters']>();
  for (const m of meetings) {
    const book = m.bookTitle || m.moduleName;
    if (!book || m.chapters.length === 0) continue;
    readings.set(book, [...(readings.get(book) ?? []), ...m.chapters]);
  }

  const readingRows =
    readings.size === 0
      ? `<p class="muted">${esc(tj('noReadings'))}</p>`
      : `<ul class="readings">${Array.from(readings.entries())
          .map(([book, chapters]) => `<li><strong>${esc(book)}</strong> — ${esc(formatChapters(chapters, t))}</li>`)
          .join('')}</ul>`;

  const meetingBlocks = meetings
    .map((m) => {
      const names = m.attendees.map((a) => a.displayName).sort(byName);
      const book = m.bookTitle || m.moduleName;
      const reading =
        book && m.chapters.length > 0
          ? `${esc(book)} — ${esc(formatChapters([...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex), t))}`
          : esc(tj('noReading'));
      return `
      <section class="meeting">
        <h3>${esc(fmtIsoDay(m.meetingDate, t))}</h3>
        <table>
          <tr><th>${esc(tj('attendees'))}</th><td>${names.length}${
            input.includeAttendees && names.length > 0
              ? `<div class="names">${names.map(esc).join(' · ')}</div>`
              : ''
          }</td></tr>
          <tr><th>${esc(tj('breadBreaking'))}</th><td>${esc(
            t(m.breadBreaking ? 'assemblyLife.report.yes' : 'assemblyLife.report.no'),
          )}</td></tr>
          <tr><th>${esc(tj('reading'))}</th><td>${reading}</td></tr>
        </table>
      </section>`;
    })
    .join('');

  const subtitle = input.cityName ? `${input.unitName} · ${input.cityName}` : input.unitName;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>${JOURNAL_CSS}</style></head>
<body>
  <header>
    <h1>${esc(tj('docTitle'))}</h1>
    <div class="sub">${esc(subtitle)} — ${esc(periodLabel(input.period, t))}</div>
    <div class="meta">${esc(tj('generatedOn', { date: formatReportDate(input.generatedOn) }))}</div>
  </header>

  <h2>${esc(tj('summary'))}</h2>
  <div class="stats">
    ${stat(count, tj('statMeetings'))}
    ${stat(avg.toLocaleString(input.locale), tj('statAverage'))}
    ${stat(`${bread} / ${count}`, tj('statBread'))}
  </div>
  <h2>${esc(tj('readings'))}</h2>
  ${readingRows}

  <h2>${esc(tj('reports'))}</h2>
  ${meetingBlocks}
</body></html>`;
}

export interface ConsolidatedJournalInput {
  /** Périmètre affiché : « Toute ma hiérarchie » ou « Équipe d'un dirigeant » — jamais un nom de personne (D-ASM-18). */
  scopeLabel: string;
  period: Period;
  /** Lignes `GET /assembly/stats` des assemblées du périmètre (dédoublonnées par l'agrégat). */
  stats: UnitMeetingStats[];
  /** Détails `GET /assembly/meetings` de la période, dans n'importe quel ordre. */
  meetings: MeetingDetail[];
  /** Date d'édition, 'yyyy-MM-dd' — sert aussi de « aujourd'hui » pour l'alerte des 21 jours. */
  generatedOn: string;
  locale?: string;
}

/** Compléments de style du journal consolidé (tableau multi-colonnes, alerte terre). */
const CONSOLIDATED_CSS = `
  .stats.wrap { flex-wrap: wrap; }
  .stats.wrap .stat { flex: 1 1 30%; }
  .alert { color: ${colors.clay}; }
  .alert-list { margin: 10px 0 0; font-size: 10pt; }
  .note { font-size: 8.5pt; color: ${colors.ink3}; margin-top: 6px; }
  table.grid { font-size: 9.5pt; }
  table.grid th { width: auto; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; color: ${colors.ink3};
    border-bottom: 1px solid ${colors.parchmentDeep}; padding: 4px 6px 4px 0; }
  table.grid td { border-bottom: 1px solid ${colors.parchment}; padding: 4px 6px 4px 0; }
  table.grid .num { text-align: right; white-space: nowrap; }
  table.grid tr { page-break-inside: avoid; }
  .unit { margin-top: 14px; }
  .unit h3 { font-size: 14pt; color: ${colors.moss}; margin-bottom: 2px; page-break-after: avoid; }
  .unit h3 .city { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 10pt; color: ${colors.ink3}; }
  .unit .meeting h4 { font-family: Georgia, 'Times New Roman', serif; font-weight: normal; font-size: 11.5pt; margin: 0 0 4px; }
`;

/**
 * Journal PDF CONSOLIDÉ — D-ASM-18 (JP 08/10) : plusieurs assemblées sur une période, généré depuis
 * la Hiérarchie. En-tête, synthèse (mêmes indicateurs que le bloc de la Hiérarchie), tableau par
 * assemblée, puis les CR de chaque assemblée qui en a, dans l'ordre chronologique.
 * AUCUN NOM de personne : le nombre de présents seulement (jamais `attendees[].displayName`).
 */
export function buildConsolidatedJournalHtml(input: ConsolidatedJournalInput, t: Translate): string {
  const tj = (k: string, o?: Record<string, unknown>) => t(`assemblyLife.journal.${k}`, o);
  const th = (k: string, o?: Record<string, unknown>) => t(`assemblyLife.hierarchy.${k}`, o);
  const today = input.generatedOn;
  const agg = aggregate(input.stats.map((r) => r.unitId), new Map(input.stats.map((r) => [r.unitId, r])), today);
  const fmtAvg = (v: number | null) => (v == null ? '—' : v.toLocaleString(input.locale));

  const byUnit = new Map<string, MeetingDetail[]>();
  for (const m of input.meetings) byUnit.set(m.unitId, [...(byUnit.get(m.unitId) ?? []), m]);

  const alertList =
    agg.alertRows.length === 0
      ? ''
      : `<p class="alert-list"><span class="alert">⚠ ${esc(th('alertTitle'))}</span> — ${agg.alertRows
          .map((r) => esc(r.unitName))
          .join(' · ')}</p>`;

  const tableRows = agg.rows
    .map((r) => {
      const alert = isAlert(r, today);
      return `<tr>
        <td>${esc(r.unitName)}</td>
        <td>${esc(r.cityName ?? '—')}</td>
        <td class="num">${r.meetingCount}</td>
        <td class="num">${esc(fmtAvg(averageAttendance(r.attendanceTotal, r.meetingCount)))}</td>
        <td class="num">${r.breadBreakingCount}</td>
        <td class="num">${r.lastMeetingDate ? esc(formatReportDate(r.lastMeetingDate)) : '—'}</td>
        <td class="num alert">${alert ? '⚠' : ''}</td>
      </tr>`;
    })
    .join('');

  const unitSections = agg.rows
    .filter((r) => (byUnit.get(r.unitId)?.length ?? 0) > 0)
    .map((r) => {
      const meetings = [...byUnit.get(r.unitId)!].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
      const blocks = meetings
        .map((m) => {
          const book = m.bookTitle || m.moduleName;
          const reading =
            book && m.chapters.length > 0
              ? `${esc(book)} — ${esc(formatChapters([...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex), t))}`
              : esc(tj('noReading'));
          return `
        <section class="meeting">
          <h4>${esc(fmtIsoDay(m.meetingDate, t))}</h4>
          <table>
            <tr><th>${esc(tj('attendees'))}</th><td>${m.attendees.length}</td></tr>
            <tr><th>${esc(tj('breadBreaking'))}</th><td>${esc(
              t(m.breadBreaking ? 'assemblyLife.report.yes' : 'assemblyLife.report.no'),
            )}</td></tr>
            <tr><th>${esc(tj('reading'))}</th><td>${reading}</td></tr>
          </table>
        </section>`;
        })
        .join('');
      return `
    <div class="unit">
      <h3>${esc(r.unitName)}${r.cityName ? ` <span class="city">· ${esc(r.cityName)}</span>` : ''}</h3>
      ${blocks}
    </div>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>${JOURNAL_CSS}${CONSOLIDATED_CSS}</style></head>
<body>
  <header>
    <h1>${esc(th('docTitle'))}</h1>
    <div class="sub">${esc(input.scopeLabel)} — ${esc(periodLabel(input.period, t))}</div>
    <div class="meta">${esc(tj('generatedOn', { date: formatReportDate(input.generatedOn) }))}</div>
  </header>

  <h2>${esc(tj('summary'))}</h2>
  <div class="stats wrap">
    ${stat(agg.meetingCount, th('statMeetings'))}
    ${stat(`${agg.activeCount} / ${agg.unitCount}`, th('statActive'))}
    ${stat(agg.alertRows.length, th('statAlert'))}
    ${stat(fmtAvg(agg.average), th('statAverage'))}
    ${stat(agg.distinctAttendees, th('statDistinct'))}
    ${stat(agg.breadBreakingCount, th('statBread'))}
  </div>
  ${alertList}
  <p class="note">${esc(th('distinctNote'))}</p>

  <h2>${esc(th('unitsTitle'))}</h2>
  <table class="grid">
    <tr>
      <th>${esc(th('colUnit'))}</th>
      <th>${esc(th('colCity'))}</th>
      <th class="num">${esc(th('colMeetings'))}</th>
      <th class="num">${esc(th('colAverage'))}</th>
      <th class="num">${esc(th('colBread'))}</th>
      <th class="num">${esc(th('colLast'))}</th>
      <th class="num">⚠</th>
    </tr>
    ${tableRows}
  </table>

  <h2>${esc(tj('reports'))}</h2>
  ${unitSections || `<p class="muted">${esc(th('noMeetings'))}</p>`}
</body></html>`;
}
