/**
 * Feature flags de livraison : on livre « Goals only » (mise en avant des
 * engagements demandée par le client — JP 2026-07-10).
 * Tout ce qui concerne les Dons (onglets Mes dons / Périmètre, sections de l'accueil)
 * est masqué ; l'accueil affiche le raccourci « Mes objectifs ».
 * Réactivation = passer `donations` à true.
 */
export const FEATURES = {
  // Dons masqués (mise en avant Goals). Repasser à true pour réafficher les Dons.
  donations: false,
} as const;
