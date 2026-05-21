import { apiClient } from './apiClient';
import type { PageResponse } from './donationApi';
import type { LeaderLevel, UserRole } from './authApi';

// ---------------- Users ----------------
export interface AdminUserResponse {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  leaderLevel: LeaderLevel;
  ministryId: string | null;
  ministryName: string | null;
  unitId: string | null;
  unitName: string | null;
  active: boolean;
  createdAt: string;
}

export interface ListUsersParams {
  role?: UserRole;
  unitId?: string;
  ministryId?: string;
  active?: boolean;
  page?: number;
  size?: number;
}

export interface InviteUserRequest {
  email: string;
  fullName: string;
  role: UserRole;
  leaderLevel?: 'JUNIOR' | 'SENIOR';
  unitId?: string;
  ministryId?: string;
}

export interface InviteUserResponse {
  userId: string;
  email: string;
  invitationToken: string;
  invitationLink: string;
}

export interface UpdateUserRequest {
  role?: UserRole;
  leaderLevel?: 'JUNIOR' | 'SENIOR' | null;
  unitId?: string | null;
  active?: boolean;
}

export async function listUsers(params: ListUsersParams = {}) {
  const { data } = await apiClient.get<PageResponse<AdminUserResponse>>(
    '/api/church/admin/users',
    { params },
  );
  return data;
}

export async function inviteUser(payload: InviteUserRequest) {
  const { data } = await apiClient.post<InviteUserResponse>(
    '/api/church/admin/users/invite',
    payload,
  );
  return data;
}

export async function updateUser(id: string, payload: UpdateUserRequest) {
  const { data } = await apiClient.patch<AdminUserResponse>(
    `/api/church/admin/users/${id}`,
    payload,
  );
  return data;
}

export async function deactivateUser(id: string) {
  const { data } = await apiClient.post<AdminUserResponse>(
    `/api/church/admin/users/${id}/deactivate`,
  );
  return data;
}

// ---------------- Ministries ----------------
export interface MinistryResponse {
  id: string;
  name: string;
  country: string;
  defaultCurrency: string;
  createdAt: string;
}

export async function listMinistries() {
  const { data } = await apiClient.get<MinistryResponse[]>('/api/church/admin/ministries');
  return data;
}

// ---------------- Localities ----------------
export interface LocalityResponse {
  id: string;
  name: string;
  country: string;
  ministryId: string;
  ministryName: string;
  unitsCount: number;
  membersCount: number;
}

export async function listLocalities() {
  const { data } = await apiClient.get<LocalityResponse[]>('/api/church/admin/localities');
  return data;
}

// ---------------- Units ----------------
export interface UnitResponse {
  id: string;
  name: string;
  type: 'CENTER' | 'ASSEMBLY';
  localityId: string;
  localityName: string;
  ministryId: string;
  membersCount: number;
  active: boolean;
}

export async function listUnits() {
  const { data } = await apiClient.get<UnitResponse[]>('/api/church/admin/units');
  return data;
}
