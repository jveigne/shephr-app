import { apiClient } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Abonnements payants (plan et contrat du 23/10/2026, lot ABO4). Miroirs du §10, sous les MÊMES
//  noms dans les trois fronts. Montants en centimes (`int`), formatés côté client (§6.4).
//  D-ABO-01 (JP 23/10) : le paiement n'active JAMAIS de module — rien ici ne touche à
//  `accessible-modules`. D-ABO-07 : le payeur seul voit ses abonnements et ses factures.
//  Le web ajoute le portail Stripe (D-ABO-11, web seulement — D-ABO-13 : jamais sur le mobile).
//  Plan 05 « Offres Caleb / Néhémie » (JP 27/10) : `getPublicPlans` (page publique /offres, qui
//  remplace /abonnements — P-11 / O12 : l'offre « Frais de couverture » et `getPublicOffers` sont
//  retirées) et la saisie d'un code d'activation (`redeemVoucher`, D-OFF-08, web seulement).
// ---------------------------------------------------------------------------------------------

// Mirrors com.excellence.back.billing.BillingDtos (contrat 23/10 §10 + contrat 27/10 §10.2)
export type BillingSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
/**
 * D-ABO-19 (JP 27/10) — origine d'un abonnement : caisse Stripe ou activation manuelle du SUPER_ADMIN.
 * D-OFF-08 (JP 27/10, plan 05) : `VOUCHER` = code d'activation (Mobile Money auprès d'un relais) ;
 * mêmes règles de droit qu'un MANUEL (jusqu'à `manualEndDate` incluse), sans facture ni portail.
 */
export type BillingSource = 'STRIPE' | 'MANUEL' | 'VOUCHER';
/** D-ABO-18 (JP 27/10) — ANNUAL possible pour un plan à prix annuel (D-ABO-03 levée pour les plans). */
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

/** Mirrors com.excellence.back.billing.BillingDtos.PromoPreview */
export interface PromoPreview {
  code: string;
  percentOff: number;
  listPriceCents: number;
  priceCents: number;
  currency: string;
}

/** Mirrors com.excellence.back.billing.BillingDtos.CheckoutResponse */
export interface CheckoutResponse {
  reference: string;
  url: string;
}

/** Mirrors com.excellence.back.billing.BillingDtos.BillingSubscription */
export interface BillingSubscription {
  reference: string;
  status: BillingSubscriptionStatus;
  offerName: string;
  listPriceCents: number;
  discountPercent: number | null;
  promoCode: string | null;
  priceCents: number;
  currency: string;
  billingPeriod: BillingPeriod;
  ministryName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  activatedAt: string | null;
  canceledAt: string | null;
  // Lot pro-plan (contrat 27/10 §5.3, PayerSubscription +4 champs).
  /**
   * D-ABO-16 (JP 27/10) — plan de l'offre (`EGLISE_VILLE`, ou `DIRIGEANT_HIERARCHIE` pour le plan
   * personnel « Suivi de ma hiérarchie », sans ville), null pour l'offre « Frais de couverture ».
   */
  planCode: string | null;
  /** D-ABO-19 (JP 27/10) — ville couverte par un plan, null sinon. */
  localityId: string | null;
  /** Nom courant de la ville ; affiché « {offerName} — {localityName} » (contrat §5.3). */
  localityName: string | null;
  /** Les listes du payeur n'incluent jamais un MANUEL (contrat §5.3) ; un VOUCHER, si (P-07, plan 05). */
  source: BillingSource;
  /**
   * P-07 (JP 27/10, plan 05) — fin du droit d'un abonnement `VOUCHER` (date incluse, Europe/Paris),
   * null sinon. Envoyé par `PayerSubscription.manualEndDate` (ajouté au contrôle croisé du 27/10) ;
   * facultatif : un serveur antérieur au plan 05 ne l'envoie pas (repli `currentPeriodEnd`).
   */
  manualEndDate?: string | null;
}

/** Mirrors com.excellence.back.billing.BillingDtos.BillingInvoice */
export interface BillingInvoice {
  number: string;
  subscriptionReference: string;
  issuedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number;
  netCents: number;
  vatCents: number;
  vatRate: number;
  currency: string;
  offerName: string;
  refundedCents: number;
}

const BASE = '/api/church/billing';

/**
 * §4.1 — aperçu d'un code promo pour une offre (limité à 10 / min / compte). Contrat 27/10 §5.2 :
 * `period` facultatif (MONTHLY par défaut côté serveur) ; ANNUAL sur une offre sans prix annuel → 422
 * `BILLING_PERIOD_UNSUPPORTED`.
 */
export async function previewPromo(code: string, offerCode: string, period?: BillingPeriod) {
  const { data } = await apiClient.get<PromoPreview>(
    `${BASE}/promo-codes/${encodeURIComponent(code)}/preview`,
    { params: period ? { offer: offerCode, period } : { offer: offerCode } },
  );
  return data;
}

/**
 * §4.2 — ouvre le passage en caisse Stripe ; le front redirige vers `url`. Contrat 27/10 §5.1 : pour
 * un plan (`EGLISE_VILLE`), `plan` porte la ville et la période (D-ABO-19 / D-ABO-18, JP 27/10) ;
 * pour l'offre « Frais de couverture », `plan` est absent (aucun `localityId` envoyé).
 */
