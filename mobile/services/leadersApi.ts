import { apiClient } from '@/services/apiClient';
import type { ModuleRole } from '@/services/authApi';

// Hiérarchie des dirigeants (Lot H3 — 21/07) : GET /api/church/leaders/hierarchy.
// Contenu adapté au rôle côté serveur : SUBTREE (dirigeant : son sous-arbre), CHAIN (membre :
// sa chaîne de dirigeants remontante), MINISTRY (LEADER/SECRETARIAT/SUPER_ADMIN).
//
// J-4 (14/09) — la Hiérarchie n'affiche QUE la chaîne de supervision : le champ `unassignedUnits`
// (assemblées du périmètre sans dirigeant) a quitté cette réponse, c'était son seul apport
// GÉOGRAPHIQUE. La fonction n'est pas perdue : `fetchUnassignedUnits()` la sert à l'écran
// Structure, où le label « dirigeant requis » (RG-DS-10) est à sa place.
// J-5 (14/09) — la hiérarchie est une chaîne de DIRIGEANTS : un simple fidèle n'y figure pas
// comme nœud, et sa vue CHAIN part de son assemblée, non de son `supervisorId`.

/**
 * Mirrors com.excellence.back.org.leaders.dto.HierarchyMemberView
 *
 * <p>Les trois champs `goal*` (16/08) valent `null` s'il n'y a aucun Goal actif ou si la personne
 * n'est pas rattachée : n'afficher AUCUNE pastille dans ce cas.
 */
