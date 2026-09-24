import { apiClient } from './apiClient';

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

/** Codes 422 métier de l'API (ApiError.error). */
export type AssemblyErrorCode =
  | 'MEETING_ALREADY_EXISTS'
  | 'ATTENDEE_NOT_IN_ASSEMBLY'
  | 'CHAPTERS_FROM_SEVERAL_MODULES'
  | 'TEACHING_MODULE_INACTIVE';

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
