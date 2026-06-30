import { apiClient } from './apiClient';

const BASE = '/api/church/member-care';

export interface MemberCareStatus {
  id: string;
  label: string;
  color: string | null;
  orderIndex: number;
  active: boolean;
}

export interface MemberCareRecord {
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
  updatedAt: string | null;
}

export interface HistoryEntry {
  id: string;
  oldStatusId: string | null;
  oldStatusLabel: string | null;
  newStatusId: string | null;
  newStatusLabel: string | null;
  changedById: string | null;
  note: string | null;
  changedAt: string;
}

export interface RecordDetail {
  record: MemberCareRecord;
  history: HistoryEntry[];
}

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

export async function listRecords(params: { unitId?: string; statusId?: string; search?: string } = {}) {
  const { data } = await apiClient.get<MemberCareRecord[]>(`${BASE}/records`, { params });
  return data;
}

export async function createRecord(body: {
  unitId: string;
  firstName: string;
  lastName: string;
  contactPhone?: string;
  contactEmail?: string;
  statusId?: string;
  firstMetAt?: string;
  note?: string;
}) {
  const { data } = await apiClient.post<MemberCareRecord>(`${BASE}/records`, body);
  return data;
}

export async function getRecord(id: string) {
  const { data } = await apiClient.get<RecordDetail>(`${BASE}/records/${id}`);
  return data;
}

export async function updateRecord(id: string, body: {
  firstName?: string;
  lastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  firstMetAt?: string;
  note?: string;
}) {
  const { data } = await apiClient.patch<MemberCareRecord>(`${BASE}/records/${id}`, body);
  return data;
}

export async function changeStatus(id: string, body: { statusId: string; note?: string }) {
  const { data } = await apiClient.patch<MemberCareRecord>(`${BASE}/records/${id}/status`, body);
  return data;
}

export async function deleteRecord(id: string) {
  await apiClient.delete(`${BASE}/records/${id}`);
}

export async function getOverview() {
  const { data } = await apiClient.get<OverviewRow[]>(`${BASE}/overview`);
  return data;
}

export async function sendReminder(unitId: string) {
  await apiClient.post(`${BASE}/units/${unitId}/reminders`);
}
