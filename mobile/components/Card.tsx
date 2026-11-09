import React, { ReactNode } from 'react';
import { View, StyleProp, ViewStyle, Pressable } from 'react-native';
import { radii, transparence } from '@/theme';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'paper' | 'paper2' | 'tinted';
}

export default function Card({ children, style, onPress, variant = 'paper' }: Props) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const bg =
    variant === 'paper2'
      ? c.surfaceHaute
      : variant === 'tinted'
      ? c.accentTeinte
      : c.surface;

  const content = (
    <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: c.accentTeinte }}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const useStyles = creerStyles((c) => ({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: transparence(c.texte, 0.07),
    shadowColor: 'rgba(42,38,32,1)',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 2,
    overflow: 'hidden',
  },
}));
