import { apiClient } from './apiClient';
import type { DonationCategory } from '../constants/categories';

export interface DonationResponse {
  id: string;
  userId: string;
  userFullName: string;
  unitId: string | null;
  unitName: string | null;
  amount: number;
  currency: string;
  category: string;
  donationDate: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonationCreateRequest {
  amount: number;
  currency: string;
  category: DonationCategory | string;
  donationDate: string;
  note?: string;
}

export interface DonationUpdateRequest {
  amount?: number;
  currency?: string;
  category?: DonationCategory | string;
  donationDate?: string;
  note?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface ListDonationsParams {
  from?: string;
  to?: string;
  category?: string;
  unitId?: string;
  userId?: string;
  page?: number;
  size?: number;
}

export async function listDonations(
  params: ListDonationsParams = {},
): Promise<PageResponse<DonationResponse>> {
  const { data } = await apiClient.get<PageResponse<DonationResponse>>(
    '/api/church/donations',
    { params },
  );
  return data;
}

export async function getDonation(id: string): Promise<DonationResponse> {
  const { data } = await apiClient.get<DonationResponse>(
    `/api/church/donations/${id}`,
  );
  return data;
}

export async function createDonation(
  payload: DonationCreateRequest,
): Promise<DonationResponse> {
  const { data } = await apiClient.post<DonationResponse>(
    '/api/church/donations',
    payload,
  );
  return data;
}

export async function updateDonation(
  id: string,
  payload: DonationUpdateRequest,
): Promise<DonationResponse> {
  const { data } = await apiClient.patch<DonationResponse>(
    `/api/church/donations/${id}`,
    payload,
  );
  return data;
}

export async function deleteDonation(id: string): Promise<void> {
  await apiClient.delete(`/api/church/donations/${id}`);
}
