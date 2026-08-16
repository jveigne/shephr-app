import i18n from 'i18next';

/** Objet nommé servi par l'API Goals — le backend porte les DEUX langues. */
export interface GoalNamed {
  name: string;
  nameEn?: string | null;
}

/**
 * Nom d'un But Quinquennal ou d'une de ses catégories, dans la langue de l'app.
 *
 * <p>Ces noms (« Livres », « Fonds d'urgence », « Effectifs »…) viennent de la BASE
 * (`goal_pledge_category.name` / `name_en`), pas des fichiers de traduction : `t()` ne peut donc
 * rien pour eux, et les écrans affichaient le français même en anglais alors que le backend sert
 * `nameEn` sur toutes ces réponses.
 *
 * <p>Repli sur le français si `nameEn` est vide : une catégorie ajoutée sans traduction doit rester
 * lisible plutôt que disparaître.
 *
 * <p>Jumeau de `mobile/utils/goalName.ts` — les deux surfaces doivent afficher la même chose.
 */
export function goalName(item?: GoalNamed | null, fallback = ''): string {
  if (!item) return fallback;
  const en = (i18n.language ?? '').toLowerCase().startsWith('en');
  return en && item.nameEn ? item.nameEn : item.name;
}
