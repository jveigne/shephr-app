import { apiClient } from '@/services/apiClient';

// Droits d'un nœud — lot « pro-plan » (plan docs/shephr/27_10_2026/01_Plan_Pro_Plan.md, contrat
// 02_Contrat_API_Abonnement_Ville.md §4 et §9). Le SERVEUR reste le seul juge (RG-ABO-23) : ces
// données ne servent qu'à afficher un verrou, jamais à ouvrir un accès.
//
// D-ABO-13 (JP 23/10, maintenue le 27/10 — RG-ABO-24) : l'app ne propose jamais de payer, sur iOS
// comme sur Android. Ce miroir ne reprend donc VOLONTAIREMENT ni `PlanOffer` ni le champ `plans`
// (offres et prix) de `EntitlementsResponse` — ne pas les « compléter ».

export const ENTITLEMENT_ETUDE_SUIVI = 'ETUDE_SUIVI';

// D-OFF-10 (JP 27/10) : l'écran « Mes factures » et `services/billingApi.ts` sont retirés de l'app ;
// les trois énumérations de facturation lues par les droits (état d'un abonnement de plan, sans
// montant) vivent désormais ici.
// Mirrors com.excellence.back.billing.BillingDtos (contrat 23/10 §10 + contrat 27/10 §10.2)
export type BillingSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
/**
 * D-ABO-19 (JP 27/10) — origine d'un abonnement : caisse Stripe, activation manuelle du SUPER_ADMIN
 * ou, depuis D-OFF-08 (JP 27/10), code voucher saisi sur le web (jamais dans l'app).
 */
export type BillingSource = 'STRIPE' | 'MANUEL' | 'VOUCHER';
/** D-ABO-18 (JP 27/10) — ANNUAL possible pour un plan à prix annuel (D-ABO-03 levée pour les plans). */
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

/** D-ABO-26 (JP 27/10) — `details` d'un 403 `MODULE_ACCESS_DENIED` (contrat §3). */
export interface ModuleAccessDeniedDetails {
  moduleCode: string;
  /** La ville quand le nœud s'y rattache, sinon le nœud ; null pour la couverture ministère. */
  nodeId: string | null;
  /** RG-ABO-22 — le compte pourrait souscrire (depuis l'espace web seulement). */
  canSubscribe: boolean;
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.LocalityPlanSubscription */
export interface LocalityPlanSubscription {
  reference: string;
  planCode: string;
  status: BillingSubscriptionStatus;
  source: BillingSource;
  billingPeriod: BillingPeriod;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  manualEndDate: string | null;
  /** D-ABO-20 — fin du délai de grâce d'un plan PAST_DUE. */
  graceEndsAt: string | null;
  entitled: boolean;
  paidByMe: boolean;
  payerName: string | null;
}

/**
 * Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.EntitlementsResponse — SANS le
 * champ `plans` (D-ABO-13 : aucune offre ni aucun prix dans l'app).
 */
export interface EntitlementsResponse {
  nodeId: string;
  /** Ville du nœud, null au-dessus (région, nation). */
  localityId: string | null;
  localityName: string | null;
  /** Codes actifs sur ce nœud (triés). */
  codes: string[];
  canSubscribe: boolean;
  /** Renseigné seulement pour un lecteur de la ville (D-ABO-21), sinon []. */
  subscriptions: LocalityPlanSubscription[];
}

/** §4.2 — `GET /api/church/entitlements?nodeId=` (tout compte connecté). */
export async function getEntitlements(nodeId: string): Promise<EntitlementsResponse> {
  const { data } = await apiClient.get<EntitlementsResponse>('/api/church/entitlements', {
    params: { nodeId },
  });
  return {
    nodeId: data?.nodeId ?? nodeId,
    localityId: data?.localityId ?? null,
    localityName: data?.localityName ?? null,
    codes: data?.codes ?? [],
    canSubscribe: !!data?.canSubscribe,
    subscriptions: data?.subscriptions ?? [],
  };
}

/**
 * §9.1 — détails d'un 403 `MODULE_ACCESS_DENIED` (le code est dans `error`, convention `ApiError`),
 * null pour toute autre erreur. Serveur antérieur au 27/10 (sans `details`) : `moduleCode` vide,
 * `canSubscribe` faux.
 */
export function moduleAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const response = (err as any)?.response;
  if (!response || response.status !== 403) return null;
  const data = response.data;
  if (data?.error !== 'MODULE_ACCESS_DENIED') return null;
  const details = data?.details ?? {};
  return {
    moduleCode: typeof details.moduleCode === 'string' ? details.moduleCode : '',
    nodeId: typeof details.nodeId === 'string' ? details.nodeId : null,
    canSubscribe: details.canSubscribe === true,
  };
}

/** Raccourci : 403 `MODULE_ACCESS_DENIED` sur `ETUDE_SUIVI` (suivi de la ville), sinon null. */
export function studyCityAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const denied = moduleAccessDenied(err);
  return denied && denied.moduleCode === ENTITLEMENT_ETUDE_SUIVI ? denied : null;
}

