import { apiClient } from './apiClient';

export type UserRole = 'MEMBER' | 'LEADER' | 'ADMIN';
export type LeaderLevel = 'JUNIOR' | 'SENIOR' | null;

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  leaderLevel: LeaderLevel;
  ministryId: string | null;
  unitId: string | null;
  active: boolean;
}

export async function login(payload: { email: string; password: string }) {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/login',
    payload,
  );
  return data;
}

export async function fetchMe() {
  const { data } = await apiClient.get<MeResponse>('/api/church/auth/me');
  return data;
}
