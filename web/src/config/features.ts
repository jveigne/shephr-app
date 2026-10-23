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
 *   - events    : Évènements & recensement des actions d'évangélisation (agenda, déclarer,
 *                 statistiques ; « Mes actions » de l'espace membre) — plan du 14/10, lot E8.
 *                 Menus en plus gatés par l'abonnement EVENTS (D-EVT-05, RG-06).
 *   - study     : « Le Message de Bertoua » — Étude de l'assemblée, page à part (/study, /my-study)
 *                 depuis l'avenant ETU9 (D-ETU-28 / D-ETU-31, JP 23/10). Menus en plus gatés par
 *                 l'abonnement STUDY (RG-06), indépendant d'ASSEMBLY.
 */
export const FEATURES = {
  // Repasser à true pour réafficher Tableau de bord / Dons / Exports.
  donations: false,
  // Objectifs (Goals) — activé (mise en avant des engagements).
  goals: true,
  // Vie d'assemblée (D-ASM-12, JP 23/09) — livrée avec le Lot L4.
  assembly: true,
  // Évènements (D-EVT-05, JP 14/10) — livrés avec le lot E8.
  events: true,
  // Étude de l'assemblée (D-ETU-28, JP 23/10) — module STUDY à part, livré avec le lot ETU9.
  study: true,
} as const;