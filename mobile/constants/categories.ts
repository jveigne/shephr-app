import { Ionicons } from '@expo/vector-icons';

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
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}

export const CATEGORIES: Record<DonationCategory, CategoryMeta> = {
  dime: { key: 'dime', fr: 'Dîme', icon: 'leaf-outline', tone: '#3D6B4A' },
  offrande: { key: 'offrande', fr: 'Offrande', icon: 'gift-outline', tone: '#A7754B' },
  mission: { key: 'mission', fr: 'Mission', icon: 'globe-outline', tone: '#5C7CB0' },
  batiment: { key: 'batiment', fr: 'Bâtiment', icon: 'business-outline', tone: '#8C6E54' },
  special: { key: 'special', fr: 'Programmes spéciaux', icon: 'star-outline', tone: '#B89A4A' },
  autre: { key: 'autre', fr: 'Autre', icon: 'ellipsis-horizontal', tone: '#6E665A' },
};

export const CATEGORY_ORDER: DonationCategory[] = [
  'dime',
  'offrande',
  'mission',
  'batiment',
  'special',
  'autre',
];
