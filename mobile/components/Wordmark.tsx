import React from 'react';
import { Text, View, StyleProp, TextStyle } from 'react-native';
import { colors, fonts } from '@/theme';
import { getBranding } from '@/theme/branding';
import BrandLogo from '@/components/BrandLogo';

interface Props {
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Marque de l'en-tête (connexion, inscription, rattachement). D-PAYS-01 (JP 11/11, contrat 11/11 §5.5) : pour un
 * pays actif, logo du pays (pastille blanche, repli logo Shephr) + `displayName` à la place de « shephr » ; sinon la
 * marque Shephr inchangée. Aucun nom de pays écrit en dur (recette 13).
 */
export default function Wordmark({ size = 32, color = colors.moss, style }: Props) {
  const branding = getBranding();
  if (branding.countryIso) {
    // Le nom du pays est plus long que « shephr » : police réduite, sur une ligne.
    const fontSize = Math.max(16, Math.round(size * 0.62));
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.25), flexShrink: 1 }}>
        <BrandLogo size={Math.round(size * 1.2)} />
        <Text
          numberOfLines={1}
          style={[
            { fontFamily: fonts.serif, fontSize, color, letterSpacing: -fontSize * 0.02, fontWeight: '500', flexShrink: 1 },
            style,
          ]}
        >
          {size < 26 ? branding.shortName : branding.displayName}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text
        style={[
          {
            fontFamily: fonts.serif,
            fontSize: size,
            color,
            letterSpacing: -size * 0.025,
            fontWeight: '500',
          },
          style,
        ]}
      >
        shephr
      </Text>
      <View
        style={{
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          backgroundColor: colors.earth,
          marginLeft: size * 0.12,
          marginBottom: size * 0.12,
        }}
      />
    </View>
  );
}
