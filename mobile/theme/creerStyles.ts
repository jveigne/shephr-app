/**
 * Styles dépendants du thème (`docs/theme-plan.md` §4.2), porté de `cmfipraise-app`.
 *
 * <p>Un `StyleSheet.create` au niveau du module est figé au chargement : il ne peut pas
 * changer de couleur quand l'utilisateur passe en Sombre. On le remplace par
 *
 * ```ts
 * const useStyles = creerStyles((c) => ({ titre: { color: c.texte }, bouton: { backgroundColor: c.accent } }));
 * // dans le composant :
 * const styles = useStyles();
 * ```
 *
 * <p>Les styles sont recalculés une seule fois par palette (mémorisés), pas à chaque rendu.
 * Les polices (`theme/typography.ts`) n'ont pas de couleur : elles ne changent pas.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { PaletteTheme } from '@/theme/palettes';

export function creerStyles<T extends StyleSheet.NamedStyles<T>>(
  fabrique: (c: PaletteTheme) => T,
): () => T {
  return function useStyles() {
    const { couleurs } = useTheme();
    return useMemo(() => StyleSheet.create(fabrique(couleurs)), [couleurs]);
  };
}