/**
 * Offre Néhémie — codes de droit de VILLE hors étude (plan `05_Plan_Offres_Caleb_Nehemie.md`, JP
 * 27/10). Axe GÉOGRAPHIQUE (la ville), comme `ETUDE_SUIVI` : même plan `EGLISE_VILLE`, même 403
 * enrichi (`nodeId` = la ville). Jamais confondus avec `HIERARCHIE_SUIVI` (Caleb, chaîne).
 * - `JOURNAL` (D-OFF-05) : journal consolidé de la ville, sans nom de personne.
 * - `EVENEMENTS_SUIVI` (D-OFF-12) : statistiques d'Évènements À L'INTÉRIEUR d'une ville.
 * Contrôle croisé 27/10 : mêmes noms que la copie web (`cityJournalAccessDenied`,
 * `cityEventsAccessDenied`) — les helpers de ce fichier restent identiques des deux côtés.
 */
export const ENTITLEMENT_JOURNAL = 'JOURNAL';
export const ENTITLEMENT_EVENEMENTS_SUIVI = 'EVENEMENTS_SUIVI';

/** Raccourci : 403 `MODULE_ACCESS_DENIED` sur `JOURNAL` (journal de la ville), sinon null. */
export function cityJournalAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const denied = moduleAccessDenied(err);
  return denied && denied.moduleCode === ENTITLEMENT_JOURNAL ? denied : null;
}

/** Raccourci : 403 `MODULE_ACCESS_DENIED` sur `EVENEMENTS_SUIVI` (statistiques d'une ville), sinon null. */
export function cityEventsAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const denied = moduleAccessDenied(err);
  return denied && denied.moduleCode === ENTITLEMENT_EVENEMENTS_SUIVI ? denied : null;
}

// ---------------------------------------------------------------------------------------------
// Suivi de ma hiérarchie — plan PERSONNEL `DIRIGEANT_HIERARCHIE` (lot « pro-plan », suite du 27/10,
// D-ABO-31 et suivantes, JP 27/10). Axe de la CHAÎNE de leadership (supervisor_id récursif, écran
// Hiérarchie), jamais l'axe géographique de `EGLISE_VILLE` : les deux offres sont indépendantes.
// Le code HIERARCHIE_SUIVI ouvre, dans la Hiérarchie, le bloc « Vie d'assemblée » (D-ASM-18) et le
// bloc « Le Message de Bertoua » ; le bloc Leadership / Goals reste gratuit.
//
// D-ABO-13 (maintenue) : ce miroir ne reprend VOLONTAIREMENT ni `monthlyPriceCents` ni `currency`
// de `PersonalPlan` — l'app n'affiche aucun prix et ne propose jamais de payer. Ne pas les ajouter.
// ---------------------------------------------------------------------------------------------

export const ENTITLEMENT_HIERARCHIE_SUIVI = 'HIERARCHIE_SUIVI';

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalPlanSubscription */
export interface PersonalPlanSubscription {
  reference: string;
  status: BillingSubscriptionStatus;
  source: BillingSource;
  currentPeriodEnd: string | null;
  manualEndDate: string | null;
  /** Fin du délai de grâce d'un abonnement PAST_DUE (14 j, comme la ville — D-ABO-20). */
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalPlan — SANS
 * `monthlyPriceCents` ni `currency` (D-ABO-13).
 */
export interface PersonalPlan {
  planCode: string;
  offerCode: string;
  offerName: string;
  entitled: boolean;
  /** Sans usage sur l'app : aucun parcours d'achat (D-ABO-13), le verrou garde un texte neutre. */
  canSubscribe: boolean;
  subscription: PersonalPlanSubscription | null;
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalEntitlements */
export interface PersonalEntitlements {
  /** Codes personnels ouverts pour le compte connecté (superAdmin, plan USER, accord de ministère). */
  codes: string[];
  plans: PersonalPlan[];
}

/** `GET /api/church/entitlements/personal` — droits PERSONNELS du compte connecté. */
export async function getPersonalEntitlements(): Promise<PersonalEntitlements> {
  const { data } = await apiClient.get<PersonalEntitlements>('/api/church/entitlements/personal');
  return {
    codes: data?.codes ?? [],
    plans: (data?.plans ?? []).map((p: any) => ({
      planCode: p.planCode,
      offerCode: p.offerCode,
      offerName: p.offerName,
      entitled: !!p.entitled,
      canSubscribe: !!p.canSubscribe,
      subscription: p.subscription ?? null,
    })),
  };
}

/** Raccourci : 403 `MODULE_ACCESS_DENIED` sur `HIERARCHIE_SUIVI` (stats de la hiérarchie), sinon null. */
export function hierarchyAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const denied = moduleAccessDenied(err);
  return denied && denied.moduleCode === ENTITLEMENT_HIERARCHIE_SUIVI ? denied : null;
}
