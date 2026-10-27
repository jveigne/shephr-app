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

// ---------------- Demandes de supervision DESCENDANTES (lot HIE, JP 28/10) ----------------
// D-HIE-02..07 : un dirigeant X désigne un dirigeant qu'il suivra (X deviendra son supervisor_id).
// C'est une DEMANDE : le lien n'existe qu'après validation par le désigné ; valider REMPLACE son
// superviseur actuel (D-HIE-03) ; le désigné peut « Retirer » à tout moment (D-HIE-04). GRATUIT.
// Axe de la CHAÎNE de supervision (supervisor_id), jamais la géographie. La déclaration montante
// (`declareMySupervisor`, PUT /me/supervisor) reste immédiate et inchangée.
// Contrat : cmfipraise-backend/docs/shephr/28_10_2026/01_Plan_Hierarchie_3_Pages.md §5 / §6.

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionRequestStatus (RG-HIE-09). */
export type SupervisionRequestStatus = 'PENDING' | 'ACCEPTED' | 'REFUSED' | 'CANCELED' | 'REVOKED' | 'REPLACED';

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.SupervisionRequestView */
export interface SupervisionRequestView {
  id: string;
  status: SupervisionRequestStatus;
  requester: DiscipleshipPerson;
  designee: DiscipleshipPerson;
  createdAt: string;
  decidedAt: string | null;
  closedAt: string | null;
}

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.SupervisionOverview */
export interface SupervisionOverview {
  /** P-HIE-a — superAdmin ou rôle manager ; false = « Mon superviseur » en lecture seule (RG-HIE-31). */
  canDesignate: boolean;
  /** Mon supervisor_id actuel, null sinon. */
  supervisor: DiscipleshipPerson | null;
  /** P-HIE-c — la désignation ACCEPTED qui a posé mon superviseur actuel, null sinon. */
  followedBy: SupervisionRequestView | null;
  /** PENDING dont je suis le désigné (created_at croissant). */
  incoming: SupervisionRequestView[];
  /** PENDING dont je suis le demandeur (created_at décroissant). */
  outgoing: SupervisionRequestView[];
  /** P-HIE-b — tous les comptes dont supervisor_id = moi, quelle que soit l'origine du lien. */
  followed: DiscipleshipPerson[];
  /** RG-HIE-29 — pastille de la carte « Mon leadership » (= incoming.length). */
  pendingIncomingCount: number;
}

/** Mirrors com.excellence.back.notification.user.UserNotification#SOURCE_SUPERVISION_REQUEST (RG-HIE-24). */
export const SOURCE_SUPERVISION_REQUEST = 'SUPERVISION_REQUEST';

const SUPERVISION = '/api/church/leaders/me';

function normalizeOverview(data: SupervisionOverview | null | undefined): SupervisionOverview {
  return {
    canDesignate: !!data?.canDesignate,
    supervisor: data?.supervisor ?? null,
    followedBy: data?.followedBy ?? null,
    incoming: data?.incoming ?? [],
    outgoing: data?.outgoing ?? [],
    followed: data?.followed ?? [],
    pendingIncomingCount: data?.pendingIncomingCount ?? 0,
  };
}

/** GET /me/supervision — tout compte connecté (RG-HIE-31). */
export async function fetchSupervisionOverview(): Promise<SupervisionOverview> {
  const { data } = await apiClient.get<SupervisionOverview>(`${SUPERVISION}/supervision`);
  return normalizeOverview(data);
}

/** RG-HIE-32 — dirigeant seulement (403), `q` ≥ 2 caractères (422 QUERY_TOO_SHORT), ≤ 20 résultats. */
export async function searchDesigneeCandidates(q: string): Promise<DiscipleshipPerson[]> {
  const { data } = await apiClient.get<DiscipleshipPerson[]>(`${SUPERVISION}/designees/candidates`, { params: { q } });
  return data ?? [];
}

/** 201 ; 422 NO_MINISTRY, SUPERVISION_SELF, _OUT_OF_MINISTRY, _DESIGNEE_NOT_A_LEADER, _CYCLE, _ALREADY_LINKED, _REQUEST_DUPLICATE. */
export async function createSupervisionRequest(designeeId: string): Promise<SupervisionOverview> {
  const { data } = await apiClient.post<SupervisionOverview>(`${SUPERVISION}/supervision-requests`, { designeeId });
  return normalizeOverview(data);
}

async function transition(id: string, action: 'cancel' | 'accept' | 'refuse' | 'revoke'): Promise<SupervisionOverview> {
  const { data } = await apiClient.post<SupervisionOverview>(
    `${SUPERVISION}/supervision-requests/${encodeURIComponent(id)}/${action}`,
  );
  return normalizeOverview(data);
}

/** Demandeur seul, PENDING (RG-HIE-11 / 19). */
export const cancelSupervisionRequest = (id: string) => transition(id, 'cancel');
/** Désigné seul, PENDING ; REMPLACE son superviseur actuel (RG-HIE-14 / 15 / 16). */
export const acceptSupervisionRequest = (id: string) => transition(id, 'accept');
/** Désigné seul, PENDING (RG-HIE-12 / 19). */
export const refuseSupervisionRequest = (id: string) => transition(id, 'refuse');
/** Désigné seul, ACCEPTED ; supervisor_id → null s'il vaut encore le demandeur (RG-HIE-13 / 18). */
export const revokeSupervisionRequest = (id: string) => transition(id, 'revoke');
