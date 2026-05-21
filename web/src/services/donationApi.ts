import { apiClient } from './apiClient';

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

export async function listDonations(params: ListDonationsParams = {}) {
  const { data } = await apiClient.get<PageResponse<DonationResponse>>(
    '/api/church/donations',
    { params },
  );
  return data;
}

export async function getDonation(id: string) {
  const { data } = await apiClient.get<DonationResponse>(`/api/church/donations/${id}`);
  return data;
}
