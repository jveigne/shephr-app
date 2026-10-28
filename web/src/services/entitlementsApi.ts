import { apiClient } from './apiClient';
import type { BillingPeriod, BillingSource, BillingSubscriptionStatus, PlanPrice } from './billingApi';

// ---------------------------------------------------------------------------------------------
//  Droits d'un nœud — lot « pro-plan » (plan docs/shephr/27_10_2026/01_Plan_Pro_Plan.md, contrat
//  02_Contrat_API_Abonnement_Ville.md §4, §9, §10.1). Le SERVEUR reste le seul juge (RG-ABO-23) :
//  ces données ne servent qu'à afficher un verrou ou un état d'abonnement, jamais à ouvrir un accès.
//  Web seulement : `PlanOffer` / `plans` (prix du plan pour « S'abonner ») — le mobile ne les reprend
//  pas (D-ABO-13, RG-ABO-24 : aucun paiement dans l'app).
// ---------------------------------------------------------------------------------------------

export const ENTITLEMENT_ETUDE_SUIVI = 'ETUDE_SUIVI';

/** D-ABO-26 (JP 27/10) — `details` d'un 403 `MODULE_ACCESS_DENIED` (contrat §3). */
export interface ModuleAccessDeniedDetails {
  moduleCode: string;
  /** La ville quand le nœud s'y rattache, sinon le nœud ; null pour la couverture ministère. */
  nodeId: string | null;
  /** RG-ABO-22 — le compte peut souscrire pour cette ville. */
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
  /** Source MANUEL ou VOUCHER (D-OFF-08) : droit ouvert jusqu'à cette date incluse (Europe/Paris, D-ABO-20). */
  manualEndDate: string | null;
  /** D-ABO-20 — fin du délai de grâce (14 j) d'un plan PAST_DUE, sinon null. */
  graceEndsAt: string | null;
  /** `entitledAt(now)` calculé par le serveur — ne jamais le recalculer. */
  entitled: boolean;
  /** D-ABO-22 — seul le payeur ouvre le portail Stripe et voit les factures (D-ABO-07). */
  paidByMe: boolean;
  /** Nom courant du payeur, null s'il a été supprimé. */
  payerName: string | null;
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PlanOffer — WEB SEULEMENT. */
export interface PlanOffer {
  offerCode: string;
  planCode: string;
  /** Langue de l'appelant, repli FR. */
  name: string;
  description: string | null;
  /** Centimes TTC (D-ABO-18) — formatés côté client, jamais recalculés. */
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  currency: string;
  vatRate: number;
  entitlementCodes: string[];
  /**
   * D-OFF-08 (JP 27/10, plan 05 §3.6) — prix local en texte libre (ex. « 10 000 FCFA / mois »), saisi au
   * back-office : information seulement, affichée à côté de « J'ai un code ». Web seulement (jamais
   * sur le mobile). Facultatif côté serveur antérieur : lire `?? null`.
   */
  localPriceLabel?: string | null;
  /**
   * D-CUR-02 (JP 28/10) — prix par devise (EUR en premier, puis USD). Les champs historiques restent le
   * prix EUR. Facultatif : serveur antérieur = EUR seul (repli `utils/currency.pricesOf`).
   */
  prices?: PlanPrice[];
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.EntitlementsResponse */
export interface EntitlementsResponse {
  nodeId: string;
  /** Ville du nœud, null au-dessus (région, nation). */
  localityId: string | null;
  localityName: string | null;
  /** Codes actifs sur ce nœud (triés) — vérité affichable, pas une garde. */
  codes: string[];
  canSubscribe: boolean;
  /** Renseigné seulement pour un lecteur de la ville (D-ABO-21), sinon []. Plus récents d'abord. */
  subscriptions: LocalityPlanSubscription[];
  /** Offres de plan actives — renseigné seulement si `canSubscribe` (web seulement). */
  plans: PlanOffer[];
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
    plans: data?.plans ?? [],
  };
}

/**
 * §9.1 — détails d'un 403 `MODULE_ACCESS_DENIED` (le code est dans `error`, convention `ApiError`),
 * null pour toute autre erreur. Serveur antérieur au 27/10 (sans `details`) : `moduleCode` vide,
 * `canSubscribe` faux.
 */
export function moduleAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const response = (err as { response?: { status?: number; data?: any } } | null)?.response;
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

// ---------------------------------------------------------------------------------------------
//  Droits PERSONNELS — suivi de la hiérarchie (lot « pro-plan », suite du 27/10, D-ABO-31 et
//  suivantes, JP 27/10). Axe de la CHAÎNE de leadership (supervisor_id récursif, `GET /leaders/
//  hierarchy`), jamais l'axe géographique d'`ETUDE_SUIVI` : les deux offres sont indépendantes.
//  Plan de portée DIRIGEANT (`plan_scope = USER`) : le bénéficiaire est le payeur ; l'abonnement
//  d'un dirigeant n'ouvre rien à ceux d'en dessous. Le SERVEUR reste le seul juge (RG-ABO-23).
//  Web seulement : `monthlyPriceCents` / `annualPriceCents` / `currency` (le mobile ne les reprend pas,
//  D-ABO-13 ; RG-MKT-31).
// ---------------------------------------------------------------------------------------------

/** Code de droit du bloc payant de la Hiérarchie (Vie d'assemblée + Message de Bertoua). */
export const ENTITLEMENT_HIERARCHIE_SUIVI = 'HIERARCHIE_SUIVI';
/** Plan personnel « Suivi de ma hiérarchie » (offre `dirigeant-hierarchie`, mensuel ou annuel — D-MKT-03, JP 28/10). */
export const PLAN_DIRIGEANT_HIERARCHIE = 'DIRIGEANT_HIERARCHIE';

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalPlanSubscription */
export interface PersonalPlanSubscription {
  reference: string;
  status: BillingSubscriptionStatus;
  source: BillingSource;
  currentPeriodEnd: string | null;
  /** Source MANUEL ou VOUCHER (D-OFF-08) : droit ouvert jusqu'à cette date incluse (Europe/Paris, D-ABO-20). */
  manualEndDate: string | null;
  /** D-ABO-20 — fin du délai de grâce (14 j) d'un plan PAST_DUE, sinon null. */
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** D-MKT-03, JP 28/10 — période de l'abonnement (Caleb mensuel ou annuel). */
  billingPeriod?: BillingPeriod;
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalPlan */
export interface PersonalPlan {
  planCode: string;
  offerCode: string;
  /** Langue de l'appelant, repli FR. */
  offerName: string;
  /** Centimes TTC — WEB SEULEMENT, formatés côté client, jamais recalculés (RG-ABO-05). */
  monthlyPriceCents: number;
  /** D-MKT-03, JP 28/10 — prix annuel TTC (centimes), `null` = pas de formule annuelle. WEB SEULEMENT. */
  annualPriceCents: number | null;
  currency: string;
  /** Droit ouvert pour l'appelant (`entitledAt(now)` du serveur — ne jamais le recalculer). */
  entitled: boolean;
  /** Rôle manager, pas superAdmin, pas déjà couvert (calculé par le serveur). */
  canSubscribe: boolean;
  /** Abonnement le plus récent de l'appelant pour ce plan (il en est toujours le payeur), sinon null. */
  subscription: PersonalPlanSubscription | null;
  /** D-OFF-08 (JP 27/10, plan 05 §3.6) — prix local en texte libre, WEB SEULEMENT (cf. `PlanOffer`). */
  localPriceLabel?: string | null;
  /** D-CUR-02 (JP 28/10) — prix par devise, WEB SEULEMENT (cf. `PlanOffer.prices`). */
  prices?: PlanPrice[];
}

/** Mirrors com.excellence.back.subscription.entitlement.EntitlementDtos.PersonalEntitlements */
export interface PersonalEntitlements {
  /** Codes personnels actifs (triés) — vérité affichable, pas une garde. */
  codes: string[];
  plans: PersonalPlan[];
}

/** `GET /api/church/entitlements/personal` (tout compte connecté). */
export async function getPersonalEntitlements(): Promise<PersonalEntitlements> {
  const { data } = await apiClient.get<PersonalEntitlements>('/api/church/entitlements/personal');
  return { codes: data?.codes ?? [], plans: data?.plans ?? [] };
}

/** Raccourci : 403 `MODULE_ACCESS_DENIED` sur `HIERARCHIE_SUIVI` (suivi de la hiérarchie), sinon null. */
export function hierarchyAccessDenied(err: unknown): ModuleAccessDeniedDetails | null {
  const denied = moduleAccessDenied(err);
  return denied && denied.moduleCode === ENTITLEMENT_HIERARCHIE_SUIVI ? denied : null;
}

// ---------------------------------------------------------------------------------------------
//  Offre Néhémie — codes de droit de VILLE hors étude (plan 05_Plan_Offres_Caleb_Nehemie.md, JP 27/10).
//  Axe GÉOGRAPHIQUE (la ville), comme `ETUDE_SUIVI` : même plan `EGLISE_VILLE`, même 403 enrichi
//  (`nodeId` = la ville), même verrou web `LockedFeature`. Jamais confondus avec `HIERARCHIE_SUIVI`
//  (offre Caleb, chaîne de supervision, droit personnel).
//  - `JOURNAL` (D-OFF-05) : journal consolidé de la ville, sans nom de personne.
//  - `EVENEMENTS_SUIVI` (D-OFF-12) : statistiques d'Évènements À L'INTÉRIEUR d'une ville.
// ---------------------------------------------------------------------------------------------

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
