/**
 * Feature flags de livraison (décision JP 2026-06-10) : on livre « Goals only ».
 * Tout ce qui concerne les Dons (onglets Mes dons / Périmètre, sections de l'accueil)
 * est masqué tant que le MVP Donations (Phase 6) n'est pas lancé.
 * Réactivation = passer `donations` à true.
 */
export const FEATURES = {
  // Phase 6 (MVP Donations Londres) — activé. Repasser à false pour masquer les Dons.
  donations: true,
} as const;
