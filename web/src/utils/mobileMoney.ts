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
 * D-MKT-03 (JP 28/10, RG-MKT-08) : Caleb existe aussi à l'année — la période est obligatoire pour les deux.
 */
export function mobileMoneyMessage(
  t: TFunction,
  input:
    | { offer: 'caleb'; localPrice: string | null; username: string; period: BillingPeriod }
    | { offer: 'nehemie'; localPrice: string | null; username: string; city: string; period: BillingPeriod },
): string {
  const base = input.localPrice ? `offers.pay.message.${input.offer}` : `offers.pay.message.${input.offer}NoPrice`;
  return t(base, {
    offer: t(`offers.${input.offer}.short`),
    localPrice: input.localPrice ?? '',
    username: input.username,
    period: t(`offers.pay.periodWord.${input.period}`),
    ...(input.offer === 'nehemie' ? { city: input.city } : {}),
  });
}

/**
 * Prix local de LA formule choisie — constats PAY / MKT (plan 28_10_2026/03 §12, 05 §10.6 n°5, JP 29/10).
 * Le serveur stocke un texte libre « {mensuel} · {annuel} » (ex. « 1 000 FCFA / mois · 10 000 FCFA / an »,
 * D-OFF-08 / D-CUR-08) : on en garde le segment de la période (mensuel = 1er, annuel = 2ᵈ), jamais
 * recomposé ni traduit. Un texte sans « · » (une seule formule) est rendu tel quel ; annuel absent → le
 * texte entier plutôt qu'un prix mensuel présenté comme annuel.
 */
export function localPriceForPeriod(label: string | null | undefined, period: BillingPeriod): string | null {
  const text = (label ?? '').trim();
  if (!text) return null;
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  return period === 'ANNUAL' ? parts[1] : parts[0];
}
