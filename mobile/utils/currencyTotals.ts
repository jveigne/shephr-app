/**
 * Totaux PAR DEVISE — Lot T1/T4 (14/09).
 *
 * La déclaration accepte GBP, EUR et USD : additionner ces montants dans un seul nombre, puis
 * l'étiqueter « £ », est un faux comptable (défauts D et E, §8 de docs/donations-etat-des-lieux.md).
 * Toutes les vues de trésorerie passent donc par ce regroupement — jamais par un filtre
 * `currency === 'GBP'`, qui faisait disparaître un don en euros.
 */
export interface CurrencyLine {
  currency: string;
  total: number;
  count: number;
}

/** Regroupe des lignes de statistiques par devise, de la plus grosse à la plus petite. */
export function sumByCurrency(
  rows: { currency: string; total: number; count: number }[],
): CurrencyLine[] {
  const map = new Map<string, CurrencyLine>();
  for (const r of rows) {
    const line = map.get(r.currency) ?? { currency: r.currency, total: 0, count: 0 };
    line.total += r.total;
    line.count += r.count;
    map.set(r.currency, line);
  }
  return [...map.values()].sort(
    (a, b) => b.total - a.total || a.currency.localeCompare(b.currency),
  );
}

/** Devise dominante d'un jeu de lignes (la plus grosse en montant) ; null si aucune donnée. */
export function dominantCurrency(
  rows: { currency: string; total: number; count: number }[],
): string | null {
  return sumByCurrency(rows)[0]?.currency ?? null;
}
