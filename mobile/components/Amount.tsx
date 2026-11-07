import React from 'react';
import { Text, View, StyleProp, TextStyle } from 'react-native';
import { colors, fonts } from '@/theme';
import { currencySymbol } from '@/utils/format';

interface Props {
  value: number;
  currency?: string;
  size?: number;
  showDecimals?: boolean;
  color?: string;
  /** Couleur du symbole et des décimales (fond sombre : carte des dons de l'accueil, JP 06/11). */
  subColor?: string;
  style?: StyleProp<TextStyle>;
}

export default function Amount({
  value,
  currency = 'GBP',
  size = 24,
  showDecimals = false,
  color = colors.ink,
  subColor = colors.ink3,
  style,
}: Props) {
  const whole = Math.floor(Math.abs(value));
  const decimals = (Math.abs(value) - whole).toFixed(2).slice(1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text
        style={{
          fontFamily: fonts.serif,
          fontWeight: '500',
          fontSize: size * 0.55,
          color: subColor,
          marginRight: size * 0.05,
        }}
      >
        {currencySymbol(currency)}
      </Text>
      <Text
        style={[
          {
            fontFamily: fonts.serif,
            fontWeight: '500',
            fontSize: size,
            color,
            letterSpacing: -size * 0.02,
          },
          style,
        ]}
      >
        {value < 0 ? '−' : ''}
        {whole.toLocaleString('en-GB')}
      </Text>
      {showDecimals && (
        <Text
          style={{
            fontFamily: fonts.serif,
            fontSize: size * 0.4,
            color: subColor,
          }}
        >
          {decimals}
        </Text>
      )}
    </View>
  );
}
