import { Ionicons } from '@expo/vector-icons';

export interface GoalCategoryMeta {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}

/** Apparence des catégories du But Quinquennal, par code backend (goal_pledge_category). */
export const GOAL_CATEGORY_META: Record<string, GoalCategoryMeta> = {
  LIVRES: { icon: 'book-outline', tone: '#3D6B4A' },
  MISSIONNAIRES: { icon: 'globe-outline', tone: '#5C7CB0' },
  URGENCE: { icon: 'medkit-outline', tone: '#B86A4A' },
  HALL: { icon: 'business-outline', tone: '#8C6E54' },
  EFFECTIFS: { icon: 'people-outline', tone: '#B89A4A' },
};

export const DEFAULT_GOAL_CATEGORY_META: GoalCategoryMeta = {
  icon: 'flag-outline',
  tone: '#6E665A',
};

export function goalCategoryMeta(code: string): GoalCategoryMeta {
  return GOAL_CATEGORY_META[code] ?? DEFAULT_GOAL_CATEGORY_META;
}
