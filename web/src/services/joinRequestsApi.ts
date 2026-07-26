import { apiClient } from './apiClient';
import type { MeResponse, ModuleRole } from './authApi';

// Demandes de RATTACHEMENT à une assemblée (Feature B — onboarding /join).
// L'utilisateur authentifié mais non rattaché cherche son assemblée (ou demande sa création),
// choisit son rôle (fidèle / dirigeant), puis le dirigeant de l'assemblée ou le SECRETARIAT valide.

export type JoinRequestRole = 'MEMBER' | 'LEADER';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Assemblée cherchable (GET /assemblies?q=&cityId=) — q min 2 caractères sans cityId. */
export interface AssemblyOption {
  id: string;
  name: string;
  cityId: string;
  cityName: string;
  regionName: string;
  nationName: string;
  /** true si l'assemblée a déjà un dirigeant titulaire (avertissement co-dirigeant). */
  hasLeader: boolean;
}

export interface JoinRequestResponse {
  id: string;
  userId: string;
  userName: string;
  assemblyNodeId: string | null;
  assemblyName: string | null;
  cityName: string | null;
  /** L'assemblée visée a déjà un dirigeant titulaire (badge d'avertissement si rôle LEADER). */
  assemblyHasLeader: boolean;
  requestedRole: JoinRequestRole;
  status: JoinRequestStatus;
  /** Demande de structure liée quand l'assemblée n'existe pas encore. */
  structureRequestId: string | null;
  newAssemblyName: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export async function searchAssemblies(params: { q?: string; cityId?: string }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.cityId) search.set('cityId', params.cityId);
  const qs = search.toString();
  const { data } = await apiClient.get<AssemblyOption[]>(
    `/api/church/join-requests/assemblies${qs ? `?${qs}` : ''}`,
  );
  return data;
}

/**
 * Dépose une demande de rattachement — soit sur une assemblée existante (assemblyNodeId),
 * soit avec création d'assemblée (newAssembly). Erreurs 422 : JOIN_REQUEST_ALREADY_PENDING,
 * ALREADY_ATTACHED.
 */
export async function createJoinRequest(payload: {
  assemblyNodeId?: string;
  requestedRole: JoinRequestRole;
  newAssembly?: { cityId: string; name: string };
}) {
  const { data } = await apiClient.post<JoinRequestResponse>('/api/church/join-requests', payload);
  return data;
}

export async function listMyJoinRequests() {
  const { data } = await apiClient.get<JoinRequestResponse[]>('/api/church/join-requests/mine');
  return data;
}

export async function cancelJoinRequest(id: string) {
  const { data } = await apiClient.post<JoinRequestResponse>(`/api/church/join-requests/${id}/cancel`);
  return data;
}

/** File à valider — 403 sauf dirigeant d'assemblée (ses assemblées), SECRETARIAT, superAdmin. */
export async function listPendingJoinRequests() {
  const { data } = await apiClient.get<JoinRequestResponse[]>('/api/church/join-requests/pending');
  return data;
}

export async function approveJoinRequest(id: string) {
  const { data } = await apiClient.post<JoinRequestResponse>(`/api/church/join-requests/${id}/approve`);
  return data;
}

export async function rejectJoinRequest(id: string, reason: string) {
  const { data } = await apiClient.post<JoinRequestResponse>(
    `/api/church/join-requests/${id}/reject`,
    { reason },
  );
  return data;
}

/**
 * Pré-filtre client de la file « pending » : superAdmin, SECRETARIAT (Dons ∪ Objectifs) ou
 * dirigeant rattaché à une assemblée. Le backend reste l'autorité (403 géré côté page).
 */
export function mayReviewJoinRequests(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.superAdmin) return true;
  if (me.donationRole === 'SECRETARIAT' || me.goalRole === 'SECRETARIAT') return true;
  const leadsUnit = (role: ModuleRole | null, unitId: string | null) =>
    unitId != null && role != null && role !== 'MEMBRE';
  return leadsUnit(me.goalRole, me.goalUnitId) || leadsUnit(me.donationRole, me.donationUnitId);
}
