import { Ionicons } from '@expo/vector-icons';

/**
 * Lot T5 (JP 14/09) — APPARENCE des rubriques de don, et elle seule.
 *
 * <p>Ce fichier portait jusqu'ici le RÉFÉRENTIEL en dur : 6 clés, libellés français, aucun anglais,
 * aucun moyen pour un ministère d'en ajouter une. Le référentiel vit désormais côté serveur
 * (`don_category`, une liste par ministère — décision D0-5) et se lit par
 * `hooks/useDonationCategories`.
 *
 * <p>Ce qui reste ici est une donnée d'AFFICHAGE, qui n'a rien à faire en base : l'icône et le ton
 * associés à un code. Même partition que `constants/goalCategories.ts` pour le But Quinquennal.
 *
 * <p>Une rubrique créée par un secrétariat (« Action de grâce ») n'est évidemment pas dans cette
 * table : {@link donationCategoryMeta} retombe alors sur une apparence neutre. Un code inconnu doit
 * s'afficher correctement, pas disparaître.
 */
export interface DonationCategoryMeta {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}

/** Apparence des 6 rubriques livrées d'origine, par code backend (`don_category.code`). */
export const DONATION_CATEGORY_META: Record<string, DonationCategoryMeta> = {
  dime: { icon: 'leaf-outline', tone: '#3D6B4A' },
  offrande: { icon: 'gift-outline', tone: '#A7754B' },
  mission: { icon: 'globe-outline', tone: '#5C7CB0' },
  batiment: { icon: 'business-outline', tone: '#8C6E54' },
  special: { icon: 'star-outline', tone: '#B89A4A' },
  autre: { icon: 'ellipsis-horizontal', tone: '#6E665A' },
};

/** Repli pour toute rubrique hors de la table ci-dessus — y compris celles créées après coup. */
export const DEFAULT_DONATION_CATEGORY_META: DonationCategoryMeta = {
  icon: 'pricetag-outline',
  tone: '#6E665A',
};

export function donationCategoryMeta(code: string | null | undefined): DonationCategoryMeta {
  if (!code) return DEFAULT_DONATION_CATEGORY_META;
  return DONATION_CATEGORY_META[code.trim().toLowerCase()] ?? DEFAULT_DONATION_CATEGORY_META;
}
