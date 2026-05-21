import { apiClient } from './apiClient';

export type UserRole = 'FAITHFUL' | 'LEADER' | 'ADMIN';
export type LeaderLevel = 'JUNIOR' | 'SENIOR' | null;

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  countryCode?: string | null;
  createdAt?: string;
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  countryCode?: string;
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/login',
    payload,
  );
  return data;
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/api/cmfipraise/auth/register',
    payload,
  );
  return data;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/api/church/auth/me');
  return data;
}
