import { apiClient } from './apiClient';
import type { Language } from './authApi';

// ---------------------------------------------------------------------------------------------
//  Vie d'assemblée (D-ASM-12, JP 23/09) — réunions, comptes rendus, avancement des modules
//  d'enseignement. Tout le contrôleur est sous @RequiresModule("ASSEMBLY") : sans abonnement,
//  403 MODULE_ACCESS_DENIED. Lecture = périmètre visible (RG-ASM-05) ; écriture = DIRIGEANT_UNITE
//  de l'assemblée uniquement (RG-ASM-04, D-ASM-03), signalée par `canWrite`.
//  D-OFF-01 / D-OFF-02 (JP 27/10, plan 05) : ASSEMBLY devient gratuit (désactivable par ministère) ;
//  est gratuit ce qui touche UNE seule assemblée (l'assemblée gratuite du compte, `free`). Toute
//  autre assemblée (lecture ET écriture) relève de l'offre Caleb (`HIERARCHIE_SUIVI`, chaîne de
//  supervision) — 403 `MODULE_ACCESS_DENIED` `details.moduleCode = 'HIERARCHIE_SUIVI'` sinon. La
//  géographie n'ouvre plus aucun CR (seule exception : le journal de ville Néhémie, ci-dessous).
//  Dates : LocalDate « yyyy-MM-dd » ; Instant en ISO.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/church/assembly';

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyUnitResponse
 * D-OFF-02 (JP 27/10) : `GET /units` ne renvoie plus la géographie, mais l'assemblée GRATUITE du
 * compte (`free = true`) et, avec l'offre Caleb (`HIERARCHIE_SUIVI`), les assemblées de sa CHAÎNE de
 * supervision (`free = false`). `canWrite` reste calculé par le serveur (D-ASM-03 + gratuite ou Caleb).
 */
