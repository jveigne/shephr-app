import { apiClient } from '@/services/apiClient';

// ---------------------------------------------------------------------------------------------
//  « Personnes à suivre » — D-PAYS-13 / RG-PAYS-30..34 (JP 11/11), contrat 11_11_2026/02 §9.
//  Suivi des comptes SANS assemblée par la GÉOGRAPHIE (dirigeants de la ville / région / nation, SECRETARIAT ;
//  superAdmin en lecture), séparé de Member Care (chaîne, comptes rattachés). Gratuit (D-PAYS-14), sans
//  @RequiresModule. Les droits viennent du serveur (`canView`, `canEdit`) : jamais recalculés ici.
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.org.followup.FollowUpStatus — statut EFFECTIF (§9.1). */
export type FollowUpStatus = 'A_CONTACTER' | 'CONTACTEE' | 'INTEGREE' | 'NE_SOUHAITE_PAS';
export const FOLLOW_UP_STATUSES: FollowUpStatus[] = ['A_CONTACTER', 'CONTACTEE', 'INTEGREE', 'NE_SOUHAITE_PAS'];
/** Seuls statuts qu'un dirigeant peut poser (écart E-06 : INTEGREE / NE_SOUHAITE_PAS → 422). */
export const EDITABLE_FOLLOW_UP_STATUSES: Array<'A_CONTACTER' | 'CONTACTEE'> = ['A_CONTACTER', 'CONTACTEE'];

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpScope — sert à afficher la tuile. */
export interface FollowUpScope {
  canView: boolean;
  canEdit: boolean;
  /** Villes filtrables (périmètre de suivi), tri par nom. */
  localities: { id: string; name: string }[];
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpSummary */
export interface FollowUpSummary {
  userId: string;
  fullName: string;
  /** null pour NE_SOUHAITE_PAS (consentement retiré, RG-PAYS-34). */
  phoneNumber: string | null;
  phoneCountryCode: string | null;
  email: string | null;
  countryIso: string | null;
  cityId: string | null;
  cityName: string | null;
  status: FollowUpStatus;
  note: string | null;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  updatedByName: string | null;
  /** Inscriptions REGISTERED, venus, pointés absents (attended = false). */
  registrationCount: number;
  attendedCount: number;
  noShowCount: number;
  /** Prochaine inscription à venir ('yyyy-MM-dd'). */
  nextEventDate: string | null;
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpRegistration */
export interface FollowUpRegistration {
  eventId: string;
  /** title ?? customLabel ?? typeName (langue de l'appelant). */
  label: string;
  eventDate: string;
  scopeName: string;
  eventStatus: 'PLANNED' | 'DONE' | 'CANCELLED';
  registrationStatus: 'REGISTERED' | 'CANCELED';
  attended: boolean | null;
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpDetail */
export interface FollowUpDetail extends FollowUpSummary {
  canEdit: boolean;
  consentAt: string;
  /** Plus récentes d'abord. */
  registrations: FollowUpRegistration[];
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpUpdateRequest — note null = inchangée, '' = effacée. */
export interface FollowUpUpdateRequest {
  status?: 'A_CONTACTER' | 'CONTACTEE' | null;
  note?: string | null;
  markContacted?: boolean;
}

/** Filtres de `GET /follow-ups` (défaut serveur : A_CONTACTER et CONTACTEE). */
export interface FollowUpListParams {
  status?: FollowUpStatus;
  localityId?: string;
  withoutCity?: boolean;
  /** Au moins une inscription pointée absente. */
  noShow?: boolean;
  /** Fiche créée dans le mois courant (Europe/Paris). */
  newThisMonth?: boolean;
  /** ≥ 2 caractères : nom, téléphone, e-mail. */
  q?: string;
}

export const FOLLOW_UP_NOTE_MAX = 2000;

const BASE = '/api/church/follow-ups';

/** Tout compte connecté : `canView` décide de la tuile « Personnes à suivre ». */
export async function getFollowUpScope(): Promise<FollowUpScope> {
  const { data } = await apiClient.get<FollowUpScope>(`${BASE}/scope`);
  return { canView: !!data?.canView, canEdit: !!data?.canEdit, localities: data?.localities ?? [] };
}

/** Liste filtrée par le serveur (jamais de 403 : les lignes hors périmètre sont retirées), 500 max. */
export async function listFollowUps(params: FollowUpListParams = {}): Promise<FollowUpSummary[]> {
  const clean: Record<string, string | boolean> = {};
  if (params.status) clean.status = params.status;
  if (params.localityId) clean.localityId = params.localityId;
  if (params.withoutCity) clean.withoutCity = true;
  if (params.noShow) clean.noShow = true;
  if (params.newThisMonth) clean.newThisMonth = true;
  if (params.q && params.q.trim().length >= 2) clean.q = params.q.trim();
  const { data } = await apiClient.get<FollowUpSummary[]>(BASE, { params: clean });
  return Array.isArray(data) ? data : [];
}

/** Fiche : 404 sans fiche, 403 UNAUTHORIZED_ACCESS hors périmètre. */
export async function getFollowUp(userId: string): Promise<FollowUpDetail> {
  const { data } = await apiClient.get<FollowUpDetail>(`${BASE}/${userId}`);
  return { ...data, registrations: data?.registrations ?? [] };
}

/** Statut / note / « contacté ». 422 FOLLOW_UP_OPTED_OUT, FOLLOW_UP_STATUS_FORBIDDEN ; 400 note trop longue. */
export async function updateFollowUp(userId: string, payload: FollowUpUpdateRequest): Promise<FollowUpDetail> {
  const { data } = await apiClient.patch<FollowUpDetail>(`${BASE}/${userId}`, payload);
  return { ...data, registrations: data?.registrations ?? [] };
}
