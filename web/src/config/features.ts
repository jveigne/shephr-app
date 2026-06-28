/**
 * Feature flags de livraison.
 *
 * Livraison « Member Care only » (décision JP 2026-06-27) : pour la livraison
 * client Suivi pastoral, on masque temporairement les Dons ET les Goals afin de
 * ne montrer que Member Care + Organisation.
 *
 * Réactivation : repasser le flag concerné à `true`.
 *   - donations : Tableau de bord, Dons, Exports
 *   - goals     : Objectifs (Goals)
 */
export const FEATURES = {
  // Repasser à true pour réafficher Tableau de bord / Dons / Exports.
  donations: false,
  // Repasser à true pour réafficher les Goals.
  goals: false,
} as const;