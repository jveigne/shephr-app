import { apiClient } from '@/services/apiClient';
import type { Language } from '@/services/authApi';

// Vie d'assemblée (plan 23/09, §5.2 — lot L5) : réunions, comptes rendus, modules d'enseignement,
// avancement. Tous les endpoints sont sous /api/church/assembly et gatés @RequiresModule("ASSEMBLY")
// (D-ASM-12) : sans abonnement, 403 MODULE_ACCESS_DENIED — l'onglet est de toute façon masqué.
// D-OFF-01 (JP 27/10) : ASSEMBLY est désormais GRATUIT et ouvert par défaut (désactivable par
// ministère par le SUPER_ADMIN) ; au-delà de l'assemblée gratuite, les routes d'une autre assemblée
// répondent 403 `MODULE_ACCESS_DENIED` / `HIERARCHIE_SUIVI` (offre Caleb, D-OFF-02 / D-OFF-04).
// Dates LocalDate = 'yyyy-MM-dd' ; Instant = ISO.

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyUnitResponse
 *
 * D-OFF-02 (JP 27/10, plan `05_Plan_Offres_Caleb_Nehemie.md` §3.2-§3.3) : `GET /units` ne suit plus
 * la géographie — il renvoie l'« assemblée gratuite » du compte (`free = true` : rattachement, à
 * défaut sa plus ancienne affectation de DIRIGEANT_UNITE) puis, avec l'offre Caleb
 * (HIERARCHIE_SUIVI), les assemblées de sa CHAÎNE de supervision (`free = false`). Toute autre
 * assemblée répond 403 `MODULE_ACCESS_DENIED` / `HIERARCHIE_SUIVI` (verrou Caleb, jamais un toast).
 */
