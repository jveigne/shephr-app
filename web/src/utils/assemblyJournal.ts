// ---------------------------------------------------------------------------------------------
//  Journal PDF CONSOLIDÉ des assemblées — D-ASM-18 (JP 08/10) ; et, en fin de fichier, journal
//  d'UNE assemblée (D-ASM-14, parité mobile → web JP 27/10).
//
//  Pendant web du journal mobile (`mobile/utils/assemblyJournal.ts`) : mêmes périodes (mois,
//  trimestre, semestre, année civile), même mise en page A4, mais pour PLUSIEURS assemblées (le
//  périmètre d'un dirigeant dans la Hiérarchie) et avec les clés i18n web `assembly.journal.*`.
//
//  Module PUR (aucune dépendance React) : calcul des périodes et HTML du document. Le chargement
//  (`GET /assembly/meetings`) et l'impression (iframe → « Enregistrer en PDF », utils/printHtml)
//  sont faits par `components/AssemblyHierarchyStats.tsx`.
//
//  D-ASM-18 : AUCUN NOM de personne dans le journal consolidé — chaque CR ne porte que le NOMBRE
//  de présents, jamais la liste (à la différence du journal d'une assemblée, D-ASM-14).
//  D-OFF-05 / P-03 (JP 27/10, plan 05, ticket O6) : le serveur ne renvoie plus les présents nommés
//  pour un journal consolidé (`MeetingSummaryLite.attendeeCount`) ; le même document sert au journal
//  de la Hiérarchie (offre Caleb, chaîne) et au journal de la VILLE (offre Néhémie, `JOURNAL`,
//  chargé par `pages/CityStudy.tsx`).
// ---------------------------------------------------------------------------------------------
import type { MeetingDetail, MeetingSummaryLite, UnitMeetingStats } from '../services/assemblyApi';
import { averageAttendance, isAlert, type HierarchyAggregate } from './assemblyHierarchyStats';
import { formatChapters, formatMeetingDate, type Translate } from './meetingReport';

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

/** Bornes 'yyyy-MM-dd' incluses de la période (≤ 366 jours : contrat de /stats et /meetings). */
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
      return `${t('assembly.journal.monthsLong').split(',')[p.index]} ${p.year}`;
    case 'quarter':
      return `${t('assembly.journal.quarters').split(',')[p.index]} ${p.year}`;
    case 'semester':
      return `${t('assembly.journal.semesters').split(',')[p.index]} ${p.year}`;
    default:
      return String(p.year);
  }
}

/** Nom de document sûr (sert de nom de fichier PDF proposé) : « Journal-assemblees-2026-T3 ». */
export function journalDocName(scope: string, p: Period): string {
  const safe = scope
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix =
    p.kind === 'month' ? pad(p.index + 1)
      : p.kind === 'quarter' ? `T${p.index + 1}`
        : p.kind === 'semester' ? `S${p.index + 1}`
          : '';
  return `Journal-${safe || 'assemblees'}-${p.year}${suffix ? `-${suffix}` : ''}`;
}

/**
 * Valeurs des tokens de `theme/styles.css` (le HTML imprimé vit dans un iframe isolé, sans la
 * feuille de style de l'app) — à garder alignées avec `:root`.
 */
