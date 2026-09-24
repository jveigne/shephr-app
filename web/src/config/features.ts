/**
 * Feature flags de livraison.
 *
 * Historique :
 *   - « Member Care only » (JP 2026-06-27) : Dons ET Goals masqués.
 *   - Mise en avant des engagements (JP 2026-07-10) : `goals` réactivé — à la
 *     connexion on tombe sur /goals (la vue globale / carte pour les rôles
 *     ministère-large). Les Dons restent masqués.
 *
 * Réactivation : repasser le flag concerné à `true`.
 *   - donations : Tableau de bord, Dons, Exports
 *   - goals     : Objectifs (Goals)
 *   - assembly  : Vie d'assemblée (réunions, CR, avancement des modules) — D-ASM-12 (JP 23/09).
 *                 Le menu reste en plus gaté par l'abonnement ASSEMBLY (accessible-modules, RG-06).
 */
export const FEATURES = {
  // Repasser à true pour réafficher Tableau de bord / Dons / Exports.
  donations: false,
  // Objectifs (Goals) — activé (mise en avant des engagements).
  goals: true,
  // Vie d'assemblée (D-ASM-12, JP 23/09) — livrée avec le Lot L4.
  assembly: true,
} as const;