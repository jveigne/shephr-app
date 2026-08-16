import { apiClient } from './apiClient';
import type { ModuleRole } from './authApi';

// ---------------- Hiérarchie des dirigeants (21/07) ----------------
// GET /api/church/leaders/hierarchy — arbre du leadership, contenu adapté au rôle côté serveur :
// SUBTREE (dirigeant : son sous-arbre), CHAIN (membre : sa chaîne de rattachement remontante),
// MINISTRY (LEADER/SECRETARIAT/SUPER_ADMIN : les arbres du ministère).

/**
 * Mirrors com.excellence.back.org.leaders.dto.HierarchyMemberView
 *
 * <p>Les trois champs `goal*` (chantier « objectifs individuels », JP 16/08) valent `null` s'il
 * n'y a aucun Goal actif ou si la personne n'est pas rattachée → n'afficher AUCUNE pastille.
 */
export interface HierarchyMemberView {
  id: string;
  fullName: string;
  email: string | null;
  active: boolean;
  /** A au moins un engagement déclaré pour l'année courante. */
  goalHasPledges: boolean | null;
  /** A soumis ses engagements. */
  goalSubmitted: boolean | null;
  /** Non soumis alors que la date limite est passée. */
  goalLate: boolean | null;
}

export interface HierarchyUnitView {
  id: string;
  name: string | null;
  localityName: string | null;
  /** Région et pays de la ville (22/07) — pour le regroupement pays → région → ville. */
  zoneName: string | null;
  countryName: string | null;
  /** RG-DS-10 — aucun dirigeant « home » sur cette assemblée. */
  needsLeader: boolean;
  members: HierarchyMemberView[];
}

/** Mirrors com.excellence.back.org.leaders.dto.LeaderHierarchyNode */
export interface LeaderHierarchyNode {
  id: string;
  fullName: string;
  email: string | null;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  /**
   * RG-BQ-11 — un dirigeant déclare SES engagements comme tout le monde : les trois champs
   * ci-dessous sont identiques à ceux de {@link HierarchyMemberView}. `null` → aucune pastille.
   */
  goalHasPledges: boolean | null;
  goalSubmitted: boolean | null;
  goalLate: boolean | null;
  units: HierarchyUnitView[];
  children: LeaderHierarchyNode[];
}

export type HierarchyMode = 'SUBTREE' | 'CHAIN' | 'MINISTRY';

export interface LeaderHierarchyResponse {
  mode: HierarchyMode;
  roots: LeaderHierarchyNode[];
  /** Assemblées du périmètre SANS dirigeant rattaché (22/07) — label « dirigeant requis ». */
  unassignedUnits: HierarchyUnitView[];
  /**
   * Superviseur DIRECT — « à qui je rends compte » (JP 30/07). HORS de `roots` : un dirigeant ne
   * voit que la hiérarchie en dessous de lui ; celui-ci n'est qu'une mention au-dessus de la vue.
   */
  supervisor?: LeaderHierarchyNode | null;
}

export async function fetchLeaderHierarchy(rootUserId?: string): Promise<LeaderHierarchyResponse> {
  const { data } = await apiClient.get<LeaderHierarchyResponse>('/api/church/leaders/hierarchy', {
    params: rootUserId ? { rootUserId } : undefined,
  });
  return { ...data, roots: data?.roots ?? [], unassignedUnits: data?.unassignedUnits ?? [] };
}

// ---------------- Faiseur de disciple (28/07) ----------------
// Chacun — du simple membre au coordinateur — déclare LUI-MÊME son superviseur ; le lien
// descendant (« mes disciples ») ne se construit que par les déclarations des autres.

export interface DiscipleshipPerson {
  id: string;
  fullName: string;
  email: string | null;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  /** false = personne invitée qui n'a pas encore activé son compte. */
  active: boolean;
  unitName: string | null;
  cityName: string | null;
}

export interface MyDiscipleshipResponse {
  supervisor: DiscipleshipPerson | null;
  disciples: DiscipleshipPerson[];
}

export async function fetchMyDiscipleship(): Promise<MyDiscipleshipResponse> {
  const { data } = await apiClient.get<MyDiscipleshipResponse>('/api/church/leaders/me/discipleship');
  return { supervisor: data?.supervisor ?? null, disciples: data?.disciples ?? [] };
}

/** Recherche scopée à MON ministère (min 2 caractères, sinon 422 QUERY_TOO_SHORT). */
export async function searchSupervisorCandidates(q: string): Promise<DiscipleshipPerson[]> {
  const { data } = await apiClient.get<DiscipleshipPerson[]>(
    '/api/church/leaders/me/supervisor/candidates',
    { params: { q } },
  );
  return data ?? [];
}

/** 422 : SUPERVISOR_SELF, SUPERVISOR_OUT_OF_MINISTRY, SUPERVISOR_CYCLE, NO_MINISTRY. */
export async function declareMySupervisor(supervisorId: string): Promise<MyDiscipleshipResponse> {
  const { data } = await apiClient.put<MyDiscipleshipResponse>('/api/church/leaders/me/supervisor', {
    supervisorId,
  });
  return { supervisor: data?.supervisor ?? null, disciples: data?.disciples ?? [] };
}
