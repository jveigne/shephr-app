import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { apiClient } from '@/services/apiClient';

// Abonnements payants — espace PAYEUR, consultation seule (plan 23/10 §6.2, contrat
// 02_Contrat_API_Abonnements.md §4.3 et §4.5). Routes sous /api/church/billing (authentifié).
//
// D-ABO-13 (JP 23/10) : l'app ne fait que CONSULTER et TÉLÉCHARGER. Aucun appel d'achat
// (`/checkout`, aperçu de code promo) ni d'espace client Stripe (`/portal`) ici, sur iOS comme sur
// Android (règles App Store 3.1.1 / Google Play Billing) — ne pas en ajouter.
// D-ABO-07 : le serveur ne renvoie que les abonnements et factures du payeur connecté.
// Montants en centimes, formatés côté client ; dates ISO (Instant).

// Mirrors com.excellence.back.billing.BillingDtos
export type BillingSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

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
  /** RG-ABO-07 : résiliation demandée, encore ACTIVE jusqu'à `currentPeriodEnd`. */
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

/** Codes d'erreur du contrat §9 traduits par l'app (`billing.errors.*`), repli sur `message`. */
export const BILLING_ERROR_CODES = [
  'BILLING_SUBSCRIPTION_NOT_FOUND',
  'BILLING_INVOICE_NOT_FOUND',
  'TOO_MANY_REQUESTS',
  'PAYMENT_PROVIDER_UNAVAILABLE',
];

/** §4.3 — abonnements du payeur, plus récents d'abord, `EXPIRED` exclus. */
export async function listMySubscriptions(): Promise<BillingSubscription[]> {
  const { data } = await apiClient.get<BillingSubscription[]>(`${BASE}/subscriptions`);
  return data ?? [];
}

/** §4.5 — factures du payeur. */
export async function listMyInvoices(): Promise<BillingInvoice[]> {
  const { data } = await apiClient.get<BillingInvoice[]>(`${BASE}/invoices`);
  return data ?? [];
}

/**
 * §4.5 — télécharge le PDF d'une facture (octets, pas d'URL signée : la requête porte le Bearer
 * via `apiClient`) puis le remet :
 * - natif : écrit dans le cache (`expo-file-system`, API `File` / `Paths`) puis feuille de partage
 *   (`expo-sharing` : ouvrir, enregistrer dans Fichiers, envoyer au comptable) ;
 * - Expo web : lien de téléchargement.
 *
 * @returns 'shared' / 'downloaded', ou 'unavailable' quand le partage n'existe pas sur l'appareil.
 */
export async function downloadInvoicePdf(
  invoiceNumber: string,
  dialogTitle: string,
): Promise<'shared' | 'downloaded' | 'unavailable'> {
  const url = `${BASE}/invoices/${encodeURIComponent(invoiceNumber)}/pdf`;
  // Nom lisible pour le destinataire, aligné sur le `Content-Disposition` du serveur.
  const fileName = `${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;

  if (Platform.OS === 'web') {
    const data = await apiClient
      .get<Blob>(url, { responseType: 'blob' })
      .then((r) => r.data)
      .catch(async (e) => {
        await decodeBinaryErrorBody(e);
        throw e;
      });
    const href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Libérer l'objet tout de suite couperait le téléchargement dans certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return 'downloaded';
  }

  const data = await apiClient
    .get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
    .then((r) => r.data)
    .catch(async (e) => {
      await decodeBinaryErrorBody(e);
      throw e;
    });
  // expo-file-system (SDK 57) : `write` prend les octets tels quels, sans détour par du base64.
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(new Uint8Array(data));
  if (!file.exists || file.size === 0) throw new Error('INVOICE_FILE_MISSING');
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
  return 'shared';
}

/**
 * Le PDF se télécharge en `arraybuffer` (natif) ou `blob` (Expo web) : en cas d'erreur, le corps
 * JSON du contrat §9 arrive sous cette forme. On le relit pour que `billingErrorMessage` trouve
 * le code (`BILLING_INVOICE_NOT_FOUND`…), comme `blobErrMsg` sur le web.
 */
async function decodeBinaryErrorBody(e: any): Promise<void> {
  const data = e?.response?.data;
  const isBlob = typeof Blob !== 'undefined' && data instanceof Blob;
  if (!(data instanceof ArrayBuffer) && !isBlob) return;
  try {
    let text: string;
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      text =
        typeof TextDecoder !== 'undefined'
          ? new TextDecoder('utf-8').decode(bytes)
          : String.fromCharCode(...Array.from(bytes));
    } else {
      text = await (data as Blob).text();
    }
    e.response.data = JSON.parse(text);
  } catch {
    // Corps illisible : repli sur le statut HTTP (404 de cette route = facture inconnue, §4.5).
    e.response.data = e.response.status === 404 ? { error: 'BILLING_INVOICE_NOT_FOUND' } : null;
  }
}

/** Message d'erreur d'un appel de facturation : code du contrat §9 traduit, sinon `message`. */
export function billingErrorMessage(e: any, t: (key: string) => string, fallback: string): string {
  // « Hors ligne » seulement pour une vraie erreur réseau axios : une erreur locale (fichier non
  // écrit, partage en échec) n'a pas de réponse HTTP non plus, mais le réseau a fonctionné.
  if (!e?.response) {
    return e?.isAxiosError || e?.code === 'ERR_NETWORK' ? t('billing.offline') : fallback;
  }
  const data = e.response.data;
  const status = e.response.status;
  const code =
    data?.error ??
    data?.code ??
    (status === 429 ? 'TOO_MANY_REQUESTS' : status === 503 ? 'PAYMENT_PROVIDER_UNAVAILABLE' : null);
  if (code && BILLING_ERROR_CODES.includes(code)) return t(`billing.errors.${code}`);
  return data?.message ?? fallback;
}