export interface AssemblyUnit {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  /**
   * D-OFF-02 (JP 27/10) : assemblée gratuite du compte (CR, journal, réunions, présences, avancement
   * et Member Care sans abonnement). Facultatif : absent d'un serveur antérieur au lot (traité vrai).
   */
  free?: boolean;
  /**
   * D-ASM-03 / RG-ASM-04 : le caller est l'un des DIRIGEANT_UNITE de l'assemblée — et, depuis
   * D-OFF-02 (JP 27/10), l'assemblée est sa gratuite ou il a l'offre Caleb. Calculé PAR LE SERVEUR.
   */
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

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.MeetingSummaryLite — O6 (plan 27/10
 * `05_Plan_Offres_Caleb_Nehemie.md` §4, D-OFF-05 par analogie, P-03) : comme `MeetingDetail`, mais
 * le NOMBRE de présents (`attendeeCount`) à la place de la liste nommée `attendees`. Renvoyé par
 * `GET /meetings?unitIds=` (journal consolidé Caleb) : aucun nom de personne n'y transite ; les noms
 * restent dans le détail d'un CR que l'on a le droit de lire.
 */
export interface MeetingSummaryLite {
  id: string;
  unitId: string;
  unitName: string | null;
  meetingDate: string;
  breadBreaking: boolean;
  attendeeCount: number;
  moduleId: string | null;
  moduleName: string | null;
  bookTitle: string | null;
  chapters: TeachingChapter[];
  canWrite: boolean;
  // D-FIX-2A (JP 29/10, constat E-13) : `createdById` / `updatedById` retirés du contrat — aucun
  // identifiant d'auteur dans une vue consolidée.
  createdAt: string | null;
  updatedAt: string | null;
}

/** Le backend refuse plus de 200 assemblées par appel ; on découpe par 100 (D-ASM-18). */
const MEETINGS_RANGE_CHUNK = 100;

/**
 * D-ASM-18 — réunions (chapitres et NOMBRE de présents, O6) de plusieurs assemblées sur une plage,
 * pour le journal consolidé. Un appel par paquet de 100 assemblées, en séquence ; l'ordre global
 * n'est pas garanti d'un paquet à l'autre (le journal regroupe et trie lui-même).
 * Serveur antérieur au lot (liste `attendees` encore présente) : seul son nombre est gardé, les
 * noms sont jetés ici et ne vont jamais plus loin.
 */
export async function listMeetingsInRange(
  unitIds: string[],
  from: string,
  to: string,
): Promise<MeetingSummaryLite[]> {
  const out: MeetingSummaryLite[] = [];
  for (let i = 0; i < unitIds.length; i += MEETINGS_RANGE_CHUNK) {
    const chunk = unitIds.slice(i, i + MEETINGS_RANGE_CHUNK);
    const { data } = await apiClient.get<any[]>(`${BASE}/meetings`, {
      params: { from, to, unitIds: chunk.join(',') },
    });
    for (const m of data ?? []) out.push(toMeetingLite(m));
  }
  return out;
}

/** Réunion consolidée : seul le NOMBRE de présents est gardé (O6) — les noms d'un serveur ancien sont jetés ici. */
function toMeetingLite(m: any): MeetingSummaryLite {
  // D-FIX-2A (E-13) : un serveur antérieur envoie encore les identifiants d'auteur — jetés ici aussi.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { attendees, createdById, updatedById, ...rest } = m ?? {};
  return {
    ...rest,
    attendeeCount:
      typeof m?.attendeeCount === 'number' ? m.attendeeCount : Array.isArray(attendees) ? attendees.length : 0,
    chapters: m?.chapters ?? [],
  } as MeetingSummaryLite;
}

// ─── Journal de la ville — offre Néhémie, code `JOURNAL` (D-OFF-05, JP 27/10 ; lève M-01, JP 28/10) ───
//
// Axe GÉOGRAPHIQUE (`getAllVisibleLocalityIds`, D-ABO-21), lecture seule. Sans `JOURNAL` actif sur la
// ville, `/locality/{id}/**` répond 403 `MODULE_ACCESS_DENIED` enrichi `details { moduleCode: 'JOURNAL',
// nodeId: ville, canSubscribe }` (`cityJournalAccessDenied`) → verrou, jamais un toast. AUCUN nom de
// personne : nombres et noms d'assemblées seulement. Miroirs identiques au web (`web/src/services/assemblyApi.ts`).

/** Mirrors com.excellence.back.assembly.AssemblyDtos.AssemblyLocality — même forme que `StudyLocalitySummary`. */
export interface AssemblyLocality {
  localityId: string;
  localityName: string;
  assemblyCount: number;
  /** `JOURNAL` actif sur la ville (cadenas sinon) — affichage seulement, le serveur reste juge. */
  entitled: boolean;
  /** RG-ABO-22 — le compte peut souscrire pour cette ville (web seulement : jamais lu pour un paiement ici). */
  canSubscribe: boolean;
}

/** Villes visibles du compte pour le journal de ville (D-ABO-21) ; vide pour un membre ou un dirigeant d'unité. */
export async function listAssemblyLocalities(): Promise<AssemblyLocality[]> {
  const { data } = await apiClient.get<AssemblyLocality[]>(`${BASE}/localities`);
  return data ?? [];
}

/** Une ligne par assemblée de la ville (compteurs bornés à [from, to], ≤ 366 jours) — `JOURNAL`. */
export async function getLocalityMeetingStats(localityId: string, from: string, to: string): Promise<UnitMeetingStats[]> {
  const { data } = await apiClient.get<UnitMeetingStats[]>(`${BASE}/locality/${localityId}/stats`, {
    params: { from, to },
  });
  return data ?? [];
}

/** Réunions de la ville sur [from, to] pour le journal PDF consolidé — `attendeeCount` seulement (D-OFF-05). */
export async function listLocalityMeetings(localityId: string, from: string, to: string): Promise<MeetingSummaryLite[]> {
  const { data } = await apiClient.get<any[]>(`${BASE}/locality/${localityId}/meetings`, { params: { from, to } });
  return (data ?? []).map(toMeetingLite);
}

// ─── Étude de l'assemblée (plan 21/10, contrat 02_Contrat_API_Etude.md §4 et §8) ─────────────────
//
// Questionnaire en réunion, programme « Le Message de Bertoua ». Même préfixe que Vie d'assemblée,
// sous `/study/**` parce que `/units` désigne déjà les assemblées ; garde propre depuis l'avenant 03 :
// `@RequiresModule("STUDY")` (D-ETU-28, JP 23/10 — remplace D-ETU-05). Le lien avec le CR passe
// par le catalogue partagé (D-ETU-29) : aucune clé entre séance et réunion. Une unité d'étude est un
// `TeachingModule` (D-ETU-01), une leçon un `TeachingChapter` (D-ETU-02). Les droits viennent DU
// SERVEUR (`leader`, `participant` de chaque réponse) : ne jamais les recalculer ici.
// Points et notes : nombres à 2 décimales au plus (`BigDecimal` côté Java, contrat §1.1).

// Mirrors com.excellence.back.assembly.StudyQuestion / StudySession / StudyCopy / StudyAnswer (enums imbriqués)
export type StudyQuestionType = 'VRAI_FAUX' | 'OUI_NON' | 'CHOIX_UNIQUE' | 'CHOIX_MULTIPLE'
  | 'OUVERTE' | 'PERSONNELLE' | 'EXERCICE' | 'CONSIGNE';
export type StudyAnswerFormat = 'TEXT' | 'YES_NO';
export type StudySessionStatus = 'REPONSES_OUVERTES' | 'CORRECTION' | 'TERMINEE';
/** D-ETU-44 (JP 23/10) : `RATTRAPAGE` = copie d'un absent, répondue seul dans l'app après la séance. */
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
  /**
   * D-ETU-38/39 (JP 23/10) : première question (de premier niveau) de la plage de la séance.
   * Facultatif : absent d'un serveur antérieur au lot ETU11 (la séance couvre alors toute la leçon).
   */
  firstQuestionNumber?: string | null;
  /** D-ETU-40 (JP 23/10) : dernière question de la plage — null tant que la correction n'a pas fixé la fin. */
  lastQuestionNumber?: string | null;
  /** D-ETU-40 (JP 23/10) : questions de la plage (jusqu'à la fin de la leçon avant la correction). */
  questionCount?: number;
}

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyCatchUp — D-ETU-44/45 (JP 23/10) : séance
 * TERMINEE que l'appelant (répondant sans copie) peut encore rattraper seul dans l'app.
 */
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
  /** D-ETU-24 (JP 21/10) : langue de l'assemblée — référence de la pastille FR / EN (D-ETU-26). */
  language: Language;
  /** D-ETU-07 : DIRIGEANT_UNITE de l'assemblée — pilote la séance. */
  leader: boolean;
  /** D-ETU-06 : répondant (goalUnitId = l'assemblée, tout rôle, ou dirigeant). */
  participant: boolean;
  /** Séance non terminée (RG-ETU-02 : une au plus), ou null. */
  currentSession: StudySessionSummary | null;
  /** D-ETU-44/45 (JP 23/10) : séances à rattraper (« À rattraper ») — absent d'un serveur antérieur. */
  catchUps?: StudyCatchUp[] | null;
  /**
   * D-BER-02 (JP 29/10) : assemblée gratuite de l'appelant (AccessControlService.freeAssemblyId) —
   * vraie aussi pour un simple répondant dont c'est le `goalUnitId`. Absent d'un serveur antérieur.
   */
  free?: boolean;
  /**
   * D-BER-07 (JP 29/10) : écritures de pilotage permises (Commencer, copie papier, ajustement) —
   * `leader && (free || HIERARCHIE_SUIVI || superAdmin)`, calculé PAR LE SERVEUR. Absent = vrai.
   */
  canPilot?: boolean;
  /** D-BER-02 (JP 29/10) : 'HIERARCHIE_SUIVI' quand le dirigeant n'a pas Caleb sur cette assemblée ; null sinon. */
  pilotLock?: 'HIERARCHIE_SUIVI' | null;
  /**
   * RG-BER-05 (JP 29/10) : peut souscrire Caleb. Miroir seulement — le mobile l'IGNORE (D-ABO-13,
   * D-OFF-09 : aucun bouton de paiement).
   */
  canSubscribe?: boolean;
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
  /**
   * D-ETU-33/34 (JP 23/10) : recommandations au dirigeant (texte brut, D-ETU-37) — renseignées
   * seulement avec `?unitId=` et si l'appelant est dirigeant de l'assemblée ; null sinon.
   */
  leaderNotes?: string | null;
  /** D-ETU-33 (JP 23/10) : « Chaque membre de l'assemblée doit : … » — pour tous ; null = aucune. */
  memberActions?: string[] | null;
  /**
   * D-ETU-49 (JP 23/10, avenant 05 §8) : première question de premier niveau non couverte dans
   * l'assemblée de `?unitId=` (départ par défaut de la prochaine séance, D-ETU-39) ; null si la leçon
   * est entièrement couverte (reprise au début) ou sans `unitId`. Facultatif : absent d'un backend
   * antérieur à ETU11b.
   */
  nextQuestionNumber?: string | null;
  /** D-ETU-49 (JP 23/10) : numéros des questions de premier niveau, dans l'ordre (avec ou sans `unitId`). */
  topLevelNumbers?: string[];
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
  /** D-ETU-33/34 (JP 23/10) : présentation de l'unité pour le dirigeant de `?unitId=` ; null sinon. */
  leaderNotes?: string | null;
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
  /** D-ETU-44 (JP 23/10) : envoi d'une copie RATTRAPAGE — null tant qu'elle n'est pas envoyée. */
  submittedAt?: string | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudySessionDetail — cible du rafraîchissement ≈ 5 s (D-ETU-23). */
