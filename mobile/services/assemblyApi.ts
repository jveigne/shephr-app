import { apiClient } from '@/services/apiClient';
import type { Language } from '@/services/authApi';

// Vie d'assemblée (plan 23/09, §5.2 — lot L5) : réunions, comptes rendus, modules d'enseignement,
// avancement. Tous les endpoints sont sous /api/church/assembly et gatés @RequiresModule("ASSEMBLY")
// (D-ASM-12) : sans abonnement, 403 MODULE_ACCESS_DENIED — l'onglet est de toute façon masqué.
// Dates LocalDate = 'yyyy-MM-dd' ; Instant = ISO.

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyUnitResponse */
export interface AssemblyUnit {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  /** D-ASM-03 / RG-ASM-04 : le caller est l'un des DIRIGEANT_UNITE de l'assemblée. */
  canWrite: boolean;
  /** D-ASM-17 : le caller en est MEMBRE — lecture seule + avancement personnel. */
  member: boolean;
  /** D-ETU-24 (JP 21/10) : langue de l'assemblée (défaut FR). */
  language: Language;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.RosterEntry */
export interface RosterEntry {
  userId: string;
  fullName: string;
  role: 'MEMBRE' | 'DIRIGEANT_UNITE';
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.ChapterDto — `part*` null si le module n'a pas
 * de parties (JP 24/09 : la numérotation repart à 1 dans chaque partie, un chapitre s'identifie
 * donc par (partie, numéro)). `orderIndex` = rang dans le module entier.
 */
export interface TeachingChapter {
  id: string;
  number: number;
  title: string | null;
  orderIndex: number;
  partId: string | null;
  partNumber: number | null;
  partTitle: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.PartDto */
export interface TeachingPart {
  id: string;
  number: number;
  title: string | null;
  orderIndex: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.TeachingModuleDto */
export interface TeachingModule {
  id: string;
  name: string;
  bookTitle: string;
  orderIndex: number;
  /** Vide = module sans parties ; sinon chaque chapitre porte sa partie. */
  parts: TeachingPart[];
  chapters: TeachingChapter[];
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingRequest — sert au POST ET au PATCH
 * (le PATCH remplace tous les champs, lot L3).
 */
export interface MeetingRequest {
  meetingDate: string;
  breadBreaking?: boolean;
  attendeeIds?: string[];
  moduleId?: string | null;
  chapterIds?: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingSummary */
export interface MeetingSummary {
  id: string;
  unitId: string;
  unitName: string | null;
  meetingDate: string;
  breadBreaking: boolean;
  attendeeCount: number;
  moduleId: string | null;
  moduleName: string | null;
  bookTitle: string | null;
  /** Chapitres lus, dans l'ordre du module. */
  chapters: TeachingChapter[];
  /** D-ASM-17 : le caller était coché présent. */
  attended: boolean;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AttendeeDto — RG-ASM-07 : nom instantané. */
export interface MeetingAttendee {
  userId: string;
  displayName: string;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingDetailResponse */
export interface MeetingDetail {
  id: string;
  unitId: string;
  /** null seulement si l'assemblée n'est plus résolue (backend : AssemblyRef absent). */
  unitName: string | null;
  meetingDate: string;
  breadBreaking: boolean;
  attendees: MeetingAttendee[];
  moduleId: string | null;
  moduleName: string | null;
  bookTitle: string | null;
  chapters: TeachingChapter[];
  canWrite: boolean;
  createdById: string | null;
  createdAt: string | null;
  updatedById: string | null;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.ModuleProgress — RG-ASM-08. */
export interface ModuleProgress {
  moduleId: string;
  moduleName: string;
  bookTitle: string;
  /** false = module désactivé, listé car déjà lu (RG-ASM-02). */
  active: boolean;
  readCount: number;
  totalCount: number;
  percent: number;
  lastChapterId: string | null;
  /** Partie du dernier chapitre lu ; null si le module n'a pas de parties. */
  lastPartNumber: number | null;
  lastChapterNumber: number | null;
  lastReadDate: string | null;
  readChapterIds: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.UnitProgressResponse */
export interface UnitProgress {
  unitId: string;
  unitName: string;
  cityName: string | null;
  lastMeetingDate: string | null;
  modules: ModuleProgress[];
}

/** Codes 422 métier du lot L3, traduits sous `assemblyLife.errors.*`. */
export const ASSEMBLY_ERROR_CODES = [
  'MEETING_ALREADY_EXISTS',
  'ATTENDEE_NOT_IN_ASSEMBLY',
  'CHAPTERS_FROM_SEVERAL_MODULES',
  'TEACHING_MODULE_INACTIVE',
];

const BASE = '/api/church/assembly';

export async function listAssemblyUnits(): Promise<AssemblyUnit[]> {
  const { data } = await apiClient.get<AssemblyUnit[]>(`${BASE}/units`);
  return data;
}

export async function getRoster(unitId: string): Promise<RosterEntry[]> {
  const { data } = await apiClient.get<RosterEntry[]>(`${BASE}/units/${unitId}/roster`);
  return data;
}

export async function listTeachingModules(): Promise<TeachingModule[]> {
  const { data } = await apiClient.get<TeachingModule[]>(`${BASE}/teaching-modules`);
  return data;
}

export async function listMeetings(unitId: string, year?: number): Promise<MeetingSummary[]> {
  const { data } = await apiClient.get<MeetingSummary[]>(`${BASE}/units/${unitId}/meetings`, {
    params: year != null ? { year } : undefined,
  });
  return data;
}

export async function createMeeting(unitId: string, payload: MeetingRequest): Promise<MeetingDetail> {
  const { data } = await apiClient.post<MeetingDetail>(`${BASE}/units/${unitId}/meetings`, payload);
  return data;
}

export async function getMeeting(id: string): Promise<MeetingDetail> {
  const { data } = await apiClient.get<MeetingDetail>(`${BASE}/meetings/${id}`);
  return data;
}

export async function updateMeeting(id: string, payload: MeetingRequest): Promise<MeetingDetail> {
  const { data } = await apiClient.patch<MeetingDetail>(`${BASE}/meetings/${id}`, payload);
  return data;
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/meetings/${id}`);
}

export async function getUnitProgress(unitId: string): Promise<UnitProgress> {
  const { data } = await apiClient.get<UnitProgress>(`${BASE}/units/${unitId}/progress`);
  return data;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.MyProgressResponse — D-ASM-17 : avancement
 * calculé sur les seules réunions où le caller était présent (« ce qu'il a vu »).
 */
export interface MyProgress {
  attendedCount: number;
  lastAttendedDate: string | null;
  modules: ModuleProgress[];
}

/** D-ASM-17 : réunions où je suis coché présent, toutes assemblées, plus récentes d'abord. */
export async function getMyMeetings(): Promise<MeetingSummary[]> {
  const { data } = await apiClient.get<MeetingSummary[]>(`${BASE}/me/meetings`);
  return data;
}

export async function getMyProgress(): Promise<MyProgress> {
  const { data } = await apiClient.get<MyProgress>(`${BASE}/me/progress`);
  return data;
}

export async function getProgressOverview(moduleId?: string): Promise<UnitProgress[]> {
  const { data } = await apiClient.get<UnitProgress[]>(`${BASE}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.UnitMeetingStats — D-ASM-18 (JP 08/10) :
 * statistiques de Vie d'assemblée affichées dans la Hiérarchie. Une ligne par assemblée VISIBLE
 * (même ensemble que `/units`), y compris sans réunion (compteurs à 0). Les compteurs portent sur
 * les réunions non supprimées de [from, to] ; `lastMeetingDate` est la dernière réunion TOUTES
 * PÉRIODES confondues (alerte « sans CR depuis 3 semaines »), null si aucune. Que des nombres :
 * aucun nom de personne (D-ASM-18).
 */
export interface UnitMeetingStats {
  unitId: string;
  unitName: string;
  cityName: string | null;
  meetingCount: number;
  /** Σ des présents de chaque réunion de la plage. */
  attendanceTotal: number;
  /** userId distincts présents sur la plage, dans CETTE assemblée. */
  distinctAttendees: number;
  breadBreakingCount: number;
  lastMeetingDate: string | null;
}

/** D-ASM-18 — `from`/`to` 'yyyy-MM-dd' inclus, au plus 366 jours (400 sinon). */
export async function getAssemblyStats(from: string, to: string): Promise<UnitMeetingStats[]> {
  const { data } = await apiClient.get<UnitMeetingStats[]>(`${BASE}/stats`, { params: { from, to } });
  return data;
}

/** Le backend refuse plus de 200 assemblées par appel ; on découpe par 100 (D-ASM-18). */
const MEETINGS_RANGE_CHUNK = 100;

/**
 * D-ASM-18 — réunions (détail, présents et chapitres compris) de plusieurs assemblées sur une
 * plage, pour le journal consolidé. Un appel par paquet de 100 assemblées, en séquence ; l'ordre
 * global n'est pas garanti d'un paquet à l'autre (le journal regroupe et trie lui-même).
 */
export async function listMeetingsInRange(
  unitIds: string[],
  from: string,
  to: string,
): Promise<MeetingDetail[]> {
  const out: MeetingDetail[] = [];
  for (let i = 0; i < unitIds.length; i += MEETINGS_RANGE_CHUNK) {
    const chunk = unitIds.slice(i, i + MEETINGS_RANGE_CHUNK);
    const { data } = await apiClient.get<MeetingDetail[]>(`${BASE}/meetings`, {
      params: { from, to, unitIds: chunk.join(',') },
    });
    out.push(...data);
  }
  return out;
}

// ─── Étude de l'assemblée (plan 21/10, contrat 02_Contrat_API_Etude.md §4 et §8) ─────────────────
//
// Questionnaire en réunion, programme « Le Message de Bertoua ». Mêmes garde et préfixe que le
// reste du module (`@RequiresModule("ASSEMBLY")`, D-ETU-05 : pas de nouvel abonnement), sous
// `/study/**` parce que `/units` désigne déjà les assemblées. Une unité d'étude est un
// `TeachingModule` (D-ETU-01), une leçon un `TeachingChapter` (D-ETU-02). Les droits viennent DU
// SERVEUR (`leader`, `participant` de chaque réponse) : ne jamais les recalculer ici.
// Points et notes : nombres à 2 décimales au plus (`BigDecimal` côté Java, contrat §1.1).

// Mirrors com.excellence.back.assembly.StudyQuestion / StudySession / StudyCopy / StudyAnswer (enums imbriqués)
export type StudyQuestionType = 'VRAI_FAUX' | 'OUI_NON' | 'CHOIX_UNIQUE' | 'CHOIX_MULTIPLE'
  | 'OUVERTE' | 'PERSONNELLE' | 'EXERCICE' | 'CONSIGNE';
export type StudyAnswerFormat = 'TEXT' | 'YES_NO';
export type StudySessionStatus = 'REPONSES_OUVERTES' | 'CORRECTION' | 'TERMINEE';
export type StudyCopySource = 'APP' | 'PAPIER';
export type StudyVerdict = 'JUSTE' | 'A_PRECISER' | 'A_REVOIR';
export interface StudyOption { key: string; label: string }

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionSummary */
export interface StudySessionSummary {
  id: string;
  unitId: string;
  unitName: string;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string;
  /** D-ETU-25 (JP 21/10) : langue de la version de l'unité étudiée. */
  moduleLanguage: Language;
  chapterId: string;
  lessonNumber: number;
  lessonTitle: string | null;
  status: StudySessionStatus;
  /** RG-ETU-02b : Σ des points des questions notées, figée à l'ouverture. */
  maxScore: number;
  openedAt: string;
  correctionAt: string | null;
  finishedAt: string | null;
  /** Nb de copies (APP + PAPIER) — renseigné pour un dirigeant (sinon 0), et par `/units/{id}/sessions`. */
  copyCount: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAssembly */
export interface StudyAssembly {
  unitId: string;
  unitName: string;
  /** D-ETU-24 (JP 21/10) : langue de l'assemblée — référence de la pastille FR / EN (D-ETU-26). */
  language: Language;
  /** D-ETU-07 : DIRIGEANT_UNITE de l'assemblée — pilote la séance. */
  leader: boolean;
  /** D-ETU-06 : répondant (goalUnitId = l'assemblée, tout rôle, ou dirigeant). */
  participant: boolean;
  /** Séance non terminée (RG-ETU-02 : une au plus), ou null. */
  currentSession: StudySessionSummary | null;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyMeResponse — vide pour un compte sans
 * assemblée (niveaux au-dessus, LEADER, SECRETARIAT) : le front montre l'avancement du périmètre.
 */
export interface StudyMeResponse {
  assemblies: StudyAssembly[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLesson — une leçon = un chapitre ayant ≥ 1 question. */
export interface StudyLesson {
  chapterId: string;
  number: number;
  title: string | null;
  portion: string | null;
  /** H4 : module en mode « parties » — pour l'affichage seulement. */
  partNumber: number | null;
  questionCount: number;
  maxScore: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnit — module actif ayant ≥ 1 question. */
export interface StudyUnit {
  moduleId: string;
  code: string | null;
  name: string;
  bookTitle: string;
  /**
   * D-ETU-25 (JP 21/10) : langue de cette version. Avec `?unitId=`, le catalogue ne renvoie qu'une
   * version par `code` — celle de l'assemblée si elle existe, sinon l'autre (D-ETU-26).
   */
  language: Language;
  orderIndex: number;
  /** Désigne une version ; le prérequis est atteint par `code`, quelle que soit la langue (D-ETU-27). */
  prerequisiteModuleId: string | null;
  lessons: StudyLesson[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnitForAssembly — `locked` / `doneChapterIds` par `code` (D-ETU-27). */
export interface StudyUnitForAssembly {
  unit: StudyUnit;
  /** D-ETU-19 : prérequis non atteint dans l'assemblée (false sans `unitId`). */
  locked: boolean;
  /** RG-ETU-17b : leçons ayant une séance TERMINEE dans l'assemblée ([] sans `unitId`). */
  doneChapterIds: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyQuestionView */
export interface StudyQuestionView {
  id: string;
  number: string;
  /** RG-ETU-20 : sous-question (6.a) — un seul niveau de profondeur. */
  parentId: string | null;
  statement: string;
  type: StudyQuestionType;
  answerFormat: StudyAnswerFormat | null;
  options: StudyOption[] | null;
  points: number;
  bibleReference: string | null;
  orderIndex: number;
  /** RG-ETU-12 : null tant que masqué (répondant pendant REPONSES_OUVERTES). */
  answerKey: string[] | null;
  /** Idem. */
  expectedAnswer: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswerView */
export interface StudyAnswerView {
  questionId: string;
  valueText: string | null;
  valueOptions: string[] | null;
  done: boolean;
  /** null : pas encore corrigée (ouverte sans avis = 0 à la note, D-ETU-12). */
  points: number | null;
  verdict: StudyVerdict | null;
  /** Corrigée par RG-ETU-05/06/08. */
  auto: boolean;
  /** RG-ETU-07b : points ajustés par le dirigeant. */
  adjusted: boolean;
  answeredAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCopyView */
export interface StudyCopyView {
  id: string;
  userId: string;
  displayName: string;
  source: StudyCopySource;
  score: number;
  maxScore: number;
  answers: StudyAnswerView[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionDetail — cible du rafraîchissement ≈ 5 s (D-ETU-23). */
export interface StudySessionDetail {
  session: StudySessionSummary;
  moduleBookTitle: string | null;
  lessonPortion: string | null;
  leader: boolean;
  participant: boolean;
  /** Toutes les questions de la leçon, par `orderIndex`. */
  questions: StudyQuestionView[];
  /** Copie de l'appelant, ou null (pas encore répondu, ou lecteur de la hiérarchie — H1). */
  myCopy: StudyCopyView | null;
  /** Dirigeant : ouvertes répondues sans avis, toutes copies ; sinon null. */
  pendingReviewCount: number | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswerInput — forme selon le type : contrat §2.3. */
export interface StudyAnswerInput {
  questionId: string;
  valueText?: string | null;
  valueOptions?: string[] | null;
  done?: boolean | null;
  /** D-ETU-11 : horloge du téléphone au moment de la saisie (RG-ETU-04). */
  answeredAt?: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswersResult */
export interface StudyAnswersResult {
  /** null : lot entièrement ignoré, aucune copie créée (RG-ETU-04b). */
  copy: StudyCopyView | null;
  /** RG-ETU-04 : saisies après `correctionAt + 2 min` — à retirer du brouillon. */
  ignoredQuestionIds: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyReviewRequest */
export interface StudyReviewRequest {
  verdict: StudyVerdict;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCopyResult */
export interface StudyCopyResult {
  id: string;
  userId: string;
  displayName: string;
  source: StudyCopySource;
  score: number;
  maxScore: number;
  /** APP : questions répondues ; PAPIER : 0. */
  answeredCount: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyRosterMember — répondant sans copie. */
export interface StudyRosterMember {
  userId: string;
  fullName: string;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionResults */
export interface StudySessionResults {
  session: StudySessionSummary;
  leader: boolean;
  /** Triées par nom. */
  copies: StudyCopyResult[];
  /** Dirigeant seulement (sinon []) — pour « Ajouter une copie papier » (D-ETU-13). */
  withoutCopy: StudyRosterMember[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCopyDetail — RG-ETU-13 : auteur ou dirigeant. */
export interface StudyCopyDetail {
  session: StudySessionSummary;
  copy: StudyCopyView;
  /** Réponses du manuel incluses (sauf pour l'auteur pendant REPONSES_OUVERTES, RG-ETU-12). */
  questions: StudyQuestionView[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPaperCopyRequest */
export interface StudyPaperCopyRequest {
  userId: string;
  score: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyScoreRequest */
export interface StudyScoreRequest {
  score: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPointsRequest */
export interface StudyPointsRequest {
  points: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLessonProgress — `bestScore`/`maxScore` null si non faite. */
export interface StudyLessonProgress {
  chapterId: string;
  number: number;
  title: string | null;
  done: boolean;
  /** D-ETU-18 : meilleure note de la leçon (leçon refaite). */
  bestScore: number | null;
  maxScore: number | null;
  /** RG-ETU-13 : le lien n'est affiché que pour soi ou pour un dirigeant. */
  bestCopyId: string | null;
  bestSource: StudyCopySource | null;
  doneAt: string | null;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyModuleProgress — RG-ETU-17. D-ETU-27 (JP
 * 21/10) : les versions d'un même `code` forment UNE ligne (`moduleId` / `name` de la version dans
 * la langue de l'appelant).
 */
export interface StudyModuleProgress {
  moduleId: string;
  code: string | null;
  name: string;
  /** D-ETU-27 : langues où des leçons ont été faites. */
  languages: Language[];
  totalLessons: number;
  lessonsDone: number;
  /** Σ meilleures notes / Σ max des leçons faites. */
  score: number;
  maxScore: number;
  lessons: StudyLessonProgress[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPersonProgress — D-ETU-10, toutes assemblées confondues. */
export interface StudyPersonProgress {
  userId: string;
  fullName: string;
  modules: StudyModuleProgress[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyMemberRow */
export interface StudyMemberRow {
  userId: string;
  fullName: string;
  lessonsDone: number;
  score: number;
  maxScore: number;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnitModuleProgress — D-ETU-27 (JP 21/10) :
 * versions d'un même `code` regroupées (`moduleId` / `name` de la version dans la langue de l'assemblée).
 */
export interface StudyUnitModuleProgress {
  moduleId: string;
  code: string | null;
  name: string;
  /** D-ETU-27 : langues où des leçons ont été faites. */
  languages: Language[];
  totalLessons: number;
  /** RG-ETU-17b : leçons avec une séance TERMINEE dans l'assemblée. */
  lessonsDone: number;
  lastSessionAt: string | null;
  /** Répondants actuels ∪ comptes ayant une copie ; [] dans la vue d'ensemble. */
  members: StudyMemberRow[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnitProgress */
export interface StudyUnitProgress {
  unitId: string;
  unitName: string;
  leader: boolean;
  modules: StudyUnitModuleProgress[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAssemblyOverview — D-ETU-08 : géographie. */
export interface StudyAssemblyOverview {
  unitId: string;
  unitName: string;
  cityId: string | null;
  cityName: string | null;
  modules: StudyUnitModuleProgress[];
}

/** Codes 422 de l'étude (contrat §7) côté app, traduits sous `study.errors.*`. */
export const STUDY_ERROR_CODES = [
  'STUDY_SESSION_ALREADY_OPEN',
  'STUDY_SESSION_NOT_OPEN',
  'STUDY_SESSION_LOCKED',
  'STUDY_INVALID_TRANSITION',
  'STUDY_SESSION_NOT_CANCELLABLE',
  'STUDY_PREREQUISITE_NOT_MET',
  'STUDY_LESSON_WITHOUT_QUESTIONS',
  'TEACHING_MODULE_INACTIVE',
  'NOT_ASSEMBLY_MEMBER',
  'QUESTION_NOT_IN_LESSON',
  'STUDY_INVALID_ANSWER',
  'STUDY_NOTHING_TO_REVIEW',
  'STUDY_COPY_ALREADY_EXISTS',
  'STUDY_COPY_NOT_PAPER',
  'STUDY_SCORE_OUT_OF_RANGE',
  'STUDY_POINTS_OUT_OF_RANGE',
  'UNAUTHORIZED_ACCESS',
  'RESOURCE_NOT_FOUND',
  'MODULE_ACCESS_DENIED',
];

/** Code machine d'une erreur axios (`response.data.error`, contrat §7), null sans réponse. */
export function studyErrorCode(e: any): string | null {
  const code = e?.response?.data?.error;
  return typeof code === 'string' ? code : null;
}

/**
 * Message d'une erreur de l'étude : pas de réseau, puis traduction du code connu, puis `message`
 * du serveur (contrat §7 : « les fronts traduisent chaque code et retombent sur `message` »).
 */
export function studyErrorMessage(e: any, t: (key: string, options?: any) => string): string {
  if (!e?.response) return t('study.errors.offline');
  const code = studyErrorCode(e);
  if (code && STUDY_ERROR_CODES.includes(code)) return t(`study.errors.${code}`);
  return e.response.data?.message ?? t('study.errors.generic');
}

const STUDY = `${BASE}/study`;

/** §4.1 — accueil de la tuile (tout compte). */
export async function getStudyMe(): Promise<StudyMeResponse> {
  const { data } = await apiClient.get<StudyMeResponse>(`${STUDY}/me`);
  return { assemblies: data?.assemblies ?? [] };
}

/** §4.2 — unités actives ; avec `unitId`, état pour l'assemblée (verrou D-ETU-19, leçons faites). */
export async function getStudyCatalog(unitId?: string): Promise<StudyUnitForAssembly[]> {
  const { data } = await apiClient.get<StudyUnitForAssembly[]>(`${STUDY}/catalog`, {
    params: unitId ? { unitId } : undefined,
  });
  return data ?? [];
}

/** §4.3 — Commencer (dirigeant, D-ETU-07). */
export async function openStudySession(unitId: string, chapterId: string): Promise<StudySessionDetail> {
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions`, { unitId, chapterId });
  return data;
}

/** §4.3 — Passer à la correction (REPONSES_OUVERTES → CORRECTION). */
export async function startStudyCorrection(id: string): Promise<StudySessionDetail> {
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions/${id}/correction`);
  return data;
}

/** §4.3 — Terminer (REPONSES_OUVERTES | CORRECTION → TERMINEE). */
export async function finishStudySession(id: string): Promise<StudySessionDetail> {
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions/${id}/finish`);
  return data;
}

/** §4.3 / D-ETU-22 — Annuler (REPONSES_OUVERTES seulement) : séance, copies et réponses supprimées. */
export async function cancelStudySession(id: string): Promise<void> {
  await apiClient.delete(`${STUDY}/sessions/${id}`);
}

/** §4.4 — détail (lecteur). */
export async function getStudySession(id: string): Promise<StudySessionDetail> {
  const { data } = await apiClient.get<StudySessionDetail>(`${STUDY}/sessions/${id}`);
  return data;
}

/** §4.5 / D-ETU-11 — envoi du lot du brouillon ; idempotent (upsert par question). */
export async function putMyStudyAnswers(id: string, answers: StudyAnswerInput[]): Promise<StudyAnswersResult> {
  const { data } = await apiClient.put<StudyAnswersResult>(`${STUDY}/sessions/${id}/my-answers`, { answers });
  return { copy: data?.copy ?? null, ignoredQuestionIds: data?.ignoredQuestionIds ?? [] };
}

/** §4.5 / RG-ETU-07 — avis sur une ouverte de la copie du compte connecté (CORRECTION). */
export async function reviewMyStudyAnswer(
  id: string,
  questionId: string,
  verdict: StudyVerdict,
): Promise<StudyCopyView> {
  const body: StudyReviewRequest = { verdict };
  const { data } = await apiClient.post<StudyCopyView>(
    `${STUDY}/sessions/${id}/my-answers/${questionId}/review`,
    body,
  );
  return data;
}

/** §4.6 — résultats d'une séance (lecteur). */
export async function getStudyResults(id: string): Promise<StudySessionResults> {
  const { data } = await apiClient.get<StudySessionResults>(`${STUDY}/sessions/${id}/results`);
  return data;
}

/** §4.6 / D-ETU-13 — copie papier, même séance terminée (dirigeant). */
export async function addStudyPaperCopy(id: string, payload: StudyPaperCopyRequest): Promise<StudyCopyResult> {
  const { data } = await apiClient.post<StudyCopyResult>(`${STUDY}/sessions/${id}/paper-copies`, payload);
  return data;
}

/** §4.6 — modifier la note d'une copie PAPIER. */
export async function updateStudyPaperCopy(copyId: string, score: number): Promise<StudyCopyResult> {
  const body: StudyScoreRequest = { score };
  const { data } = await apiClient.patch<StudyCopyResult>(`${STUDY}/copies/${copyId}`, body);
  return data;
}

/** §4.6 — supprimer une copie PAPIER. */
export async function deleteStudyPaperCopy(copyId: string): Promise<void> {
  await apiClient.delete(`${STUDY}/copies/${copyId}`);
}

/** §4.6 / RG-ETU-13 — contenu d'une copie (auteur, dirigeant de l'assemblée). */
export async function getStudyCopy(copyId: string): Promise<StudyCopyDetail> {
  const { data } = await apiClient.get<StudyCopyDetail>(`${STUDY}/copies/${copyId}`);
  return data;
}

/** §4.6 / RG-ETU-07b — ajuster les points d'une question notée (dirigeant, à tout moment). */
export async function adjustStudyAnswer(copyId: string, questionId: string, points: number): Promise<StudyCopyDetail> {
  const body: StudyPointsRequest = { points };
  const { data } = await apiClient.patch<StudyCopyDetail>(`${STUDY}/copies/${copyId}/answers/${questionId}`, body);
  return data;
}

/** §4.7 — séances d'une assemblée, plus récentes d'abord ; `year` absent = toutes. */
export async function listStudySessions(unitId: string, year?: number): Promise<StudySessionSummary[]> {
  const { data } = await apiClient.get<StudySessionSummary[]>(`${STUDY}/units/${unitId}/sessions`, {
    params: year != null ? { year } : undefined,
  });
  return data ?? [];
}

/** §4.8 — avancement d'une assemblée, par membre. */
export async function getStudyUnitProgress(unitId: string, moduleId?: string): Promise<StudyUnitProgress> {
  const { data } = await apiClient.get<StudyUnitProgress>(`${STUDY}/units/${unitId}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data;
}

/** §4.8 / D-ETU-08 — vue d'ensemble des assemblées visibles (niveaux au-dessus). */
export async function getStudyProgressOverview(moduleId?: string): Promise<StudyAssemblyOverview[]> {
  const { data } = await apiClient.get<StudyAssemblyOverview[]>(`${STUDY}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data ?? [];
}

/** §4.8 / D-ETU-10 — Ma progression. */
export async function getMyStudyProgress(): Promise<StudyPersonProgress> {
  const { data } = await apiClient.get<StudyPersonProgress>(`${STUDY}/me/progress`);
  return data;
}

/** §4.8 — progression d'un membre (dirigeant ou lecteur de son assemblée courante). */
export async function getMemberStudyProgress(userId: string): Promise<StudyPersonProgress> {
  const { data } = await apiClient.get<StudyPersonProgress>(`${STUDY}/members/${userId}/progress`);
  return data;
}