export interface AssemblyUnit {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  /** D-OFF-02 (JP 27/10) : assemblée gratuite du compte (§3.2 du plan 05) ; sinon assemblée de la chaîne (Caleb). */
  free: boolean;
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
  | 'STUDY_POINTS_OUT_OF_RANGE'
  // D-ETU-39..48 (JP 23/10, avenant 05)
  | 'STUDY_QUESTION_INVALID'
  | 'STUDY_CATCH_UP_CLOSED'
  | 'STUDY_CATCH_UP_EMPTY'
  | 'STUDY_PAPER_COPY_TOO_EARLY';

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

/**
 * `from`/`to` : 'yyyy-MM-dd' inclus, au plus 366 jours d'écart (400 sinon).
 * D-ABO-31 et suivantes (JP 27/10) : bloc PAYANT de la Hiérarchie — code personnel `HIERARCHIE_SUIVI`
 * (sinon 403 `MODULE_ACCESS_DENIED` enrichi), périmètre = la CHAÎNE de leadership de l'appelant
 * (SUBTREE ; MINISTRY pour superAdmin / LEADER / SECRETARIAT), plus la géographie.
 */
export async function getAssemblyStats(from: string, to: string) {
  const { data } = await apiClient.get<UnitMeetingStats[]>(`${BASE}/stats`, { params: { from, to } });
  return data;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingSummaryLite — D-OFF-05 / P-03 (JP 27/10) :
 * réunion d'un journal CONSOLIDÉ (Caleb `/meetings?unitIds=`, Néhémie `/locality/{id}/meetings`).
 * Comme `MeetingDetail`, mais `attendeeCount` à la place de `attendees` : AUCUN nom de personne.
 * Les noms restent dans le détail d'un CR que l'on a le droit de lire (`getMeeting`).
 */
export interface MeetingSummaryLite {
  id: string;
  unitId: string;
  unitName: string | null;
  meetingDate: string;
  breadBreaking: boolean;
  /** Nombre de présents (jamais la liste). */
  attendeeCount: number;
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

/**
 * Réunions de la plage pour au plus 200 assemblées, triées par assemblée puis date croissante.
 * L'appelant découpe en paquets (cf. Hiérarchie : paquets de 100). Journal consolidé de la
 * Hiérarchie : payant (`HIERARCHIE_SUIVI`, JP 27/10) ; les `unitIds` hors de la chaîne de
 * l'appelant sont filtrés par le serveur (jamais d'erreur). Le journal de SA propre assemblée
 * passe par `listMeetings(unitId)`, qui reste gratuit.
 * D-OFF-05 / P-03 (JP 27/10, ticket O6) : `attendeeCount` seulement, plus aucun présent nommé.
 */
export async function listMeetingsInRange(unitIds: string[], from: string, to: string): Promise<MeetingSummaryLite[]> {
  const { data } = await apiClient.get<unknown[]>(`${BASE}/meetings`, {
    params: { from, to, unitIds: unitIds.join(',') },
  });
  return (data ?? []).map(toMeetingLite);
}

/**
 * Serveur antérieur au lot (liste `attendees` encore présente) : seul son NOMBRE est gardé, les noms
 * sont jetés ici et ne vont jamais plus loin (D-OFF-05 / P-03) — même garde que le mobile.
 */
function toMeetingLite(raw: unknown): MeetingSummaryLite {
  const { attendees, ...rest } = (raw ?? {}) as Record<string, unknown> & { attendees?: unknown };
  const count = (rest as { attendeeCount?: unknown }).attendeeCount;
  return {
    ...(rest as unknown as MeetingSummaryLite),
    attendeeCount: typeof count === 'number' ? count : Array.isArray(attendees) ? attendees.length : 0,
    chapters: ((rest as { chapters?: Chapter[] }).chapters ?? []) as Chapter[],
  };
}

// ---------------------------------------------------------------------------------------------
//  Journal de la VILLE — offre Néhémie, code de droit `JOURNAL` (D-OFF-05, JP 27/10 ; plan 05 §3.3,
//  ticket O4). Axe GÉOGRAPHIQUE (assemblées de la ville), jamais la chaîne de supervision (Caleb).
//  `requireActive(JOURNAL, ville)` côté serveur : sans droit, 403 `MODULE_ACCESS_DENIED` enrichi
//  `details { moduleCode: 'JOURNAL', nodeId: ville, canSubscribe }` → verrou, jamais un toast.
//  AUCUN nom de personne : nombres et noms d'assemblées seulement.
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyLocality — même forme que `StudyLocalitySummary`. */
export interface AssemblyLocality {
  localityId: string;
  localityName: string;
  assemblyCount: number;
  /** `JOURNAL` actif sur la ville (cadenas sinon) — affichage seulement, le serveur reste juge. */
  entitled: boolean;
  /** RG-ABO-22 — le compte peut souscrire pour cette ville (web seulement). */
  canSubscribe: boolean;
}

/** Villes visibles du compte pour le journal de ville (D-ABO-21) ; vide pour un membre ou un dirigeant d'unité. */
export async function listAssemblyLocalities(): Promise<AssemblyLocality[]> {
  const { data } = await apiClient.get<AssemblyLocality[]>(`${BASE}/localities`);
  return data ?? [];
}

/** Une ligne par assemblée de la ville (compteurs bornés à [from, to], ≤ 366 jours) — `JOURNAL`. */
export async function getLocalityMeetingStats(localityId: string, from: string, to: string): Promise<UnitMeetingStats[]> {
  const { data } = await apiClient.get<UnitMeetingStats[]>(`${BASE}/locality/${localityId}/stats`, { params: { from, to } });
  return data ?? [];
}

/** Réunions de la ville sur [from, to] pour le journal PDF consolidé — `attendeeCount` seulement (D-OFF-05). */
export async function listLocalityMeetings(localityId: string, from: string, to: string): Promise<MeetingSummaryLite[]> {
  const { data } = await apiClient.get<unknown[]>(`${BASE}/locality/${localityId}/meetings`, { params: { from, to } });
  return (data ?? []).map(toMeetingLite);
}

// ---------------------------------------------------------------------------------------------
//  Étude de l'assemblée (plan et contrat du 21/10/2026, `/api/church/assembly/study/**`). Depuis
//  l'avenant 03 (D-ETU-28, JP 23/10) : module d'abonnement STUDY « Le Message de Bertoua »
//  (@RequiresModule("STUDY") sur StudyController, mêmes chemins) — remplace D-ETU-05. Miroirs du §8,
//  sous les MÊMES noms dans les trois fronts. Points et notes : décimaux à 2 chiffres au plus.
//  D-ETU-14 levée (JP 27/10, décision n°3 — parité mobile → web, D-WEB-02) : le web pilote
//  (Commencer / Correction / Terminer / Annuler) et répond (lot de réponses, avis en correction,
//  rattrapage), sous les MÊMES noms de fonctions que le mobile. Les noms web antérieurs
//  (createPaperCopy, updatePaperCopy, deletePaperCopy, getStudySessionResults, listStudyProgress)
//  sont conservés.
//  Avenant 05 (lot ETU11, D-ETU-38..46, JP 23/10) : une leçon en plusieurs séances (plage de
//  questions) et rattrapage à la maison (source RATTRAPAGE). Champs ajoutés FACULTATIFS : un backend
//  antérieur à ETU11 ne les envoie pas, le web retombe alors sur l'affichage d'avant.
// ---------------------------------------------------------------------------------------------

// Mirrors com.excellence.back.assembly.StudyQuestion / StudySession / StudyCopy / StudyAnswer (enums imbriqués)
export type StudyQuestionType = 'VRAI_FAUX' | 'OUI_NON' | 'CHOIX_UNIQUE' | 'CHOIX_MULTIPLE'
  | 'OUVERTE' | 'PERSONNELLE' | 'EXERCICE' | 'CONSIGNE';
export type StudyAnswerFormat = 'TEXT' | 'YES_NO';
export type StudySessionStatus = 'REPONSES_OUVERTES' | 'CORRECTION' | 'TERMINEE';
/** D-ETU-44 (JP 23/10) : `RATTRAPAGE` = copie remplie seul dans l'app après la fin de la séance. */
export type StudyCopySource = 'APP' | 'PAPIER' | 'RATTRAPAGE';
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
  /** D-ETU-38 / D-ETU-39 (JP 23/10) : première question (premier niveau) de la plage de la séance. */
  firstQuestionNumber?: string | null;
  /** D-ETU-40 (JP 23/10) : dernière question de la plage, fixée au passage en correction — null avant. */
  lastQuestionNumber?: string | null;
  /** D-ETU-40 (JP 23/10) : questions de la plage (avant correction : jusqu'à la fin de la leçon). */
  questionCount?: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCatchUp — séance que l'appelant peut rattraper (D-ETU-44 / D-ETU-45, JP 23/10). */
export interface StudyCatchUp {
  sessionId: string;
  chapterId: string;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string;
  lessonNumber: number;
  lessonTitle: string | null;
  /** D-ETU-38 / D-ETU-40 (JP 23/10) : plage de la séance (premier niveau) ; null pour une leçon sans question de premier niveau. */
  firstQuestionNumber: string | null;
  lastQuestionNumber: string | null;
  /** Questions de la plage. */
  questionCount: number;
  /** Date de fin de la séance. */
  finishedAt: string;
  /** D-ETU-44 (JP 23/10) : rattrapage commencé (copie RATTRAPAGE non envoyée). */
  started: boolean;
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
  /** D-ETU-44 / D-ETU-45 (JP 23/10) : séances à rattraper par l'appelant — absent d'un serveur antérieur. */
  catchUps?: StudyCatchUp[] | null;
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
  /**
   * D-ETU-33 / D-ETU-34 (JP 23/10) : recommandations au dirigeant de la leçon — renseignées seulement
   * si l'appelant est dirigeant de l'assemblée `unitId` du catalogue ; sinon null. Lecture seule.
   */
  leaderNotes?: string | null;
  /** D-ETU-33 (JP 23/10) : actions des membres de la leçon (null = aucune), pour tous. Lecture seule. */
  memberActions?: string[] | null;
  /**
   * D-ETU-49 (JP 23/10) : première question de premier niveau non couverte dans l'assemblée `unitId`
   * du catalogue ; null si la leçon est entièrement couverte, et toujours null sans `unitId`.
   * Facultatif : un backend antérieur à ETU11b ne l'envoie pas. Affiché par le web depuis D-WEB-02 (JP 27/10).
   */
  nextQuestionNumber?: string | null;
  /** D-ETU-49 (JP 23/10) : numéros des questions de premier niveau, dans l'ordre (avec ou sans `unitId`). Facultatif. */
  topLevelNumbers?: string[];
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
  /** D-ETU-33 / D-ETU-34 (JP 23/10) : recommandations au dirigeant de l'unité (dirigeant de `unitId` seulement, sinon null). */
  leaderNotes?: string | null;
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
  /** D-ETU-44 / D-ETU-45 (JP 23/10) : RATTRAPAGE — envoi de la copie ; null tant que non envoyée (et pour APP / PAPIER). */
  submittedAt?: string | null;
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
  /** D-ETU-34 (JP 23/10) : recommandations au dirigeant de l'unité — renseignées si `leader`, sinon null. */
  moduleLeaderNotes?: string | null;
  /** D-ETU-34 (JP 23/10) : recommandations au dirigeant de la leçon — renseignées si `leader`, sinon null. */
  lessonLeaderNotes?: string | null;
  /** D-ETU-36 (JP 23/10) : actions des membres — dirigeant toujours ; autre lecteur seulement à TERMINEE, sinon null. */
  memberActions?: string[] | null;
  /** D-ETU-44 / D-ETU-45 (JP 23/10) : l'appelant peut rattraper cette séance maintenant. Absent d'un serveur antérieur. */
  catchUpOpen?: boolean;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionRequest — `POST /study/sessions`. */
export interface StudySessionRequest {
  unitId: string;
  chapterId: string;
  /**
   * D-ETU-39 (JP 23/10) : numéro de premier niveau du point de départ ; absent = première question
   * non encore couverte dans l'assemblée (ou le début si la leçon est entièrement couverte).
   */
  startQuestionNumber?: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCorrectionRequest — corps facultatif. */
export interface StudyCorrectionRequest {
  /** D-ETU-40 (JP 23/10) : « on s'arrête à la question N » (premier niveau) ; absent = la dernière. */
  lastQuestionNumber?: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyAnswerInput — forme selon le type : contrat §2.3. */
export interface StudyAnswerInput {
  questionId: string;
  valueText?: string | null;
  valueOptions?: string[] | null;
  done?: boolean | null;
  /** D-ETU-11 : horloge du poste au moment de la saisie (RG-ETU-04). */
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
  /** APP / RATTRAPAGE : questions répondues ; PAPIER : 0. */
  answeredCount: number;
  /** D-ETU-46 (JP 23/10) : ouvertes répondues sans avis du dirigeant (comptent 0, RG-ETU-07). */
  pendingReview?: boolean;
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

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPointsRequest. D-ETU-46 (JP 23/10) : avis du
 * dirigeant sur une ouverte (rattrapage) par `verdict` — `points` absent = barème du verdict, calculé
 * par le serveur (jamais ici).
 */
export interface StudyPointsRequest {
  points?: number | null;
  verdict?: StudyVerdict | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLessonProgress — champs de note null si non faite. */
export interface StudyLessonProgress {
  chapterId: string;
  number: number;
  title: string | null;
  done: boolean;
  bestScore: number | null;
  maxScore: number | null;
  /** D-ETU-43 (JP 23/10) : copie la plus récente ayant contribué — peut être null si plusieurs. */
  bestCopyId: string | null;
  bestSource: StudyCopySource | null;
  doneAt: string | null;
  /** D-ETU-42 / D-ETU-43 (JP 23/10) : questions de premier niveau couvertes / de la leçon. */
  coveredQuestions?: number;
  totalQuestions?: number;
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

/**
 * §4.4 — détail d'une séance (lecteur, même garde que `/results`) : cible de la relecture ≈ 5 s de
 * la page de séance (D-ETU-23) et des actions des membres d'une séance TERMINEE (D-ETU-36).
 */
export async function getStudySession(sessionId: string) {
  const { data } = await apiClient.get<StudySessionDetail>(`${STUDY}/sessions/${sessionId}`);
  return data;
}

// ---- Pilotage et réponse (D-WEB-02, JP 27/10 — D-ETU-14 levée) : mêmes noms que le mobile ----

/**
 * §4.3 — Commencer (dirigeant, D-ETU-07). D-ETU-39 (JP 23/10) : `startQuestionNumber` absent = défaut
 * du serveur (première question non couverte) ; inconnu ou sous-question → 422 STUDY_QUESTION_INVALID.
 */
export async function openStudySession(
  unitId: string,
  chapterId: string,
  startQuestionNumber?: string | null,
): Promise<StudySessionDetail> {
  const body: StudySessionRequest = { unitId, chapterId };
  if (startQuestionNumber) body.startQuestionNumber = startQuestionNumber;
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions`, body);
  return data;
}

/**
 * §4.3 — Passer à la correction (REPONSES_OUVERTES → CORRECTION). D-ETU-40 (JP 23/10) :
 * `lastQuestionNumber` = « on s'arrête à la question N » ; absent = la dernière (corps omis).
 */
export async function startStudyCorrection(id: string, lastQuestionNumber?: string | null): Promise<StudySessionDetail> {
  const body: StudyCorrectionRequest | undefined = lastQuestionNumber ? { lastQuestionNumber } : undefined;
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions/${id}/correction`, body);
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

/** §4.5 / D-ETU-11 — envoi du lot du brouillon ; idempotent (upsert par question). */
export async function putMyStudyAnswers(id: string, answers: StudyAnswerInput[]): Promise<StudyAnswersResult> {
  const { data } = await apiClient.put<StudyAnswersResult>(`${STUDY}/sessions/${id}/my-answers`, { answers });
  return { copy: data?.copy ?? null, ignoredQuestionIds: data?.ignoredQuestionIds ?? [] };
}

/** §4.5 / RG-ETU-07 — avis sur une ouverte de la copie du compte connecté (CORRECTION, RG-ETU-10). */
export async function reviewMyStudyAnswer(id: string, questionId: string, verdict: StudyVerdict): Promise<StudyCopyView> {
  const body: StudyReviewRequest = { verdict };
  const { data } = await apiClient.post<StudyCopyView>(`${STUDY}/sessions/${id}/my-answers/${questionId}/review`, body);
  return data;
}

/**
 * D-ETU-44 (JP 23/10) — « Envoyer ma copie » de rattrapage : le serveur corrige les fermées, pose
 * `submittedAt` et calcule la note. Rien à envoyer → STUDY_CATCH_UP_EMPTY ; fenêtre fermée →
 * STUDY_CATCH_UP_CLOSED. Le corps de la réponse n'est pas lu : la page relit la séance (§4.4).
 */
export async function submitStudyCatchUp(id: string): Promise<void> {
  await apiClient.post(`${STUDY}/sessions/${id}/catch-up/submit`);
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

/**
 * RG-ETU-07b : points dans [0, points de la question], à tout moment, même après TERMINEE.
 * D-ETU-46 (JP 23/10) : ou `{ verdict }` (avis sur une ouverte d'un rattrapage).
 */
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

// ---------------------------------------------------------------------------------------------
// Suivi de l'étude à l'échelle de la VILLE — lot « pro-plan » (contrat 27/10 §7.2 → §7.6, §10.4).
// D-ETU-53 (JP 27/10) : lecture seule, pour les responsables de la ville (D-ABO-21) ; le code de
// droit ETUDE_SUIVI est vérifié PAR VILLE par le serveur (403 MODULE_ACCESS_DENIED enrichi, §3).
// D-ETU-55 : aucune de ces routes ne porte le texte d'une réponse (jamais de PERSONNELLE).
// Web : exports CSV / PDF en blob (contrat §7.7, §12.1) ; le mobile n'en a pas (§12.2).
// ---------------------------------------------------------------------------------------------

// Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocality* (contrat 27/10 §7)
/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyMemberStatus */
export type StudyMemberStatus = 'TAUGHT' | 'NOT_TAUGHT' | 'MISSED';

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalitySummary */
export interface StudyLocalitySummary {
  localityId: string;
  localityName: string;
  /** ETUDE_SUIVI actif sur la ville (cadenas sinon, contrat §9.3). */
  entitled: boolean;
  /** RG-ABO-22 — le compte peut souscrire pour cette ville (« S'abonner », web seulement). */
  canSubscribe: boolean;
  assemblyCount: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityLesson */
export interface StudyLocalityLesson {
  number: number;
  title: string;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityModule */
export interface StudyLocalityModule {
  moduleId: string;
  code: string | null;
  name: string;
  totalLessons: number;
  lessons: StudyLocalityLesson[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityAssemblyModule */
export interface StudyLocalityAssemblyModule {
  moduleId: string;
  /** D-ETU-42 — leçons faites par l'assemblée. */
  lessonsDone: number;
  doneLessonNumbers: number[];
  lastSessionAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityAssembly */
export interface StudyLocalityAssembly {
  unitId: string;
  unitName: string;
  memberCount: number;
  lastSessionAt: string | null;
  modules: StudyLocalityAssemblyModule[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityOverview */
export interface StudyLocalityOverview {
  localityId: string;
  localityName: string;
  modules: StudyLocalityModule[];
  assemblies: StudyLocalityAssembly[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyMissedLesson */
export interface StudyMissedLesson {
  moduleId: string;
  number: number;
  title: string;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityMember */
export interface StudyLocalityMember {
  userId: string;
  fullName: string;
  unitId: string;
  unitName: string;
  /** Au moins une copie comptée dans une séance TERMINEE (D-ETU-53). */
  taught: boolean;
  lessonsDone: number;
  totalLessons: number;
  /** Leçons faites par son assemblée (D-ETU-42) qu'il n'a pas faites (D-ETU-43). */
  missedLessons: StudyMissedLesson[];
  /** RG-ETU-17 / D-ETU-43 — calculées par le serveur, null si aucune leçon faite. */
  score: number | null;
  maxScore: number | null;
  lastDoneAt: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityMonth */
export interface StudyLocalityMonth {
  /** "YYYY-MM" */
  month: string;
  sessionCount: number;
  copyCount: number;
  taughtMemberCount: number;
  averagePercent: number | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLocalityStats */
export interface StudyLocalityStats {
  localityId: string;
  localityName: string;
  from: string;
  to: string;
  assemblyCount: number;
  activeAssemblyCount: number;
  memberCount: number;
  taughtMemberCount: number;
  sessionCount: number;
  lessonsDoneCount: number;
  copyCount: number;
  averagePercent: number | null;
  months: StudyLocalityMonth[];
}

/**
 * §7.2 — villes dont l'appelant est lecteur (D-ABO-21). `[]` pour un membre ou un dirigeant d'unité :
 * c'est le signal qui masque l'entrée « Suivi de la ville » (RG-ABO-22).
 */
export async function listStudyLocalities(): Promise<StudyLocalitySummary[]> {
  const { data } = await apiClient.get<StudyLocalitySummary[]>(`${STUDY}/localities`);
  return data ?? [];
}

/** §7.4 — avancement des assemblées de la ville, par unité × leçon. */
export async function getStudyLocalityOverview(localityId: string, moduleId?: string): Promise<StudyLocalityOverview> {
  const { data } = await apiClient.get<StudyLocalityOverview>(`${STUDY}/locality/${localityId}/overview`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return { ...data, modules: data?.modules ?? [], assemblies: data?.assemblies ?? [] };
}

/** §7.5 — membres de la ville (enseignés / non enseignés / leçons manquées). */
export async function listStudyLocalityMembers(
  localityId: string,
  params?: { status?: StudyMemberStatus; moduleId?: string; unitId?: string },
): Promise<StudyLocalityMember[]> {
  const query: Record<string, string> = {};
  if (params?.status) query.status = params.status;
  if (params?.moduleId) query.moduleId = params.moduleId;
  if (params?.unitId) query.unitId = params.unitId;
  const { data } = await apiClient.get<StudyLocalityMember[]>(`${STUDY}/locality/${localityId}/members`, {
    params: query,
  });
  return data ?? [];
}

/** §7.6 — statistiques de la ville sur une période (`YYYY-MM-DD`, défauts du serveur). */
export async function getStudyLocalityStats(
  localityId: string,
  params?: { from?: string; to?: string; moduleId?: string },
): Promise<StudyLocalityStats> {
  const query: Record<string, string> = {};
  if (params?.from) query.from = params.from;
  if (params?.to) query.to = params.to;
  if (params?.moduleId) query.moduleId = params.moduleId;
  const { data } = await apiClient.get<StudyLocalityStats>(`${STUDY}/locality/${localityId}/stats`, {
    params: query,
  });
  return { ...data, months: data?.months ?? [] };
}

/**
 * §7.7 — export du suivi de la ville, en octets (comme `/invoices/{n}/pdf`). `Content-Disposition`
 * n'est pas exposé en CORS : l'appelant nomme le fichier `suivi-etude-{AAAA-MM-JJ}.{ext}`. Web seulement.
 */
export async function downloadStudyLocalityExport(localityId: string, format: 'csv' | 'pdf', moduleId?: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`${STUDY}/locality/${localityId}/export`, {
    params: moduleId ? { format, moduleId } : { format },
    responseType: 'blob',
  });
  return data;
}

// ---------------------------------------------------------------------------------------------
// « Le Message de Bertoua » dans la HIÉRARCHIE — suite du lot « pro-plan » (JP 27/10, D-ABO-31 et
// suivantes). Axe de la CHAÎNE de leadership (supervisor_id récursif), jamais la géographie : code
// personnel `HIERARCHIE_SUIVI` vérifié par le serveur (403 `MODULE_ACCESS_DENIED` enrichi sinon),
// `@RequiresModule("STUDY")` conservé (gratuit, interrupteur). Mêmes définitions que la vue de ville
// (D-ETU-53 enseigné, D-ETU-42 leçon faite, D-ETU-43 moyenne). D-ETU-55 : aucune réponse, aucun nom
// de membre, aucun contenu PERSONNELLE.
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyLesson */
export interface StudyHierarchyLesson {
  id: string;
  number: number | null;
  title: string;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyModule */
export interface StudyHierarchyModule {
  id: string;
  code: string | null;
  name: string;
  lessons: StudyHierarchyLesson[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyUnit */
export interface StudyHierarchyUnit {
  unitId: string;
  unitName: string;
  cityName: string | null;
  leaderName: string | null;
  /** Dirigeants de la chaîne entre l'appelant et l'assemblée, du plus haut au plus bas. */
  supervisorChain: string[];
  memberCount: number;
  /** D-ETU-53 — membres avec au moins une copie comptée dans une séance TERMINEE. */
  taughtCount: number;
  notTaughtCount: number;
  /** D-ETU-42 — leçons (TeachingChapter.id) faites par l'assemblée. */
  doneLessonIds: string[];
  /** D-ETU-43 — moyenne des notes en %, calculée par le serveur ; null sans leçon faite. */
  averageScorePercent: number | null;
  lastSessionDate: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyOverview */
export interface StudyHierarchyOverview {
  units: StudyHierarchyUnit[];
  modules: StudyHierarchyModule[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyMonth */
export interface StudyHierarchyMonth {
  /** "yyyy-MM" */
  month: string;
  sessionsFinished: number;
  membersTaught: number;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyStats */
export interface StudyHierarchyStats {
  sessionsFinished: number;
  lessonsDone: number;
  membersTaught: number;
  averageScorePercent: number | null;
  monthly: StudyHierarchyMonth[];
}

/** Vue d'ensemble assemblées × leçons de la chaîne de l'appelant (`moduleId` facultatif). */
export async function getStudyHierarchyOverview(moduleId?: string): Promise<StudyHierarchyOverview> {
  const { data } = await apiClient.get<StudyHierarchyOverview>(`${STUDY}/hierarchy/overview`, {
    params: moduleId ? { moduleId } : undefined,
  });
  return {
    units: (data?.units ?? []).map((u) => ({
      ...u,
      supervisorChain: u.supervisorChain ?? [],
      doneLessonIds: u.doneLessonIds ?? [],
    })),
    modules: (data?.modules ?? []).map((m) => ({ ...m, lessons: m.lessons ?? [] })),
  };
}

/**
 * Statistiques des séances TERMINEE terminées dans la période (`yyyy-MM-dd` inclus, Europe/Paris),
 * plage ≤ 731 jours (400 sinon).
 */
export async function getStudyHierarchyStats(from: string, to: string): Promise<StudyHierarchyStats> {
  const { data } = await apiClient.get<StudyHierarchyStats>(`${STUDY}/hierarchy/stats`, { params: { from, to } });
  return { ...data, monthly: data?.monthly ?? [] };
}