export interface StudySessionDetail {
  session: StudySessionSummary;
  moduleBookTitle: string | null;
  lessonPortion: string | null;
  leader: boolean;
  participant: boolean;
  /**
   * Questions de la PLAGE, par `orderIndex` (D-ETU-40, JP 23/10) : avant la correction, du début de
   * la plage à la fin de la leçon ; après, la plage fixée. Les réponses hors plage n'apparaissent
   * jamais dans `myCopy`.
   */
  questions: StudyQuestionView[];
  /** Copie de l'appelant, ou null (pas encore répondu, ou lecteur de la hiérarchie — H1). */
  myCopy: StudyCopyView | null;
  /** Dirigeant : ouvertes répondues sans avis, toutes copies ; sinon null. */
  pendingReviewCount: number | null;
  /** D-ETU-34 (JP 23/10) : recommandations de l'unité, si `leader` ; null sinon. */
  moduleLeaderNotes?: string | null;
  /** D-ETU-34 (JP 23/10) : recommandations de la leçon, si `leader` ; null sinon. */
  lessonLeaderNotes?: string | null;
  /** D-ETU-36 (JP 23/10) : dirigeant toujours ; autre lecteur seulement à `TERMINEE` ; null sinon. */
  memberActions?: string[] | null;
  /**
   * D-ETU-44/45 (JP 23/10) : l'appelant peut rattraper cette séance maintenant (TERMINEE, répondant
   * sans copie ou copie RATTRAPAGE non envoyée, fenêtre ouverte). Absent d'un serveur antérieur.
   */
  catchUpOpen?: boolean;
  /**
   * RG-BER-13 (D-BER-07, JP 29/10) : l'appelant peut faire les écritures de pilotage de cette séance
   * (copie papier, ajustement / avis) ; faux s'il n'est pas dirigeant. Absent = vrai (serveur antérieur).
   */
  canPilot?: boolean;
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
  /** D-ETU-46 (JP 23/10) : ouvertes répondues sans avis du dirigeant (copie RATTRAPAGE surtout). */
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
  /** Dirigeant seulement (sinon []) — pour « Ajouter une copie papier » (D-ETU-13). */
  withoutCopy: StudyRosterMember[];
  /** RG-BER-13 (D-BER-07, JP 29/10) : copie papier / ajustement permis ; absent = vrai. */
  canPilot?: boolean;
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

/**
 * Mirrors com.excellence.back.assembly.AssemblyDtos.StudyPointsRequest — D-ETU-46 (JP 23/10) :
 * `verdict` facultatif (avis sur une ouverte d'un rattrapage) ; sans `points`, le SERVEUR applique
 * le barème du verdict (jamais calculé ici).
 */
export interface StudyPointsRequest {
  points?: number | null;
  verdict?: StudyVerdict | null;
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyLessonProgress — `bestScore`/`maxScore` null si non faite. */
export interface StudyLessonProgress {
  chapterId: string;
  number: number;
  title: string | null;
  done: boolean;
  /**
   * D-ETU-43 (JP 23/10, remplace D-ETU-18 pour une leçon) : Σ des meilleurs points par question
   * parmi les copies des séances TERMINEE — calculée par le serveur.
   */
  bestScore: number | null;
  maxScore: number | null;
  /**
   * RG-ETU-13 : le lien n'est affiché que pour soi ou pour un dirigeant. D-ETU-43 (JP 23/10) : copie
   * la plus récente ayant contribué — peut être null si plusieurs.
   */
  bestCopyId: string | null;
  bestSource: StudyCopySource | null;
  doneAt: string | null;
  /** D-ETU-42/43 (JP 23/10) : questions de premier niveau couvertes (« 20 / 57 questions »). */
  coveredQuestions?: number;
  /** D-ETU-42/43 (JP 23/10) : questions de premier niveau de la leçon. */
  totalQuestions?: number;
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
  // D-ETU-39..45 (JP 23/10, avenant 05 §5)
  'STUDY_QUESTION_INVALID',
  'STUDY_CATCH_UP_CLOSED',
  'STUDY_CATCH_UP_EMPTY',
  // D-ETU-48 (JP 23/10, avenant 05 §8) : copie papier refusée en REPONSES_OUVERTES
  'STUDY_PAPER_COPY_TOO_EARLY',
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
 * `lastQuestionNumber` = « on s'arrête à la question N » ; absent = la dernière de la leçon (corps omis).
 */
export async function startStudyCorrection(id: string, lastQuestionNumber?: string | null): Promise<StudySessionDetail> {
  const body: StudyCorrectionRequest | undefined = lastQuestionNumber ? { lastQuestionNumber } : undefined;
  const { data } = await apiClient.post<StudySessionDetail>(`${STUDY}/sessions/${id}/correction`, body);
  return data;
}

/**
 * D-ETU-44 (JP 23/10) — « Envoyer ma copie » de rattrapage : le serveur corrige les fermées, pose
 * `submittedAt` et calcule la note. Rien à envoyer → STUDY_CATCH_UP_EMPTY ; fenêtre fermée →
 * STUDY_CATCH_UP_CLOSED. Le corps de la réponse n'est pas lu : l'écran relit la séance (§4.4).
 */
export async function submitStudyCatchUp(id: string): Promise<void> {
  await apiClient.post(`${STUDY}/sessions/${id}/catch-up/submit`);
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

/**
 * §4.6 / D-ETU-13 — copie papier, même séance terminée (dirigeant). D-ETU-48 (JP 23/10) : à partir de
 * CORRECTION seulement (plage fixée) — en REPONSES_OUVERTES → 422 STUDY_PAPER_COPY_TOO_EARLY.
 */
export async function addStudyPaperCopy(id: string, payload: StudyPaperCopyRequest): Promise<StudyCopyResult> {
  const { data } = await apiClient.post<StudyCopyResult>(`${STUDY}/sessions/${id}/paper-copies`, payload);
  return data;
}

/** §4.6 — modifier la note d'une copie PAPIER (D-ETU-48 : refusé en REPONSES_OUVERTES, STUDY_PAPER_COPY_TOO_EARLY). */
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

/**
 * §4.6 / RG-ETU-07b — ajuster les points d'une question notée (dirigeant, à tout moment).
 * D-ETU-46 (JP 23/10) : ou poser un avis (`verdict`) sur une ouverte d'un rattrapage — le serveur
 * en déduit les points.
 */
export async function adjustStudyAnswer(
  copyId: string,
  questionId: string,
  change: StudyPointsRequest,
): Promise<StudyCopyDetail> {
  const body: StudyPointsRequest = change;
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

// ---------------------------------------------------------------------------------------------
// Suivi de l'étude à l'échelle de la VILLE — lot « pro-plan » (contrat 27/10 §7.2 → §7.6, §10.4).
// D-ETU-53 (JP 27/10) : lecture seule, pour les responsables de la ville (D-ABO-21) ; le code de
// droit ETUDE_SUIVI est vérifié PAR VILLE par le serveur (403 MODULE_ACCESS_DENIED enrichi, §3).
// D-ETU-55 : aucune de ces routes ne porte le texte d'une réponse (jamais de PERSONNELLE).
// Pas d'export sur l'app (contrat §12.2 : CSV / PDF sur le web seulement).
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
  /** RG-ABO-22 — ne sert sur l'app qu'à choisir le texte du verrou (aucun paiement, D-ABO-13). */
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

// ---------------------------------------------------------------------------------------------
// « Le Message de Bertoua » dans la HIÉRARCHIE — plan personnel `DIRIGEANT_HIERARCHIE` (JP 27/10).
// Périmètre = la CHAÎNE de leadership de l'appelant (même calcul que `GET /leaders/hierarchy` :
// SUBTREE pour un dirigeant, MINISTRY pour superAdmin / LEADER / SECRETARIAT), jamais la géographie.
// Code de droit HIERARCHIE_SUIVI vérifié par le serveur (403 MODULE_ACCESS_DENIED enrichi sinon).
// Mêmes définitions que la vue de ville (D-ETU-53, D-ETU-42, D-ETU-43) ; aucune réponse, aucun nom
// de membre, aucun contenu PERSONNELLE (D-ETU-55).
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyUnit */
export interface StudyHierarchyUnit {
  unitId: string;
  unitName: string;
  cityName: string | null;
  leaderName: string | null;
  /** Dirigeants de la chaîne entre l'appelant et l'assemblée, du plus haut au plus bas. */
  supervisorChain: string[];
  memberCount: number;
  /** D-ETU-53 — au moins une copie comptée dans une séance TERMINEE. */
  taughtCount: number;
  notTaughtCount: number;
  /** D-ETU-42 — leçons faites par l'assemblée (tous modules du `modules` de la réponse). */
  doneLessonIds: string[];
  /** D-ETU-43 — moyenne des notes en %, calculée par le serveur ; null sans note. */
  averageScorePercent: number | null;
  lastSessionDate: string | null;
}

/** Leçon d'un module de `StudyHierarchyOverview.modules`. */
export interface StudyHierarchyLesson {
  id: string;
  number: number | null;
  title: string;
}

/** Module de `StudyHierarchyOverview.modules`. */
export interface StudyHierarchyModule {
  id: string;
  code: string | null;
  name: string;
  lessons: StudyHierarchyLesson[];
}

/** Mirrors com.excellence.back.assembly.AssemblyDtos.StudyHierarchyOverview */
export interface StudyHierarchyOverview {
  units: StudyHierarchyUnit[];
  modules: StudyHierarchyModule[];
}

/** Mois de `StudyHierarchyStats.monthly`. */
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

/** `GET /study/hierarchy/overview[?moduleId]` — avancement des assemblées de ma chaîne. */
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

/** `GET /study/hierarchy/stats?from&to` — séances TERMINEE de la période (Europe/Paris, ≤ 731 j). */
export async function getStudyHierarchyStats(from: string, to: string): Promise<StudyHierarchyStats> {
  const { data } = await apiClient.get<StudyHierarchyStats>(`${STUDY}/hierarchy/stats`, { params: { from, to } });
  return { ...data, monthly: data?.monthly ?? [] };
}
