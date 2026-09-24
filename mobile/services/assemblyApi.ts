import { apiClient } from './apiClient';

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
