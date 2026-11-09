import React, { ReactNode } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { fonts } from '@/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Label({ children, color: couleurDemandee, style }: Props) {
  const { couleurs: c } = useTheme();
  const color = couleurDemandee ?? c.texte3;
  return (
    <Text
      style={[
        {
          fontFamily: fonts.sans,
          fontSize: 12,
          letterSpacing: 0.72,
          textTransform: 'uppercase',
          color,
          fontWeight: '600',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
