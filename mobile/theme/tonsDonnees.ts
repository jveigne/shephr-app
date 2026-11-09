import { ajusterPourContraste, SEUIL_GRAPHIQUE } from '@/theme/couleurs';
import type { ModeResolu, PaletteTheme } from '@/theme/palettes';

/**
 * Couleurs de DONNÉES (catégories de don et d'objectif, statuts), selon le thème actif
 * (docs/theme-plan.md, D8).
 *
 * <p>Ces tons sont fixes et se lisent dans les tables de `constants/` et `utils/`, appelées hors
 * de tout composant. Plutôt que de faire passer la palette à chaque appel (16 écrans), le
 * `ThemeProvider` déclare ici le thème résolu à chaque rendu, avant ses enfants :
 * - Clair : le ton est rendu tel quel, l'existant ne bouge pas ;
 * - Sombre : il est éclairci jusqu'à 3:1 contre les surfaces, la teinte est gardée ;
 * - Noir et blanc : il passe en gris, ce sont les libellés et les icônes qui distinguent.
 * L'alerte n'en dépend pas : elle reste rouge partout.
 */
export const GRIS_DONNEE = '#666666';

let modeCourant: ModeResolu = 'clair';
let fondsCourants: string[] = [];

export function declarerThemeDonnees(mode: ModeResolu, palette: PaletteTheme): void {
  modeCourant = mode;
  fondsCourants = [palette.surface, palette.page];
}

export function tonDonnee(ton: string): string {
  if (modeCourant === 'noirEtBlanc') return GRIS_DONNEE;
  if (modeCourant === 'sombre') return ajusterPourContraste(ton, fondsCourants, SEUIL_GRAPHIQUE);
  return ton;
}
