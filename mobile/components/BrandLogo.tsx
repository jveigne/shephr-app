import React from 'react';
import { Image, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';
import { getBranding } from '@/theme/branding';

// Logo Shephr de repli (recette 8 : pays actif sans logo intégré → logo Shephr aux couleurs du pays).
const SHEPHR_LOGO = require('@/assets/logo-512.png');

/**
 * Logo de l'en-tête — D-PAYS-03 (JP 11/11, contrat 11/11 §5.5). Logo INTÉGRÉ du pays actif
 * (`theme/brandingLogos`), sinon logo Shephr, toujours posé dans une PASTILLE BLANCHE RONDE : le logo CMCI
 * provisoire est un JPEG à fond blanc, sans transparence (spec §4.6) — sur l'en-tête coloré, la pastille
 * évite le carré blanc. Le thème est figé pour la session (`getBranding`).
 */
export default function BrandLogo({ size = 44, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const logo = getBranding().logo ?? SHEPHR_LOGO;
  const inner = Math.round(size * 0.86);
  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={logo} style={{ width: inner, height: inner, borderRadius: inner / 2 }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    // Pastille BLANCHE quel que soit le pays (pas `colors.white`, qui est la couleur de texte sur `moss`).
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hair,
  },
});
