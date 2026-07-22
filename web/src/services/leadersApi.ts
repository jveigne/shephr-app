import { apiClient } from './apiClient';
import type { ModuleRole } from './authApi';

// ---------------- Hiérarchie des dirigeants (21/07) ----------------
// GET /api/church/leaders/hierarchy — arbre du leadership, contenu adapté au rôle côté serveur :
// SUBTREE (dirigeant : son sous-arbre), CHAIN (membre : sa chaîne de rattachement remontante),
// MINISTRY (LEADER/SECRETARIAT/SUPER_ADMIN : les arbres du ministère).

export interface HierarchyMemberView {
  id: string;
  fullName: string;
  email: string;
  active: boolean;
}

export interface HierarchyUnitView {
  id: string;
  name: string | null;
  localityName: string | null;
  members: HierarchyMemberView[];
}

export interface LeaderHierarchyNode {
  id: string;
  fullName: string;
  email: string;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  units: HierarchyUnitView[];
  children: LeaderHierarchyNode[];
}

export type HierarchyMode = 'SUBTREE' | 'CHAIN' | 'MINISTRY';

export interface LeaderHierarchyResponse {
  mode: HierarchyMode;
  roots: LeaderHierarchyNode[];
}

export async function fetchLeaderHierarchy(rootUserId?: string) {
  const { data } = await apiClient.get<LeaderHierarchyResponse>('/api/church/leaders/hierarchy', {
    params: rootUserId ? { rootUserId } : undefined,
  });
  return data;
}
