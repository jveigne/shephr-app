import { apiClient } from './apiClient';
import type { FollowUpStatus } from './eventsApi';

// ---------------------------------------------------------------------------------------------
//  « Personnes à suivre » — lot « conf-pays » (D-PAYS-13, RG-PAYS-30..34, JP 11/11 ; contrat
//  11_11_2026/02 §9). Suivi des comptes SANS assemblée par la GÉOGRAPHIE (dirigeants de la ville /
//  région / nation, secrétariat), séparé de Member Care. Gratuit, sans @RequiresModule (D-PAYS-14).
//  Droits (`canView`, `canEdit`) calculés par le serveur : jamais recalculés ici.
// ---------------------------------------------------------------------------------------------

export type { FollowUpStatus };

const BASE = '/api/church/follow-ups';

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpScope (JP 11/11). */
export interface FollowUpScope {
  canView: boolean;
  canEdit: boolean;
  /** Villes filtrables (périmètre de suivi), tri par nom. */
  localities: { id: string; name: string }[];
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpSummary (JP 11/11). */
export interface FollowUpSummary {
  userId: string;
  fullName: string;
  phoneNumber: string | null;
  phoneCountryCode: string | null;
  email: string | null;
  countryIso: string | null;
  cityId: string | null;
  cityName: string | null;
  /** Statut EFFECTIF (INTEGREE calculé à la lecture, E-06). */
  status: FollowUpStatus;
  note: string | null;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  updatedByName: string | null;
  /** Inscriptions REGISTERED, venus, `attended = false`. */
  registrationCount: number;
  attendedCount: number;
  noShowCount: number;
  nextEventDate: string | null;
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpRegistration (JP 11/11). */
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

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpDetail (JP 11/11). */
export interface FollowUpDetail extends FollowUpSummary {
  canEdit: boolean;
  consentAt: string;
  /** Plus récentes d'abord. */
  registrations: FollowUpRegistration[];
}

/** Mirrors com.excellence.back.org.followup.FollowUpDtos.FollowUpUpdateRequest (JP 11/11). */
export interface FollowUpUpdateRequest {
  /** INTEGREE / NE_SOUHAITE_PAS jamais posés par un dirigeant (422 `FOLLOW_UP_STATUS_FORBIDDEN`). */
  status?: 'A_CONTACTER' | 'CONTACTEE' | null;
  /** ≤ 2 000 ; null = inchangée, "" = effacée. */
  note?: string | null;
  /** `last_contact_at = now`. */
  markContacted?: boolean;
}

export interface FollowUpListParams {
  status?: FollowUpStatus;
  localityId?: string;
  withoutCity?: boolean;
  noShow?: boolean;
  newThisMonth?: boolean;
  q?: string;
}

/** Sert à afficher l'entrée de menu (tout compte connecté). */
export async function getFollowUpScope(): Promise<FollowUpScope> {
  const { data } = await apiClient.get<FollowUpScope>(`${BASE}/scope`);
  return { canView: !!data?.canView, canEdit: !!data?.canEdit, localities: data?.localities ?? [] };
}

/** Liste filtrée par `canView` ligne à ligne (jamais de 403) ; défaut : À contacter + Contactée. */
export async function listFollowUps(params: FollowUpListParams): Promise<FollowUpSummary[]> {
  const clean: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) clean[k] = v as string | boolean;
  const { data } = await apiClient.get<FollowUpSummary[]>(BASE, { params: clean });
  return data ?? [];
}

/** 404 sans fiche ; 403 `UNAUTHORIZED_ACCESS` hors périmètre. */
export async function getFollowUp(userId: string): Promise<FollowUpDetail> {
  const { data } = await apiClient.get<FollowUpDetail>(`${BASE}/${userId}`);
  return { ...data, registrations: data?.registrations ?? [] };
}

/** 422 `FOLLOW_UP_OPTED_OUT` / `FOLLOW_UP_STATUS_FORBIDDEN` ; 400 note trop longue. */
export async function updateFollowUp(userId: string, body: FollowUpUpdateRequest): Promise<FollowUpDetail> {
  const { data } = await apiClient.patch<FollowUpDetail>(`${BASE}/${userId}`, body);
  return { ...data, registrations: data?.registrations ?? [] };
}