const THEME = {
  green800: '#1E3A2F',
  ink900: '#2A2419',
  ink700: '#4E4131',
  ink500: '#7A6B55',
  ivoryCard: '#FBF5E4',
  line: '#D7C7A6',
  lineSoft: '#E3D5B5',
  earth700: '#8E6B47',
  earth50: '#F5E6D2',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ConsolidatedJournalInput {
  /**
   * Périmètre affiché, sans nom de personne (D-ASM-18) : « Équipe d'un dirigeant · N assemblées »,
   * « Toute ma hiérarchie » ou, pour le journal de ville (D-OFF-05), « Ville de {nom} ».
   */
  scopeLabel: string;
  period: Period;
  /** Agrégat du périmètre (mêmes indicateurs que le bloc de la Hiérarchie). */
  aggregate: HierarchyAggregate;
  /** Réunions de la période (n'importe quel ordre : regroupées et triées ici) — nombre de présents seulement (D-OFF-05). */
  meetings: MeetingSummaryLite[];
  /** Date du jour, 'yyyy-MM-dd' : date d'édition et calcul des alertes. */
  today: string;
  /** Langue de l'app ('fr'/'en'), pour la virgule décimale. */
  locale?: string;
}

/**
 * Document HTML A4 du journal consolidé : en-tête, synthèse globale, tableau par assemblée, puis
 * une section par assemblée ayant des CR (chaque CR dans l'ordre chronologique : date, NOMBRE de
 * présents, fraction de pain, lecture).
 */
export function buildConsolidatedJournalHtml(input: ConsolidatedJournalInput, t: Translate): string {
  const tj = (k: string, o?: Record<string, string | number>) => t(`assembly.journal.${k}`, o);
  const agg = input.aggregate;
  const none = t('common.none');
  const num = (n: number | null) => (n == null ? none : n.toLocaleString(input.locale));

  const stat = (value: string, label: string, warn = false) =>
    `<div class="stat${warn ? ' warn' : ''}"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;

  const lastReport = (r: UnitMeetingStats) =>
    r.lastMeetingDate ? formatMeetingDate(r.lastMeetingDate) : tj('neverReported');

  const unitRows = agg.rows
    .map((r) => {
      const alert = isAlert(r, input.today);
      return `<tr${alert ? ' class="alert"' : ''}>
        <td>${esc(r.unitName)}</td>
        <td>${esc(r.cityName ?? none)}</td>
        <td class="n">${r.meetingCount}</td>
        <td class="n">${esc(num(averageAttendance(r.meetingCount, r.attendanceTotal)))}</td>
        <td class="n">${r.breadBreakingCount}</td>
        <td>${esc(lastReport(r))}</td>
        <td class="c">${alert ? '⚠' : ''}</td>
      </tr>`;
    })
    .join('');

  // Réunions regroupées par assemblée, dans l'ordre du tableau (nom d'assemblée).
  const byUnit = new Map<string, MeetingSummaryLite[]>();
  for (const m of input.meetings) byUnit.set(m.unitId, [...(byUnit.get(m.unitId) ?? []), m]);

  const sections = agg.rows
    .filter((r) => (byUnit.get(r.unitId)?.length ?? 0) > 0)
    .map((r) => {
      const list = [...byUnit.get(r.unitId)!].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
      const rows = list
        .map((m) => {
          const book = m.bookTitle || m.moduleName;
          const reading =
            book && m.chapters.length > 0
              ? `${esc(book)} — ${esc(formatChapters([...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex), t))}`
              : `<span class="muted">${esc(tj('noReading'))}</span>`;
          return `<tr>
            <td>${esc(formatMeetingDate(m.meetingDate))}</td>
            <td class="n">${m.attendeeCount}</td>
            <td>${esc(t(m.breadBreaking ? 'assembly.report.yes' : 'assembly.report.no'))}</td>
            <td>${reading}</td>
          </tr>`;
        })
        .join('');
      const title = r.cityName ? `${r.unitName} · ${r.cityName}` : r.unitName;
      return `<section class="unit">
        <h3>${esc(title)} <span class="count">${esc(tj('reportCount', { count: list.length }))}</span></h3>
        <table class="grid">
          <thead><tr>
            <th style="width:16%">${esc(tj('colDate'))}</th>
            <th style="width:12%" class="n">${esc(tj('colAttendees'))}</th>
            <th style="width:16%">${esc(tj('colBread'))}</th>
            <th>${esc(tj('colReading'))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const alertNames = agg.alertRows.map((r) => r.unitName);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(journalDocName(input.scopeLabel, input.period))}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${THEME.ink900}; font-size: 10.5pt; margin: 0; }
  h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; font-weight: normal; margin: 0; }
  header { border-bottom: 2px solid ${THEME.green800}; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 24pt; color: ${THEME.green800}; }
  .sub { font-size: 12pt; color: ${THEME.ink700}; margin-top: 4px; }
  .meta { font-size: 9pt; color: ${THEME.ink500}; margin-top: 6px; }
  h2 { font-size: 15pt; color: ${THEME.green800}; margin: 18px 0 8px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat { background: ${THEME.ivoryCard}; border: 1px solid ${THEME.line}; border-radius: 8px; padding: 9px 10px; }
  .stat.warn { background: ${THEME.earth50}; }
  .stat.warn .stat-value { color: ${THEME.earth700}; }
  .stat-value { font-family: Georgia, serif; font-size: 17pt; color: ${THEME.green800}; }
  .stat-label { font-size: 8pt; color: ${THEME.ink500}; text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
  .alerts { margin: 8px 0 0; font-size: 9.5pt; color: ${THEME.earth700}; }
  .hint { margin: 6px 0 0; font-size: 8.5pt; color: ${THEME.ink500}; }
  .muted { color: ${THEME.ink500}; }
  table.grid { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  table.grid th { text-align: left; font-weight: 600; color: ${THEME.ink700}; border-bottom: 1px solid ${THEME.line}; padding: 4px 6px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; }
  table.grid td { border-bottom: 1px solid ${THEME.lineSoft}; padding: 4px 6px; vertical-align: top; }
  table.grid tr { page-break-inside: avoid; }
  table.grid .n { text-align: right; }
  table.grid .c { text-align: center; color: ${THEME.earth700}; }
  table.grid tr.alert td { color: ${THEME.earth700}; }
  .unit { page-break-inside: avoid; margin-top: 14px; }
  h3 { font-size: 12.5pt; margin-bottom: 4px; }
  h3 .count { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 9pt; color: ${THEME.ink500}; margin-left: 6px; }
</style></head>
<body>
  <header>
    <h1>${esc(tj('docTitle'))}</h1>
    <div class="sub">${esc(input.scopeLabel)} — ${esc(periodLabel(input.period, t))}</div>
    <div class="meta">${esc(tj('generatedOn', { date: formatMeetingDate(input.today) }))}</div>
  </header>

  <h2>${esc(tj('summary'))}</h2>
  <div class="stats">
    ${stat(String(agg.meetings), tj('statMeetings'))}
    ${stat(`${agg.active} / ${agg.total}`, tj('statActive'))}
    ${stat(String(agg.alertRows.length), tj('statAlert'), agg.alertRows.length > 0)}
    ${stat(num(agg.average), tj('statAverage'))}
    ${stat(String(agg.distinctAttendees), tj('statDistinct'))}
    ${stat(String(agg.breadBreaking), tj('statBread'))}
  </div>
  ${alertNames.length > 0 ? `<p class="alerts">⚠ ${esc(tj('alertList', { list: alertNames.join(', ') }))}</p>` : ''}
  <p class="hint">${esc(tj('distinctHint'))}</p>

  <h2>${esc(tj('byUnit'))}</h2>
  <table class="grid">
    <thead><tr>
      <th>${esc(tj('colUnit'))}</th>
      <th>${esc(tj('colCity'))}</th>
      <th class="n">${esc(tj('colMeetings'))}</th>
      <th class="n">${esc(tj('colAverage'))}</th>
      <th class="n">${esc(tj('colBreadCount'))}</th>
      <th>${esc(tj('colLastReport'))}</th>
      <th class="c">⚠</th>
    </tr></thead>
    <tbody>${unitRows}</tbody>
  </table>

  ${sections ? `<h2>${esc(tj('reports'))}</h2>${sections}` : ''}
</body></html>`;
}

// ---------------------------------------------------------------------------------------------
//  Journal PDF d'UNE assemblée — JP 08/10, D-ASM-14.
//  Parité mobile → web (JP 27/10, décision n°3 — D-WEB-01) : port de `buildJournalHtml` de
//  `mobile/utils/assemblyJournal.ts`, avec les clés web `assembly.journal.*`. Le chargement
//  (`listMeetings` + `getMeeting` par paquets) et l'impression (utils/printHtml) sont faits par
//  `pages/Assembly.tsx` (modale « Journal PDF » de l'onglet Réunions).
//
//  D-ASM-14 : la liste nominative des présents est OPTIONNELLE, le nombre reste toujours.
//  Le journal consolidé (D-ASM-18, ci-dessus) reste, lui, SANS AUCUN NOM — non modifié.
// ---------------------------------------------------------------------------------------------

export interface UnitJournalInput {
  unitName: string;
  cityName: string | null;
  period: Period;
  /** Détails des réunions de la période, dans n'importe quel ordre (triés ici par date). */
  meetings: MeetingDetail[];
  /** D-ASM-14 : liste nominative des présents (facultative) ; le nombre figure toujours. */
  includeAttendees: boolean;
  /** Date d'édition, 'yyyy-MM-dd'. */
  generatedOn: string;
  /** Langue de l'app ('fr'/'en'), pour la virgule décimale de la présence moyenne. */
  locale?: string;
}

/** « 20 septembre 2026 » (miroir de `fmtIsoDay` du mobile), sans passer par Date. */
function fmtLongDay(isoDate: string, t: Translate): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = t('assembly.journal.monthsLong').split(',');
  if (!y || !m || !d || !months[m - 1]) return isoDate;
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Document HTML A4 du journal d'une assemblée : en-tête, synthèse de la période (réunions,
 * présence moyenne, fractions de pain, lectures par livre), puis chaque CR dans l'ordre
 * chronologique. Le `<title>` sert de nom de fichier proposé par « Enregistrer en PDF ».
 */
export function buildJournalHtml(input: UnitJournalInput, t: Translate): string {
  const tj = (k: string, o?: Record<string, string | number>) => t(`assembly.journal.${k}`, o);
  const meetings = [...input.meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const count = meetings.length;
  const totalPresent = meetings.reduce((s, m) => s + m.attendees.length, 0);
  const avg = count === 0 ? 0 : Math.round((totalPresent / count) * 10) / 10;
  const bread = meetings.filter((m) => m.breadBreaking).length;
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const sortedChapters = (m: MeetingDetail) => [...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex);

  // Lectures de la période, regroupées par livre (un module = un livre).
  const readings = new Map<string, MeetingDetail['chapters']>();
  for (const m of meetings) {
    const book = m.bookTitle || m.moduleName;
    if (!book || m.chapters.length === 0) continue;
    readings.set(book, [...(readings.get(book) ?? []), ...sortedChapters(m)]);
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
          ? `${esc(book)} — ${esc(formatChapters(sortedChapters(m), t))}`
          : `<span class="muted">${esc(tj('noReading'))}</span>`;
      return `
      <section class="meeting">
        <h3>${esc(fmtLongDay(m.meetingDate, t))}</h3>
        <table>
          <tr><th>${esc(tj('attendees'))}</th><td>${names.length}${
            input.includeAttendees && names.length > 0
              ? `<div class="names">${names.map(esc).join(' · ')}</div>`
              : ''
          }</td></tr>
          <tr><th>${esc(tj('breadBreaking'))}</th><td>${esc(
            t(m.breadBreaking ? 'assembly.report.yes' : 'assembly.report.no'),
          )}</td></tr>
          <tr><th>${esc(tj('reading'))}</th><td>${reading}</td></tr>
        </table>
      </section>`;
    })
    .join('');

  const subtitle = input.cityName ? `${input.unitName} · ${input.cityName}` : input.unitName;
  const stat = (value: string, label: string) =>
    `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(journalDocName(input.unitName || 'assemblee', input.period))}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${THEME.ink900}; font-size: 11pt; margin: 0; }
  h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; font-weight: normal; margin: 0; }
  header { border-bottom: 2px solid ${THEME.green800}; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 24pt; color: ${THEME.green800}; }
  .sub { font-size: 12pt; color: ${THEME.ink700}; margin-top: 4px; }
  .meta { font-size: 9pt; color: ${THEME.ink500}; margin-top: 6px; }
  h2 { font-size: 15pt; color: ${THEME.green800}; margin: 18px 0 8px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat { background: ${THEME.ivoryCard}; border: 1px solid ${THEME.line}; border-radius: 8px; padding: 10px; }
  .stat-value { font-family: Georgia, serif; font-size: 18pt; color: ${THEME.green800}; }
  .stat-label { font-size: 8.5pt; color: ${THEME.ink500}; text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
  .readings { margin: 6px 0 0; padding-left: 18px; }
  .readings li { margin: 3px 0; }
  .muted { color: ${THEME.ink500}; }
  .meeting { page-break-inside: avoid; border-top: 1px solid ${THEME.line}; padding: 10px 0 6px; }
  h3 { font-size: 13pt; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; vertical-align: top; width: 32%; font-weight: 600; color: ${THEME.ink700}; padding: 3px 8px 3px 0; font-size: 10pt; }
  td { vertical-align: top; padding: 3px 0; }
  .names { font-size: 9.5pt; color: ${THEME.ink700}; margin-top: 2px; line-height: 1.45; }
</style></head>
<body>
  <header>
    <h1>${esc(tj('unitDocTitle'))}</h1>
    <div class="sub">${esc(subtitle)} — ${esc(periodLabel(input.period, t))}</div>
    <div class="meta">${esc(tj('generatedOn', { date: formatMeetingDate(input.generatedOn) }))}</div>
  </header>

  <h2>${esc(tj('summary'))}</h2>
  <div class="stats">
    ${stat(String(count), tj('statUnitMeetings'))}
    ${stat(avg.toLocaleString(input.locale), tj('statAverage'))}
    ${stat(`${bread} / ${count}`, tj('statUnitBread'))}
  </div>
  <h2>${esc(tj('readings'))}</h2>
  ${readingRows}

  <h2>${esc(tj('reports'))}</h2>
  ${meetingBlocks}
</body></html>`;
}
