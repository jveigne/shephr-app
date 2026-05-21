import React, { ReactNode } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { colors, fonts } from '../theme';

interface Props {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Label({ children, color = colors.ink3, style }: Props) {
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
