import { apiClient } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Abonnements payants (plan et contrat du 23/10/2026, lot ABO4). Miroirs du §10, sous les MÊMES
//  noms dans les trois fronts. Montants en centimes (`int`), formatés côté client (§6.4).
//  D-ABO-01 (JP 23/10) : le paiement n'active JAMAIS de module — rien ici ne touche à
//  `accessible-modules`. D-ABO-07 : le payeur seul voit ses abonnements et ses factures.
//  Le web ajoute `getPublicOffers` (page publique /abonnements) et le portail Stripe (D-ABO-11,
//  web seulement — D-ABO-13 : jamais sur le mobile).
// ---------------------------------------------------------------------------------------------

// Mirrors com.excellence.back.billing.BillingDtos
export type BillingSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

/** Mirrors com.excellence.back.billing.BillingDtos.BillingOffer — `name` / `description` dans la langue `Accept-Language`. */
export interface BillingOffer {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingPeriod: 'MONTHLY' | 'ANNUAL';
  vatRate: number;
}

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
  billingPeriod: 'MONTHLY' | 'ANNUAL';
  ministryName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  activatedAt: string | null;
  canceledAt: string | null;
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

/** §3 — public, sans jeton (le backend ignore un jeton invalide). Langue = `Accept-Language`. */
export async function getPublicOffers(lang: string) {
  const { data } = await apiClient.get<BillingOffer[]>('/api/public/billing/offers', {
    headers: { 'Accept-Language': lang.startsWith('en') ? 'en' : 'fr' },
  });
  return data;
}

/** §4.1 — aperçu d'un code promo pour une offre (limité à 10 / min / compte). */
export async function previewPromo(code: string, offerCode: string) {
  const { data } = await apiClient.get<PromoPreview>(
    `${BASE}/promo-codes/${encodeURIComponent(code)}/preview`,
    { params: { offer: offerCode } },
  );
  return data;
}

/** §4.2 — ouvre le passage en caisse Stripe ; le front redirige vers `url`. */
export async function checkout(offerCode: string, promoCode?: string | null) {
  const { data } = await apiClient.post<CheckoutResponse>(`${BASE}/checkout`, {
    offerCode,
    promoCode: promoCode || null,
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
