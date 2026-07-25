import { apiClient } from './apiClient';

// Demandes de création de structure (RDG 22/07/2026 — Lot D4).
// La création directe est réservée au back-office (RG-DS-05) : le mobile DÉPOSE une demande à
// son niveau hiérarchique (RG-DS-01) et suit ses demandes ; le secrétariat valide (web/back-office).

export type StructureRequestType = 'REGION' | 'CITY' | 'ASSEMBLY';
export type StructureRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface StructureRequestResponse {
  id: string;
  type: StructureRequestType;
  parentId: string | null;
  /** RG-DS-08 — parent EN ATTENTE (maillon de chaîne) ; null si le parent existe déjà. */
  parentRequestId: string | null;
  /** true si le parent est lui-même une demande à valider (« à créer »). */
  parentPending: boolean;
  parentName: string | null;
  name: string;
  status: StructureRequestStatus;
  requestedById: string;
  requestedByName: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  createdEntityId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Entrée cherchable d'un niveau (RG-DS-06 v2) — `existing` = les enfants déjà présents. */
export interface RequestNodeOption {
  id: string;
  name: string;
  parentId: string | null;
  existing: string[];
}

export interface StructureRequestContext {
  nations: RequestNodeOption[];
  regions: RequestNodeOption[];
  cities: RequestNodeOption[];
}

export async function fetchRequestContext(): Promise<StructureRequestContext> {
  const { data } = await apiClient.get<StructureRequestContext>('/api/church/structure-requests/context');
  // Normalisation défensive : un backend pas encore migré v2 (ou un champ absent) ne doit
  // jamais faire planter l'écran — on dégrade en listes vides.
  return {
    nations: data?.nations ?? [],
    regions: data?.regions ?? [],
    cities: data?.cities ?? [],
  };
}

/** RG-DS-08 — dépôt en CHAÎNE : maillons du haut vers le bas, rattachés à un nœud existant. */
export interface CreateRequestChain {
  rootParentId: string;
  links: { type: StructureRequestType; name: string }[];
}

export async function createStructureRequest(payload: CreateRequestChain): Promise<StructureRequestResponse> {
  const { data } = await apiClient.post<StructureRequestResponse>('/api/church/structure-requests', payload);
  return data;
}

export async function listMyRequests(): Promise<StructureRequestResponse[]> {
  const { data } = await apiClient.get<StructureRequestResponse[]>('/api/church/structure-requests/mine');
  return data;
}

export async function cancelStructureRequest(id: string): Promise<StructureRequestResponse> {
  const { data } = await apiClient.post<StructureRequestResponse>(`/api/church/structure-requests/${id}/cancel`);
  return data;
}
