export type DonationCategory =
  | 'dime'
  | 'offrande'
  | 'mission'
  | 'batiment'
  | 'special'
  | 'autre';

export interface CategoryMeta {
  key: DonationCategory;
  fr: string;
}

export const CATEGORIES: Record<DonationCategory, CategoryMeta> = {
  dime: { key: 'dime', fr: 'Dîme' },
  offrande: { key: 'offrande', fr: 'Offrande' },
  mission: { key: 'mission', fr: 'Mission' },
  batiment: { key: 'batiment', fr: 'Bâtiment' },
  special: { key: 'special', fr: 'Programmes spéciaux' },
  autre: { key: 'autre', fr: 'Autre' },
};

export const CATEGORY_ORDER: DonationCategory[] = [
  'dime',
  'offrande',
  'mission',
  'batiment',
  'special',
  'autre',
];

export const categoryLabel = (key: string) =>
  CATEGORIES[key as DonationCategory]?.fr ?? key;

/**
 * i18n key suffix for a donation category (looked up under `categories.*`),
 * or the raw value if it is not a known category (data passthrough).
 */
export const categoryKey = (key: string): string =>
  CATEGORIES[key as DonationCategory] ? `categories.${key}` : key;
