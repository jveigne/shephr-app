import { apiClient } from './apiClient';
import type { Language } from './authApi';

// ---------------------------------------------------------------------------------------------
//  Vie d'assemblée (D-ASM-12, JP 23/09) — réunions, comptes rendus, avancement des modules
//  d'enseignement. Tout le contrôleur est sous @RequiresModule("ASSEMBLY") : sans abonnement,
//  403 MODULE_ACCESS_DENIED. Lecture = périmètre visible (RG-ASM-05) ; écriture = DIRIGEANT_UNITE
//  de l'assemblée uniquement (RG-ASM-04, D-ASM-03), signalée par `canWrite`.
//  Dates : LocalDate « yyyy-MM-dd » ; Instant en ISO.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/church/assembly';

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyUnitResponse */
export interface AssemblyUnit {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  canWrite: boolean;
  /** D-ASM-17 : le caller en est MEMBRE — lecture seule + avancement personnel. */
  member: boolean;
  /** D-ETU-24 (JP 21/10) : langue de l'assemblée (défaut `FR`). */
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
export interface Chapter {
  id: string;
  number: number;
  title: string | null;
  orderIndex: number;
  partId: string | null;
  partNumber: number | null;
  partTitle: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.PartDto */
export interface Part {
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
  parts: Part[];
  chapters: Chapter[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingRequest — le PATCH remplace tous les champs. */
export interface MeetingRequest {
  meetingDate: string;
  breadBreaking: boolean;
  attendeeIds: string[];
  moduleId: string | null;
  chapterIds: string[];
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
  chapters: Chapter[];
  /** D-ASM-17 : le caller était coché présent. */
  attended: boolean;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AttendeeDto — nom figé à la saisie (RG-ASM-07). */
export interface Attendee {
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
  attendees: Attendee[];
  moduleId: string | null;
  moduleName: string | null;
  bookTitle: string | null;
  chapters: Chapter[];
  canWrite: boolean;
  createdById: string | null;
  createdAt: string | null;
  updatedById: string | null;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.ModuleProgress (RG-ASM-08). */
export interface ModuleProgress {
  moduleId: string;
  moduleName: string;
  bookTitle: string;
  active: boolean;
  /** Chapitres DISTINCTS lus. */
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

/** Codes 422 métier de l'API (ApiError.error) — réunions puis Étude (contrat du 21/10, §7). */
export type AssemblyErrorCode =
  | 'MEETING_ALREADY_EXISTS'
  | 'ATTENDEE_NOT_IN_ASSEMBLY'
  | 'CHAPTERS_FROM_SEVERAL_MODULES'
  | 'TEACHING_MODULE_INACTIVE'
  | 'STUDY_SESSION_ALREADY_OPEN'
  | 'STUDY_SESSION_NOT_OPEN'
  | 'STUDY_SESSION_LOCKED'
  | 'STUDY_INVALID_TRANSITION'
  | 'STUDY_SESSION_NOT_CANCELLABLE'
  | 'STUDY_PREREQUISITE_NOT_MET'
  | 'STUDY_LESSON_WITHOUT_QUESTIONS'
  | 'NOT_ASSEMBLY_MEMBER'
  | 'QUESTION_NOT_IN_LESSON'
  | 'STUDY_INVALID_ANSWER'
  | 'STUDY_NOTHING_TO_REVIEW'
  | 'STUDY_COPY_ALREADY_EXISTS'
  | 'STUDY_COPY_NOT_PAPER'
  | 'STUDY_SCORE_OUT_OF_RANGE'
  | 'STUDY_POINTS_OUT_OF_RANGE';

export async function listAssemblyUnits() {
  const { data } = await apiClient.get<AssemblyUnit[]>(`${BASE}/units`);
  return data;
}

export async function getRoster(unitId: string) {
  const { data } = await apiClient.get<RosterEntry[]>(`${BASE}/units/${unitId}/roster`);
  return data;
}

export async function listTeachingModules() {
  const { data } = await apiClient.get<TeachingModule[]>(`${BASE}/teaching-modules`);
  return data;
}

/** Sans `year` : toutes les années, date la plus récente d'abord. */
export async function listMeetings(unitId: string, year?: number) {
  const { data } = await apiClient.get<MeetingSummary[]>(`${BASE}/units/${unitId}/meetings`, {
    params: year != null ? { year } : undefined,
  });
  return data;
}

export async function createMeeting(unitId: string, body: MeetingRequest) {
  const { data } = await apiClient.post<MeetingDetail>(`${BASE}/units/${unitId}/meetings`, body);
  return data;
}

export async function getMeeting(id: string) {
  const { data } = await apiClient.get<MeetingDetail>(`${BASE}/meetings/${id}`);
  return data;
}

export async function updateMeeting(id: string, body: MeetingRequest) {
  const { data } = await apiClient.patch<MeetingDetail>(`${BASE}/meetings/${id}`, body);
  return data;
}

/** Soft delete (RG-ASM-04). */
export async function deleteMeeting(id: string) {
  await apiClient.delete(`${BASE}/meetings/${id}`);
}

export async function getUnitProgress(unitId: string) {
  const { data } = await apiClient.get<UnitProgress>(`${BASE}/units/${unitId}/progress`);
  return data;
}

/** Vue d'ensemble : une ligne par assemblée visible ; avec `moduleId`, `modules` ne contient que lui. */
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
export async function getMyMeetings() {
  const { data } = await apiClient.get<MeetingSummary[]>(`${BASE}/me/meetings`);
  return data;
}

export async function getMyProgress() {
  const { data } = await apiClient.get<MyProgress>(`${BASE}/me/progress`);
  return data;
}

export async function listProgress(moduleId?: string) {
  const { data } = await apiClient.get<UnitProgress[]>(`${BASE}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data;
}

// ---------------------------------------------------------------------------------------------
//  Statistiques de la Hiérarchie + journal consolidé (D-ASM-18, JP 08/10). Mêmes gardes de lecture
//  que le reste du module (RG-ASM-05) : aucune nouvelle règle d'accès. Le front n'affiche AUCUN
//  nom de personne à partir de ces données (que des nombres et des noms d'assemblée).
// ---------------------------------------------------------------------------------------------

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.UnitMeetingStats — une ligne par assemblée
 * visible (même ensemble que `/units`), y compris sans réunion (compteurs à 0). Compteurs bornés
 * à [from, to] ; `lastMeetingDate` toutes périodes confondues (alerte « sans CR depuis 3 semaines »).
 */
export interface UnitMeetingStats {
  unitId: string;
  unitName: string;
  cityName: string | null;
  meetingCount: number;
  /** Σ des présents de chaque réunion de la période. */
  attendanceTotal: number;
  /** Personnes (userId) distinctes présentes sur la période, dans CETTE assemblée. */
  distinctAttendees: number;
  breadBreakingCount: number;
  lastMeetingDate: string | null;
}

/** `from`/`to` : 'yyyy-MM-dd' inclus, au plus 366 jours d'écart (400 sinon). */
export async function getAssemblyStats(from: string, to: string) {
  const { data } = await apiClient.get<UnitMeetingStats[]>(`${BASE}/stats`, { params: { from, to } });
  return data;
}

/**
 * Réunions de la plage pour au plus 200 assemblées lisibles (403 sinon), triées par assemblée
 * puis date croissante. L'appelant découpe en paquets (cf. Hiérarchie : paquets de 100).
 */
export async function listMeetingsInRange(unitIds: string[], from: string, to: string) {
  const { data } = await apiClient.get<MeetingDetail[]>(`${BASE}/meetings`, {
    params: { from, to, unitIds: unitIds.join(',') },
  });
  return data;
}

// ---------------------------------------------------------------------------------------------
//  Étude de l'assemblée (plan et contrat du 21/10/2026, `/api/church/assembly/study/**`). Depuis
//  l'avenant 03 (D-ETU-28, JP 23/10) : module d'abonnement STUDY « Le Message de Bertoua »
//  (@RequiresModule("STUDY") sur StudyController, mêmes chemins) — remplace D-ETU-05. Miroirs du §8,
//  sous les MÊMES noms dans les trois fronts. Points et notes : décimaux à 2 chiffres au plus.
//  D-ETU-14 (JP 21/10) : le web n'appelle que résultats, copies papier, ajustement et avancement —
//  ni pilotage de séance (Commencer / Correction / Terminer / Annuler) ni réponse, réservés au
//  mobile ; leurs types sont repris ici pour garder les miroirs identiques.
// ---------------------------------------------------------------------------------------------

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
  /** D-ETU-25 (JP 21/10) : langue de la version d'unité étudiée. */
  moduleLanguage: Language;
  chapterId: string;
  lessonNumber: number;
  lessonTitle: string | null;
  status: StudySessionStatus;
  /** Somme des points des questions notées, figée à l'ouverture (RG-ETU-02b). */
  maxScore: number;
  openedAt: string;
  correctionAt: string | null;
  finishedAt: string | null;
  /** Copies APP + PAPIER ; renseigné pour tout lecteur sur `/units/{id}/sessions` (§4.7). */
  copyCount: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAssembly */
export interface StudyAssembly {
  unitId: string;
  unitName: string;
  /** D-ETU-24 (JP 21/10) : langue de l'assemblée. */
  language: Language;
  leader: boolean;
  participant: boolean;
  /** Séance non terminée, ou null. */
  currentSession: StudySessionSummary | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyMeResponse */
export interface StudyMeResponse {
  assemblies: StudyAssembly[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLesson — leçon = TeachingChapter (D-ETU-02). */
export interface StudyLesson {
  chapterId: string;
  number: number;
  title: string | null;
  portion: string | null;
  /** H4 : module en mode « parties » — affichage seulement. */
  partNumber: number | null;
  questionCount: number;
  maxScore: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnit — unité = TeachingModule (D-ETU-01). */
export interface StudyUnit {
  moduleId: string;
  code: string | null;
  name: string;
  bookTitle: string;
  /**
   * D-ETU-25 (JP 21/10) : langue de cette version ; les versions d'une unité partagent `code`.
   * D-ETU-26 : avec `unitId`, une seule version par `code` (celle de l'assemblée si elle existe).
   */
  language: Language;
  orderIndex: number;
  prerequisiteModuleId: string | null;
  lessons: StudyLesson[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnitForAssembly — sans `unitId` : locked = false, doneChapterIds = []. */
export interface StudyUnitForAssembly {
  unit: StudyUnit;
  /** Prérequis non atteint dans l'assemblée (D-ETU-19). */
  locked: boolean;
  /** Leçons avec une séance TERMINEE dans l'assemblée (RG-ETU-17b). */
  doneChapterIds: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyQuestionView */
export interface StudyQuestionView {
  id: string;
  number: string;
  parentId: string | null;
  statement: string;
  type: StudyQuestionType;
  answerFormat: StudyAnswerFormat | null;
  options: StudyOption[] | null;
  points: number;
  bibleReference: string | null;
  orderIndex: number;
  /** null tant que masqué (RG-ETU-12). */
  answerKey: string[] | null;
  expectedAnswer: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswerView */
export interface StudyAnswerView {
  questionId: string;
  valueText: string | null;
  valueOptions: string[] | null;
  done: boolean;
  /** null : pas encore corrigée (ouverte sans avis = 0 à la fin, D-ETU-12). */
  points: number | null;
  verdict: StudyVerdict | null;
  auto: boolean;
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

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionDetail */
export interface StudySessionDetail {
  session: StudySessionSummary;
  moduleBookTitle: string | null;
  lessonPortion: string | null;
  leader: boolean;
  participant: boolean;
  questions: StudyQuestionView[];
  myCopy: StudyCopyView | null;
  /** Dirigeant : ouvertes répondues sans avis (toutes copies) ; sinon null. */
  pendingReviewCount: number | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswerInput (mobile seulement, D-ETU-14). */
export interface StudyAnswerInput {
  questionId: string;
  valueText?: string | null;
  valueOptions?: string[] | null;
  done?: boolean | null;
  answeredAt?: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswersResult (mobile seulement, D-ETU-14). */
export interface StudyAnswersResult {
  copy: StudyCopyView | null;
  ignoredQuestionIds: string[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyReviewRequest (mobile seulement, D-ETU-14). */
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
  /** Dirigeant seulement ; sinon []. */
  withoutCopy: StudyRosterMember[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCopyDetail — réponses du manuel toujours incluses. */
export interface StudyCopyDetail {
  session: StudySessionSummary;
  copy: StudyCopyView;
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

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLessonProgress — champs de note null si non faite. */
export interface StudyLessonProgress {
  chapterId: string;
  number: number;
  title: string | null;
  done: boolean;
  bestScore: number | null;
  maxScore: number | null;
  bestCopyId: string | null;
  bestSource: StudyCopySource | null;
  doneAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyModuleProgress — Σ meilleures notes / Σ max des leçons faites. */
export interface StudyModuleProgress {
  moduleId: string;
  code: string | null;
  name: string;
  totalLessons: number;
  lessonsDone: number;
  score: number;
  maxScore: number;
  /** D-ETU-27 (JP 21/10) : versions d'un même `code` regroupées ; langues où des leçons ont été faites. */
  languages: Language[];
  lessons: StudyLessonProgress[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPersonProgress */
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

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyUnitModuleProgress — `lessonsDone` au sens de l'assemblée (RG-ETU-17b). */
export interface StudyUnitModuleProgress {
  moduleId: string;
  code: string | null;
  name: string;
  totalLessons: number;
  lessonsDone: number;
  /** D-ETU-27 (JP 21/10) : versions d'un même `code` regroupées ; langues où des leçons ont été faites. */
  languages: Language[];
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

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAssemblyOverview */
export interface StudyAssemblyOverview {
  unitId: string;
  unitName: string;
  cityId: string | null;
  cityName: string | null;
  modules: StudyUnitModuleProgress[];
}

const STUDY = `${BASE}/study`;

/**
 * Mes assemblées d'étude (répondant ou dirigeant) et leur séance en cours (§4.1). Lot ETU9 (23/10) :
 * le web s'en sert pour la langue et le rôle de dirigeant des assemblées de la page « Le Message de
 * Bertoua », qui ne lit plus `/units` (route ASSEMBLY) — D-ETU-28.
 */
export async function getStudyMe() {
  const { data } = await apiClient.get<StudyMeResponse>(`${STUDY}/me`);
  return data;
}

/** Unités actives ayant au moins une question ; avec `unitId`, état pour cette assemblée (§4.2). */
export async function getStudyCatalog(unitId?: string) {
  const { data } = await apiClient.get<StudyUnitForAssembly[]>(`${STUDY}/catalog`, {
    params: unitId ? { unitId } : undefined,
  });
  return data;
}

/** Plus récentes d'abord ; sans `year` : toutes les années (§4.7). */
export async function listStudySessions(unitId: string, year?: number) {
  const { data } = await apiClient.get<StudySessionSummary[]>(`${STUDY}/units/${unitId}/sessions`, {
    params: year != null ? { year } : undefined,
  });
  return data;
}

/** RG-ETU-14 : noms, source, notes — jamais le contenu des copies. */
export async function getStudySessionResults(sessionId: string) {
  const { data } = await apiClient.get<StudySessionResults>(`${STUDY}/sessions/${sessionId}/results`);
  return data;
}

/** D-ETU-13 : copie papier (note seule), même sur une séance terminée. */
export async function createPaperCopy(sessionId: string, body: StudyPaperCopyRequest) {
  const { data } = await apiClient.post<StudyCopyResult>(`${STUDY}/sessions/${sessionId}/paper-copies`, body);
  return data;
}

export async function updatePaperCopy(copyId: string, body: StudyScoreRequest) {
  const { data } = await apiClient.patch<StudyCopyResult>(`${STUDY}/copies/${copyId}`, body);
  return data;
}

export async function deletePaperCopy(copyId: string) {
  await apiClient.delete(`${STUDY}/copies/${copyId}`);
}

/** RG-ETU-13 : auteur ou dirigeant de l'assemblée seulement (403 sinon, superAdmin compris). */
export async function getStudyCopy(copyId: string) {
  const { data } = await apiClient.get<StudyCopyDetail>(`${STUDY}/copies/${copyId}`);
  return data;
}

/** RG-ETU-07b : points dans [0, points de la question], à tout moment, même après TERMINEE. */
export async function adjustStudyAnswer(copyId: string, questionId: string, body: StudyPointsRequest) {
  const { data } = await apiClient.patch<StudyCopyDetail>(`${STUDY}/copies/${copyId}/answers/${questionId}`, body);
  return data;
}

/** Sans `moduleId` : toutes les unités du catalogue (§4.8). */
export async function getStudyUnitProgress(unitId: string, moduleId?: string) {
  const { data } = await apiClient.get<StudyUnitProgress>(`${STUDY}/units/${unitId}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data;
}

/** Vue d'ensemble : une ligne par assemblée visible (D-ETU-08, géographie). */
export async function listStudyProgress(moduleId?: string) {
  const { data } = await apiClient.get<StudyAssemblyOverview[]>(`${STUDY}/progress`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return data;
}

/** D-ETU-10 : ma progression, toutes assemblées confondues (RG-ETU-17). */
export async function getMyStudyProgress() {
  const { data } = await apiClient.get<StudyPersonProgress>(`${STUDY}/me/progress`);
  return data;
}

export async function getMemberStudyProgress(userId: string) {
  const { data } = await apiClient.get<StudyPersonProgress>(`${STUDY}/members/${userId}/progress`);
  return data;
}
