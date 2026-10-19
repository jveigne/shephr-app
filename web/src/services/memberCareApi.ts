import { apiClient } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Member Care — refonte du 23/09 (Lot L7, plan « Vie d'assemblée & refonte Member Care »).
//  D-ASM-01 (JP 23/09) : une fiche = un compte MEMBRE rattaché à une assemblée ; identité et
//  contact viennent du compte (t_user), plus aucune saisie d'identité ici.
//  D-ASM-02 (JP 23/09) : fiche automatique — pas de création ni de suppression (POST /records,
//  DELETE /records/{id}, POST /records/{id}/link et GET /export n'existent plus côté backend).
//  Les fiches sont adressées par le **userId** du membre (RG-MCR-09), pas par un id de fiche.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/church/member-care';

/** Mirrors com.excellence.back.membercare.MemberCareDtos.StatusDto */
export interface MemberCareStatus {
  id: string;
  label: string;
  color: string | null;
  orderIndex: number;
  active: boolean;
}

/**
 * Mirrors com.excellence.back.membercare.MemberCareDtos.UnitResponse
 * — assemblées dont je vois les fiches (RG-MCR-03 v2), celles où j'écris (`canEdit`) en tête.
 */
export interface MemberCareUnit {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  canEdit: boolean;
}

/**
 * Mirrors com.excellence.back.membercare.MemberCareDtos.RecordResponse
 * — une ligne par MEMBRE de l'assemblée, fiche existante ou non (`recordId` null tant que
 * personne n'a écrit de statut ni de note).
 */
export interface MemberCareRecord {
  userId: string;
  recordId: string | null;
  /** Assemblée courante du membre (goalUnitId). */
  unitId: string;
  unitName: string | null;
  fullName: string;
  username: string | null;
  email: string | null;
  phoneNumber: string | null;
  currentStatusId: string | null;
  currentStatusLabel: string | null;
  currentStatusColor: string | null;
  note: string | null;
  /** LocalDate « yyyy-MM-dd » ; null si ASSEMBLY n'est pas accessible ou aucune présence. */
  lastAttendanceDate: string | null;
  /** RG-MCR-08 v2 : seul un DIRIGEANT_UNITE de l'assemblée courante écrit. */
  canEdit: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.HistoryEntry */
export interface HistoryEntry {
  id: string;
  oldStatusId: string | null;
  oldStatusLabel: string | null;
  newStatusId: string | null;
  newStatusLabel: string | null;
  changedById: string | null;
  changedByName: string | null;
  note: string | null;
  changedAt: string;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.AttendanceEntry */
export interface AttendanceEntry {
  meetingId: string;
  unitId: string;
  unitName: string | null;
  /** LocalDate « yyyy-MM-dd ». */
  meetingDate: string;
}

/**
 * Mirrors com.excellence.back.membercare.MemberCareDtos.RecordDetailResponse
 * — historique du plus ancien au plus récent ; présences du plus récent au plus ancien, toutes
 * assemblées confondues (RG-MCR-10). `attendanceEnabled` = module ASSEMBLY accessible (D-ASM-12).
 */
export interface RecordDetail {
  record: MemberCareRecord;
  history: HistoryEntry[];
  attendanceEnabled: boolean;
  attendances: AttendanceEntry[];
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.OverviewRow — gelé (D-ASM-09). */
export interface OverviewRow {
  unitId: string;
  unitName: string;
  recordCount: number;
  lastUpdatedAt: string | null;
  upToDate: boolean;
  late: boolean;
}

export async function listStatuses() {
  const { data } = await apiClient.get<MemberCareStatus[]>(`${BASE}/statuses`);
  return data;
}

export async function createStatus(body: { label: string; color?: string; orderIndex?: number; active?: boolean }) {
  const { data } = await apiClient.post<MemberCareStatus>(`${BASE}/statuses`, body);
  return data;
}

export async function listUnits() {
  const { data } = await apiClient.get<MemberCareUnit[]>(`${BASE}/units`);
  return data;
}

export async function listRecords(params: { unitId?: string; statusId?: string; search?: string } = {}) {
  const { data } = await apiClient.get<MemberCareRecord[]>(`${BASE}/records`, { params });
  return data;
}

export async function getRecord(userId: string) {
  const { data } = await apiClient.get<RecordDetail>(`${BASE}/records/${userId}`);
  return data;
}

/**
 * Mirrors com.excellence.back.membercare.MemberCareDtos.UpdateNoteRequest — `note` vide ou null
 * efface la note (max 1000). Crée la fiche à la première écriture.
 */
export async function updateNote(userId: string, note: string | null) {
  const { data } = await apiClient.patch<MemberCareRecord>(`${BASE}/records/${userId}`, { note });
  return data;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.UpdateStatusRequest — historisé (RG-MCR-06). */
export async function changeStatus(userId: string, body: { statusId: string; note?: string }) {
  const { data } = await apiClient.patch<MemberCareRecord>(`${BASE}/records/${userId}/status`, body);
  return data;
}

export async function getOverview() {
  const { data } = await apiClient.get<OverviewRow[]>(`${BASE}/overview`);
  return data;
}

export async function sendReminder(unitId: string) {
  await apiClient.post(`${BASE}/units/${unitId}/reminders`);
}