export async function checkout(
  offerCode: string,
  promoCode?: string | null,
  plan?: { localityId?: string | null; period: BillingPeriod },
) {
  // Plan PERSONNEL (`plan_scope = USER`, « Suivi de ma hiérarchie », JP 27/10) : `period` seul, SANS
  // `localityId` (400 `PERSONAL_PLAN_LOCALITY_FORBIDDEN` sinon) ; MONTHLY seulement.
  const { data } = await apiClient.post<CheckoutResponse>(`${BASE}/checkout`, {
    offerCode,
    promoCode: promoCode || null,
    ...(plan ? { period: plan.period } : {}),
    ...(plan?.localityId ? { localityId: plan.localityId } : {}),
  });
  return data;
}

/** §4.3 — mes abonnements (plus récents d'abord, `EXPIRED` exclus). */
export async function listMySubscriptions() {
  const { data } = await apiClient.get<BillingSubscription[]>(`${BASE}/subscriptions`);
  return data;
}

/** §4.3 — un abonnement du payeur (404 s'il est à un autre). */
export async function getMySubscription(reference: string) {
  const { data } = await apiClient.get<BillingSubscription>(
    `${BASE}/subscriptions/${encodeURIComponent(reference)}`,
  );
  return data;
}

/** §4.4 — session de l'espace client Stripe (D-ABO-11, web seulement). */
export async function openBillingPortal(reference: string) {
  const { data } = await apiClient.post<{ url: string }>(
    `${BASE}/subscriptions/${encodeURIComponent(reference)}/portal`,
  );
  return data;
}

/** §4.5 — mes factures. */
export async function listMyInvoices() {
  const { data } = await apiClient.get<BillingInvoice[]>(`${BASE}/invoices`);
  return data;
}

/** §4.5 — PDF d'une facture, en octets (pas d'URL signée). */
export async function downloadInvoicePdf(number: string) {
  const { data } = await apiClient.get<Blob>(`${BASE}/invoices/${encodeURIComponent(number)}/pdf`, {
    responseType: 'blob',
  });
  return data;
}

// ---------------------------------------------------------------------------------------------
//  Offres Caleb / Néhémie — plan 05_Plan_Offres_Caleb_Nehemie.md (JP 27/10).
// ---------------------------------------------------------------------------------------------

/**
 * Mirrors com.excellence.back.billing.BillingDtos.PublicPlan — §3.8 du plan 05 : plans ACTIFS seulement
 * (Caleb `DIRIGEANT_HIERARCHIE`, Néhémie `EGLISE_VILLE` ; jamais `DONS`). Centimes TTC du serveur,
 * formatés côté client, jamais recalculés (RG-ABO-05). `localPriceLabel` = texte libre du back-office
 * (ex. « 1 000 FCFA / mois »), information seulement (D-OFF-08).
 */
export interface PublicPlan {
  planCode: string;
  offerCode: string;
  name: string;
  nameEn: string | null;
  subtitle: string | null;
  subtitleEn: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  currency: string;
  localPriceLabel: string | null;
  entitlementCodes: string[];
}

/** §3.8 — `GET /api/public/billing/plans`, public (jeton ignoré, comme `/api/public/documents/**`). */
export async function getPublicPlans() {
  const { data } = await apiClient.get<PublicPlan[]>('/api/public/billing/plans');
  return data ?? [];
}

/** Mirrors com.excellence.back.billing.BillingDtos.VoucherRedeemRequest — `localityId` pour Néhémie seulement. */
export interface VoucherRedeemRequest {
  code: string;
  localityId?: string | null;
}

/** Mirrors com.excellence.back.billing.BillingDtos.VoucherRedemption — le « reçu » affiché à l'écran (D-OFF-08). */
export interface VoucherRedemption {
  offerName: string;
  /** Ville couverte (Néhémie), null pour Caleb (droit personnel). */
  localityName: string | null;
  /** Fin du droit, date incluse (Europe/Paris), `AAAA-MM-JJ`. */
  endDate: string;
}

/**
 * Code d'activation saisi tel que l'utilisateur l'a tapé → forme envoyée : sans tiret, sans espace,
 * en majuscules (§3.6 : affiché `XXXX-XXXX-XXXX`, saisi sans tiret ni casse).
 */
export function normalizeVoucherCode(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/**
 * §3.6 — `POST /api/church/billing/vouchers/redeem` (web seulement, D-OFF-08). Caleb : sans
 * `localityId` (400 `PERSONAL_PLAN_LOCALITY_FORBIDDEN` sinon) ; Néhémie : `localityId` requis
 * (400 `BILLING_LOCALITY_REQUIRED`). 10 essais / min / compte (429). Le serveur crée ou PROLONGE
 * l'abonnement `VOUCHER` ; il refuse (`SUBSCRIPTION_ALREADY_ACTIVE`) si un abonnement Stripe ouvre déjà
 * le droit — on ne recalcule rien ici.
 */
export async function redeemVoucher(req: VoucherRedeemRequest) {
  const { data } = await apiClient.post<VoucherRedemption>(`${BASE}/vouchers/redeem`, {
    code: normalizeVoucherCode(req.code),
    ...(req.localityId ? { localityId: req.localityId } : {}),
  });
  return data;
}