export interface HierarchyMemberView {
  id: string;
  fullName: string;
  email: string | null;
  active: boolean;
  /** A déclaré au moins un engagement pour l'année. */
  goalHasPledges: boolean | null;
  /** A soumis (tous ses engagements verrouillés). */
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

// Mirrors com.excellence.back.org.leaders.dto.LeaderHierarchyNode
export interface LeaderHierarchyNode {
  id: string;
  fullName: string;
  email: string;
  donationRole: ModuleRole | null;
  goalRole: ModuleRole | null;
  /** RG-BQ-11 (16/08) — un dirigeant déclare comme tout le monde : mêmes 3 pastilles. */
  goalHasPledges: boolean | null;
  goalSubmitted: boolean | null;
  goalLate: boolean | null;
  units: HierarchyUnitView[];
  children: LeaderHierarchyNode[];
}

export type HierarchyMode = 'SUBTREE' | 'CHAIN' | 'MINISTRY';

// Mirrors com.excellence.back.org.leaders.dto.LeaderHierarchyResponse
export interface LeaderHierarchyResponse {
  mode: HierarchyMode;
  roots: LeaderHierarchyNode[];
  /**
   * Superviseur DIRECT — « à qui je rends compte » (JP 30/07). HORS de `roots` : un dirigeant ne
   * voit que la hiérarchie en dessous de lui ; celui-ci n'est qu'une mention au-dessus de la vue.
   */
  supervisor?: LeaderHierarchyNode | null;
}

export async function fetchLeaderHierarchy(): Promise<LeaderHierarchyResponse> {
  const { data } = await apiClient.get<LeaderHierarchyResponse>('/api/church/leaders/hierarchy');
  return { ...data, roots: data?.roots ?? [] };
}

/**
 * Assemblées de MON périmètre sans dirigeant rattaché (RG-DS-10) — label « dirigeant requis »
 * de l'écran Structure.
 *
 * <p>J-4 (14/09) : ces assemblées étaient embarquées dans la réponse Hiérarchie, qu'elles
 * étaient seules à colorer de géographique. Elles ont leur endpoint et leur écran.
 */
export async function fetchUnassignedUnits(): Promise<HierarchyUnitView[]> {
  const { data } = await apiClient.get<HierarchyUnitView[]>('/api/church/leaders/units/unassigned');
  return data ?? [];
}

// ---------------- Faiseur de disciple (28/07) ----------------
// Un DIRIGEANT déclare LUI-MÊME son superviseur ; le lien descendant (« mes disciples ») ne se
// construit que par les déclarations des autres.
// J-5 (14/09) — réservé aux dirigeants côté SERVEUR aussi (403 sinon), et le superviseur désigné
// doit lui-même être un dirigeant : la recherche ne renvoie donc que des dirigeants. Un simple
// fidèle n'a jamais eu l'écran — son rattachement à une assemblée détermine son dirigeant.

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

/**
 * Recherche scopée à MON ministère (min 2 caractères, sinon 422 QUERY_TOO_SHORT), limitée aux
 * DIRIGEANTS (J-5). 403 si l'appelant n'est pas lui-même dirigeant.
 */
export async function searchSupervisorCandidates(q: string): Promise<DiscipleshipPerson[]> {
  const { data } = await apiClient.get<DiscipleshipPerson[]>(
    '/api/church/leaders/me/supervisor/candidates',
    { params: { q } },
  );
  return data ?? [];
}

/**
 * 422 : SUPERVISOR_SELF, SUPERVISOR_OUT_OF_MINISTRY, SUPERVISOR_CYCLE, NO_MINISTRY et — J-5
 * (14/09) — SUPERVISOR_NOT_A_LEADER (la personne désignée n'est pas un dirigeant).
 * 403 : l'appelant n'est pas dirigeant.
 */
export async function declareMySupervisor(supervisorId: string): Promise<MyDiscipleshipResponse> {
  const { data } = await apiClient.put<MyDiscipleshipResponse>(
    '/api/church/leaders/me/supervisor',
    { supervisorId },
  );
  return { supervisor: data?.supervisor ?? null, disciples: data?.disciples ?? [] };
}

// ---------------- Désignation descendante (lot HIE — D-HIE-02..07, JP 28/10) ----------------
// Un DIRIGEANT X désigne un dirigeant qu'il suivra : c'est une DEMANDE, le lien (`supervisor_id`
// du désigné := X) n'existe qu'après validation par le désigné. Valider REMPLACE l'ancien
// superviseur (D-HIE-03) ; le désigné peut « Retirer » à tout moment (D-HIE-04). GRATUIT, aucun
// `@RequiresModule`. La déclaration montante (`PUT /me/supervisor`, ci-dessus) reste immédiate.
// Axe : CHAÎNE de supervision, jamais la géographie. Contrat figé
// `cmfipraise-backend/docs/shephr/28_10_2026/01_Plan_Hierarchie_3_Pages.md` §5 / §6.

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionRequestStatus (RG-HIE-09). */
export type SupervisionRequestStatus = 'PENDING' | 'ACCEPTED' | 'REFUSED' | 'CANCELED' | 'REVOKED' | 'REPLACED';

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.SupervisionRequestView */
export interface SupervisionRequestView {
  id: string;
  status: SupervisionRequestStatus;
  requester: DiscipleshipPerson;
  designee: DiscipleshipPerson;
  /** Instant ISO. */
  createdAt: string;
  decidedAt: string | null;
  closedAt: string | null;
}

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.SupervisionOverview */
export interface SupervisionOverview {
  /** P-HIE-a : superAdmin ou rôle manager. Faux = « Mon superviseur » seule, en lecture. */
  canDesignate: boolean;
  /** Mon `supervisor_id` actuel, quelle que soit l'origine du lien. */
  supervisor: DiscipleshipPerson | null;
  /** P-HIE-c : la désignation ACCEPTED qui me lie à mon superviseur actuel, sinon null. */
  followedBy: SupervisionRequestView | null;
  /** PENDING dont je suis le désigné, plus anciennes d'abord. */
  incoming: SupervisionRequestView[];
  /** PENDING dont je suis le demandeur, plus récentes d'abord. */
  outgoing: SupervisionRequestView[];
  /** P-HIE-b : tous les comptes dont `supervisor_id` = moi. */
  followed: DiscipleshipPerson[];
  /** RG-HIE-29 — pastille de la carte « Mon leadership » (= incoming.length). */
  pendingIncomingCount: number;
}

/** Mirrors com.excellence.back.notification.user.UserNotification#SOURCE_SUPERVISION_REQUEST */
export const SOURCE_SUPERVISION_REQUEST = 'SUPERVISION_REQUEST';

const SUPERVISION_BASE = '/api/church/leaders/me';

function normalizeOverview(data: Partial<SupervisionOverview> | null | undefined): SupervisionOverview {
  const incoming = data?.incoming ?? [];
  return {
    canDesignate: !!data?.canDesignate,
    supervisor: data?.supervisor ?? null,
    followedBy: data?.followedBy ?? null,
    incoming,
    outgoing: data?.outgoing ?? [],
    followed: data?.followed ?? [],
    pendingIncomingCount: data?.pendingIncomingCount ?? incoming.length,
  };
}

/** `GET /api/church/leaders/me/supervision` — tout compte authentifié (RG-HIE-31). */
export async function fetchSupervisionOverview(): Promise<SupervisionOverview> {
  const { data } = await apiClient.get<SupervisionOverview>(`${SUPERVISION_BASE}/supervision`);
  return normalizeOverview(data);
}

/**
 * RG-HIE-32 — dirigeants désignables de MON ministère (≤ 20), hors moi, mes ancêtres, ceux que je
 * suis déjà et ceux qui ont déjà une demande PENDING de ma part. 403 si je ne suis pas dirigeant ;
 * 422 `QUERY_TOO_SHORT` (< 2 caractères), `NO_MINISTRY`.
 */
export async function searchDesigneeCandidates(q: string): Promise<DiscipleshipPerson[]> {
  const { data } = await apiClient.get<DiscipleshipPerson[]>(`${SUPERVISION_BASE}/designees/candidates`, {
    params: { q },
  });
  return data ?? [];
}

/**
 * 201. 422 : NO_MINISTRY, SUPERVISION_SELF, SUPERVISION_OUT_OF_MINISTRY,
 * SUPERVISION_DESIGNEE_NOT_A_LEADER, SUPERVISION_CYCLE, SUPERVISION_ALREADY_LINKED,
 * SUPERVISION_REQUEST_DUPLICATE ; 403 ; 404.
 */
export async function createSupervisionRequest(designeeId: string): Promise<SupervisionOverview> {
  const { data } = await apiClient.post<SupervisionOverview>(`${SUPERVISION_BASE}/supervision-requests`, {
    designeeId,
  });
  return normalizeOverview(data);
}

async function supervisionAction(id: string, action: 'cancel' | 'accept' | 'refuse' | 'revoke') {
  const { data } = await apiClient.post<SupervisionOverview>(
    `${SUPERVISION_BASE}/supervision-requests/${id}/${action}`,
  );
  return normalizeOverview(data);
}

/** Demandeur seul (RG-HIE-11) ; 422 SUPERVISION_REQUEST_NOT_PENDING. */
export const cancelSupervisionRequest = (id: string) => supervisionAction(id, 'cancel');
/**
 * Désigné seul (RG-HIE-12). Valider REMPLACE mon superviseur actuel (D-HIE-03) — confirmer avant
 * (RG-HIE-28). 422 : SUPERVISION_REQUEST_NOT_PENDING, SUPERVISION_REQUESTER_NOT_A_LEADER,
 * SUPERVISION_OUT_OF_MINISTRY, SUPERVISION_CYCLE ; 403.
 */
export const acceptSupervisionRequest = (id: string) => supervisionAction(id, 'accept');
/** Désigné seul ; 422 SUPERVISION_REQUEST_NOT_PENDING. */
export const refuseSupervisionRequest = (id: string) => supervisionAction(id, 'refuse');
/** D-HIE-04 — « Retirer » : désigné seul, demande ACCEPTED ; 422 SUPERVISION_REQUEST_NOT_ACCEPTED. */
export const revokeSupervisionRequest = (id: string) => supervisionAction(id, 'revoke');
