import type { TFunction } from 'i18next';
import type { BillingPeriod } from '../services/billingApi';

/**
 * « Payer par Mobile Money » — D-PAY-02 / D-PAY-03, JP 28/10 (RG-PAY-22 à 25). Le bouton ouvre WhatsApp
 * vers le relais (numéro plateforme réglé au back-office, `GET /api/app/contact` › `paymentWhatsappUrl`)
 * avec un message pré-rempli ; le relais encaisse puis remet un code voucher (« J'ai un code »,
 * D-OFF-08) ou l'équipe active au back-office. Rien n'est payé ni activé par ce lien.
 */

/** RG-PAY-23 : `{paymentWhatsappUrl}?text={message}` — l'URL de base vient du serveur, jamais composée ici. */
export function mobileMoneyUrl(baseUrl: string, message: string): string {
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

/**
 * RG-PAY-24 : message dans la langue de l'interface — offre, prix local (s'il existe), ville et période
 * pour Néhémie, identifiant Shephr du compte. JAMAIS : jeton, UUID, téléphone, rôle, montant en euros.
 */
export function mobileMoneyMessage(
  t: TFunction,
  input:
    | { offer: 'caleb'; localPrice: string | null; username: string }
    | { offer: 'nehemie'; localPrice: string | null; username: string; city: string; period: BillingPeriod },
): string {
  const base = input.localPrice ? `offers.pay.message.${input.offer}` : `offers.pay.message.${input.offer}NoPrice`;
  return t(base, {
    offer: t(`offers.${input.offer}.short`),
    localPrice: input.localPrice ?? '',
    username: input.username,
    ...(input.offer === 'nehemie' ? { city: input.city, period: t(`offers.pay.periodWord.${input.period}`) } : {}),
  });
}
