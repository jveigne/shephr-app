import i18n from './i18n/i18n';

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
 * `nameEn` sur toutes ces réponses. Il n'y avait qu'à le lire.
 *
 * <p>Fonction et non hook : elle se lit dans des formateurs et des callbacks. Le rendu reste juste
 * au changement de langue — tous les écrans concernés consomment `useLanguage()` pour leurs
 * libellés, ils re-rendent donc et rappellent cette fonction.
 *
 * <p>Repli sur le français si `nameEn` est vide : une catégorie ajoutée sans traduction doit rester
 * lisible plutôt que disparaître.
 */
export function goalName(item?: GoalNamed | null, fallback = ''): string {
  if (!item) return fallback;
  const en = (i18n.language ?? '').toLowerCase().startsWith('en');
  return en && item.nameEn ? item.nameEn : item.name;
}
