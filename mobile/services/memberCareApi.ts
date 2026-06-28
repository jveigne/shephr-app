import { apiClient } from './apiClient';

// Module Member Care (suivi pastoral) — calque com.excellence.back.membercare.MemberCareDtos.
// Tous les endpoints sont sous /api/church/member-care et gatés @RequiresModule("MEMBER_CARE").

export interface MemberCareStatus {
  id: string;
  label: string;
  color: string | null;
  orderIndex: number;
  active: boolean;
}

export interface MemberRecord {
  id: string;
  unitId: string;
  firstName: string;
  lastName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  currentStatusId: string | null;
  currentStatusLabel: string | null;
  currentStatusColor: string | null;
  firstMetAt: string | null;
  note: string | null;
  linkedUserId: string | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemberHistoryEntry {
  id: string;
  oldStatusId: string | null;
  oldStatusLabel: string | null;
  newStatusId: string | null;
  newStatusLabel: string | null;
  changedById: string | null;
  note: string | null;
  changedAt: string;
}

export interface MemberRecordDetail {
  record: MemberRecord;
  history: MemberHistoryEntry[];
}

export interface MemberCareOverviewRow {
  unitId: string;
  unitName: string;
  recordCount: number;
  lastUpdatedAt: string | null;
  upToDate: boolean;
  late: boolean;
}

export interface CreateRecordRequest {
  unitId: string;
  firstName: string;
  lastName: string;
  contactPhone?: string;
  contactEmail?: string;
  statusId?: string;
  firstMetAt?: string;
  note?: string;
}

export interface UpdateRecordRequest {
  firstName?: string;
  lastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  firstMetAt?: string;
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

export async function listRecords(params: ListRecordsParams = {}): Promise<MemberRecord[]> {
  const { data } = await apiClient.get<MemberRecord[]>(`${BASE}/records`, { params });
  return data;
}

export async function getRecord(id: string): Promise<MemberRecordDetail> {
  const { data } = await apiClient.get<MemberRecordDetail>(`${BASE}/records/${id}`);
  return data;
}

export async function createRecord(payload: CreateRecordRequest): Promise<MemberRecord> {
  const { data } = await apiClient.post<MemberRecord>(`${BASE}/records`, payload);
  return data;
}

export async function updateRecord(id: string, payload: UpdateRecordRequest): Promise<MemberRecord> {
  const { data } = await apiClient.patch<MemberRecord>(`${BASE}/records/${id}`, payload);
  return data;
}

export async function changeStatus(
  id: string,
  payload: { statusId: string; note?: string },
): Promise<MemberRecord> {
  const { data } = await apiClient.patch<MemberRecord>(`${BASE}/records/${id}/status`, payload);
  return data;
}

export async function deleteRecord(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/records/${id}`);
}

export async function getOverview(): Promise<MemberCareOverviewRow[]> {
  const { data } = await apiClient.get<MemberCareOverviewRow[]>(`${BASE}/overview`);
  return data;
}

export async function sendReminder(unitId: string): Promise<void> {
  await apiClient.post(`${BASE}/units/${unitId}/reminders`);
}
