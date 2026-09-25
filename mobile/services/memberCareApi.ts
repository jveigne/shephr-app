import { apiClient } from './apiClient';

// Module Member Care (suivi pastoral) — calque com.excellence.back.membercare.MemberCareDtos.
// Tous les endpoints sont sous /api/church/member-care et gatés @RequiresModule("MEMBER_CARE").
//
// D-ASM-01/02 (JP 23/09) : une fiche = un compte MEMBRE rattaché à une assemblée, présente
// automatiquement. Les fiches sont identifiées par le **userId** du membre (plus d'id de fiche
// dans les URLs). Plus de création, de suppression, de liaison ni d'export (RG-MCR-02 v2).

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
 * Assemblées dont je vois les fiches (RG-MCR-03 v2) ; `canEdit` = je suis DIRIGEANT_UNITE de
 * l'assemblée (RG-MCR-08 v2). Triées côté serveur : canEdit d'abord, puis ville, puis nom.
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
 * Une ligne par MEMBRE de l'assemblée, fiche existante ou non (`recordId` null jusqu'à la
 * première écriture). Identité et contact viennent du compte (t_user).
 */
export interface MemberRecord {
  userId: string;
  recordId: string | null;
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
  /** yyyy-MM-dd ; null si ASSEMBLY non accessible (D-ASM-12). */
  lastAttendanceDate: string | null;
  canEdit: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.HistoryEntry */
export interface MemberHistoryEntry {
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
export interface MemberAttendanceEntry {
  meetingId: string;
  unitId: string;
  unitName: string | null;
  /** yyyy-MM-dd */
  meetingDate: string;
}

/**
 * Mirrors com.excellence.back.membercare.MemberCareDtos.RecordDetailResponse
 * `history` : du plus ancien au plus récent. `attendances` : du plus récent au plus ancien,
 * toutes assemblées confondues ; vide si `attendanceEnabled` = false (RG-MCR-10).
 */
export interface MemberRecordDetail {
  record: MemberRecord;
  history: MemberHistoryEntry[];
  attendanceEnabled: boolean;
  attendances: MemberAttendanceEntry[];
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.OverviewRow — gelé (D-ASM-09). */
export interface MemberCareOverviewRow {
  unitId: string;
  unitName: string;
  /** Nombre de comptes MEMBRE de l'assemblée (sémantique à revoir, D-ASM-09). */
  recordCount: number;
  lastUpdatedAt: string | null;
  upToDate: boolean;
  late: boolean;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.UpdateNoteRequest — vide ou null efface. */
export interface UpdateNoteRequest {
  note: string | null;
}

/** Mirrors com.excellence.back.membercare.MemberCareDtos.UpdateStatusRequest */
export interface UpdateStatusRequest {
  statusId: string;
  note?: string;
}

export interface ListRecordsParams {
  unitId?: string;
  statusId?: string;
  search?: string;
}

const BASE = '/api/church/member-care';

export async function listStatuses(): Promise<MemberCareStatus[]> {
  const { data } = await apiClient.get<MemberCareStatus[]>(`${BASE}/statuses`);
  return data;
}

export async function listCareUnits(): Promise<MemberCareUnit[]> {
  const { data } = await apiClient.get<MemberCareUnit[]>(`${BASE}/units`);
  return data;
}

export async function listRecords(params: ListRecordsParams = {}): Promise<MemberRecord[]> {
  const { data } = await apiClient.get<MemberRecord[]>(`${BASE}/records`, { params });
  return data;
}

export async function getRecord(userId: string): Promise<MemberRecordDetail> {
  const { data } = await apiClient.get<MemberRecordDetail>(`${BASE}/records/${userId}`);
  return data;
}

/** RG-MCR-08 v2 : DIRIGEANT_UNITE de l'assemblée courante uniquement (sinon 403). */
export async function updateNote(userId: string, payload: UpdateNoteRequest): Promise<MemberRecord> {
  const { data } = await apiClient.patch<MemberRecord>(`${BASE}/records/${userId}`, payload);
  return data;
}

/** RG-MCR-06 : historisé côté serveur (sauf statut inchangé). */
export async function changeStatus(userId: string, payload: UpdateStatusRequest): Promise<MemberRecord> {
  const { data } = await apiClient.patch<MemberRecord>(`${BASE}/records/${userId}/status`, payload);
  return data;
}

export async function getOverview(): Promise<MemberCareOverviewRow[]> {
  const { data } = await apiClient.get<MemberCareOverviewRow[]>(`${BASE}/overview`);
  return data;
}

export async function sendReminder(unitId: string): Promise<void> {
  await apiClient.post(`${BASE}/units/${unitId}/reminders`);
}
