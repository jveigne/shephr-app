import { apiClient } from './apiClient';
import { isSecretariat, type MeResponse } from './authApi';

// Feature B — demandes de rattachement à une assemblée (parcours d'inscription).
// Le fidèle (ou dirigeant) cherche son assemblée de maison, dépose une demande de rattachement
// (MEMBER/LEADER) ou propose une nouvelle assemblée dans une ville existante ; la validation
// revient au dirigeant de l'assemblée, au SECRETARIAT ou au superAdmin.

export type JoinRequestedRole = 'MEMBER' | 'LEADER';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Résultat de recherche d'assemblée (q min 2 caractères sans cityId, max 50 résultats). */
export interface AssemblySearchResult {
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
  assemblyHasLeader: boolean;
  requestedRole: JoinRequestedRole;
  status: JoinRequestStatus;
  /** Demande de structure liée quand la demande porte sur une NOUVELLE assemblée. */
  structureRequestId: string | null;
  newAssemblyName: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Exactement UN de assemblyNodeId / newAssembly (sinon 422 JOIN_TARGET_REQUIRED). */
export interface CreateJoinRequestPayload {
  assemblyNodeId?: string;
  requestedRole: JoinRequestedRole;
  newAssembly?: { cityId: string; name: string };
}

export async function searchAssemblies(params: {
  q?: string;
  cityId?: string;
}): Promise<AssemblySearchResult[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.cityId) qs.set('cityId', params.cityId);
  const { data } = await apiClient.get<AssemblySearchResult[]>(
    `/api/church/join-requests/assemblies?${qs.toString()}`,
  );
  return data;
}

/** Erreurs 422 : JOIN_TARGET_REQUIRED, JOIN_REQUEST_ALREADY_PENDING, ALREADY_ATTACHED. */
export async function createJoinRequest(
  payload: CreateJoinRequestPayload,
): Promise<JoinRequestResponse> {
  const { data } = await apiClient.post<JoinRequestResponse>('/api/church/join-requests', payload);
  return data;
}

export async function fetchMyJoinRequests(): Promise<JoinRequestResponse[]> {
  const { data } = await apiClient.get<JoinRequestResponse[]>('/api/church/join-requests/mine');
  return data;
}

/**
 * Périmètre de décision d'un DIRIGEANT D'ASSEMBLÉE : uniquement les rattachements à une
 * assemblée EXISTANTE (la sienne). Une demande qui CRÉE une assemblée — même dans sa ville —
 * relève du SECRETARIAT et ne doit pas apparaître dans sa file. Filet côté client : le backend
 * reste l'autorité sur ce que la file renvoie.
 */
export function reviewableJoinRequests(
  me: MeResponse | null,
  rows: JoinRequestResponse[],
): JoinRequestResponse[] {
  if (!me) return [];
  if (me.superAdmin || isSecretariat(me)) return rows;
  return rows.filter((r) => r.assemblyNodeId != null && r.structureRequestId == null);
}

/** 403 pour les non-décideurs (dirigeants d'assemblée / SECRETARIAT / superAdmin uniquement). */
export async function fetchPendingJoinRequests(): Promise<JoinRequestResponse[]> {
  const { data } = await apiClient.get<JoinRequestResponse[]>('/api/church/join-requests/pending');
  return data;
}

export async function approveJoinRequest(id: string): Promise<JoinRequestResponse> {
  const { data } = await apiClient.post<JoinRequestResponse>(
    `/api/church/join-requests/${id}/approve`,
  );
  return data;
}

export async function rejectJoinRequest(id: string, reason: string): Promise<JoinRequestResponse> {
  const { data } = await apiClient.post<JoinRequestResponse>(
    `/api/church/join-requests/${id}/reject`,
    { reason },
  );
  return data;
}

export async function cancelJoinRequest(id: string): Promise<JoinRequestResponse> {
  const { data } = await apiClient.post<JoinRequestResponse>(
    `/api/church/join-requests/${id}/cancel`,
  );
  return data;
}
