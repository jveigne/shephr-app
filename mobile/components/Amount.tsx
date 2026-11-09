import React from 'react';
import { Text, View, StyleProp, TextStyle } from 'react-native';
import { fonts } from '@/theme';
import { currencySymbol } from '@/utils/format';

import { useTheme } from '@/contexts/ThemeContext';
interface Props {
  value: number;
  currency?: string;
  size?: number;
  showDecimals?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Amount({
  value,
  currency = 'GBP',
  size = 24,
  showDecimals = false,
  color: couleurDemandee,
  style,
}: Props) {
  const { couleurs: c } = useTheme();
  const color = couleurDemandee ?? c.texte;
  const whole = Math.floor(Math.abs(value));
  const decimals = (Math.abs(value) - whole).toFixed(2).slice(1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text
        style={{
          fontFamily: fonts.serif,
          fontWeight: '500',
          fontSize: size * 0.55,
          color: c.texte3,
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
            color: c.texte3,
          }}
        >
          {decimals}
        </Text>
      )}
    </View>
  );
}
