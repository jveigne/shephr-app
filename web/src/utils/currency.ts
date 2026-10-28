import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingCurrency, BillingPeriod, PlanPrice } from '../services/billingApi';

// ---------------------------------------------------------------------------------------------
//  Devise d'affichage et de paiement des offres — lot « CUR » (plan 28_10_2026/07_Plan_Devises_USD.md,
//  D-CUR-02 / 03, JP 28/10). Prix USD FIXES par offre, saisis au back-office : AUCUNE conversion ici
//  (RG-CUR-04) — le front choisit seulement quelle ligne `PlanPrice` du serveur afficher et envoyer.
//  - RG-CUR-18 : défaut `USD` si la langue de l'interface commence par `en`, `EUR` sinon ; un choix
//    explicite du visiteur (`localStorage['shephr.offers.currency']`) prime sur la langue. Lecture et
//    écriture sous try/catch (mode privé, stockage bloqué) ; valeur invalide ignorée.
//  - RG-CUR-19 : même choix partagé par `/offres`, `LockedFeature` (Néhémie) et `HierarchyLockedFeature`
//    (Caleb) — un petit magasin en mémoire tient les composants montés d'accord entre eux.
//  - RG-CUR-20 : devise choisie absente pour une offre → l'offre s'affiche et se paie en EUR (mention
//    `offers.currency.eurOnly`).
// ---------------------------------------------------------------------------------------------

export const CURRENCY_STORAGE_KEY = 'shephr.offers.currency';

const isCurrency = (v: unknown): v is BillingCurrency => v === 'EUR' || v === 'USD';

/** RG-CUR-18 — devise par défaut selon la langue de l'interface. */
export function defaultCurrency(lang: string | undefined): BillingCurrency {
  return (lang ?? '').toLowerCase().startsWith('en') ? 'USD' : 'EUR';
}

/** Choix explicite gardé, ou `null` (jamais choisi, stockage indisponible, valeur invalide). */
export function readCurrencyChoice(): BillingCurrency | null {
  try {
    const v = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isCurrency(v) ? v : null;
  } catch {
    return null;
  }
}

// Magasin en mémoire : le choix de la session, même si `localStorage` refuse l'écriture.
let memoryChoice: BillingCurrency | null | undefined;
const listeners = new Set<() => void>();

function currentChoice(): BillingCurrency | null {
  if (memoryChoice === undefined) memoryChoice = readCurrencyChoice();
  return memoryChoice;
}

/** Garde le choix explicite (mémoire + `localStorage` sous try/catch) et prévient les composants montés. */
export function saveCurrencyChoice(c: BillingCurrency): void {
  memoryChoice = c;
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, c);
  } catch {
    // Stockage bloqué : le choix vaut pour la session seulement.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Devise choisie (explicite, sinon selon la langue) et son setter — partagé par tous les sélecteurs. */
export function useCurrencyChoice(): [BillingCurrency, (c: BillingCurrency) => void] {
  const { i18n } = useTranslation();
  const choice = useSyncExternalStore(subscribe, currentChoice, () => null);
  const set = useCallback((c: BillingCurrency) => saveCurrencyChoice(c), []);
  return [choice ?? defaultCurrency(i18n.language), set];
}

/** Forme commune des plans du serveur (`PublicPlan`, `PlanOffer`, `PersonalPlan`). */
export interface PricedPlan {
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  currency: string;
  prices?: PlanPrice[] | null;
}

/**
 * Lignes de prix d'un plan. Serveur antérieur au lot CUR (pas de `prices`) : repli sur les champs
 * historiques, qui portent le prix EUR (§4.1) — jamais de calcul.
 */
export function pricesOf(plan: PricedPlan | null | undefined): PlanPrice[] {
  if (!plan) return [];
  if (plan.prices && plan.prices.length > 0) return plan.prices;
  return [
    {
      currency: isCurrency(plan.currency) ? plan.currency : 'EUR',
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
    },
  ];
}

/** Devises proposées par un ou plusieurs plans (pour masquer le sélecteur s'il n'y en a qu'une). */
export function currenciesOf(...plans: (PricedPlan | null | undefined)[]): BillingCurrency[] {
  const set = new Set<BillingCurrency>();
  plans.forEach((p) => pricesOf(p).forEach((x) => set.add(x.currency)));
  return (['EUR', 'USD'] as const).filter((c) => set.has(c));
}

/**
 * RG-CUR-20 — ligne de prix de la devise choisie, sinon la ligne EUR (`fallback = true` : mention
 * « Prix en euros uniquement »). `null` si le plan n'a aucun prix.
 */
export function priceFor(
  prices: PlanPrice[],
  currency: BillingCurrency,
): { price: PlanPrice; fallback: boolean } | null {
  const exact = prices.find((p) => p.currency === currency);
  if (exact) return { price: exact, fallback: false };
  const eur = prices.find((p) => p.currency === 'EUR') ?? prices[0];
  return eur ? { price: eur, fallback: true } : null;
}

/** RG-CUR-22 — l'annuel existe-t-il DANS la devise affichée. */
export function hasAnnualPrice(price: PlanPrice | null | undefined): boolean {
  return !!price && price.annualPriceCents != null && price.annualPriceCents > 0;
}

/** Centimes de la période dans la devise de la ligne (annuel absent → mensuel). */
export function centsFor(price: PlanPrice, period: BillingPeriod): number {
  return period === 'ANNUAL' && hasAnnualPrice(price) ? (price.annualPriceCents as number) : price.monthlyPriceCents;
}
