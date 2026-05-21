import React, { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Pressable } from 'react-native';
import { colors, radii } from '../theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'paper' | 'paper2' | 'tinted';
}

export default function Card({ children, style, onPress, variant = 'paper' }: Props) {
  const bg =
    variant === 'paper2'
      ? colors.paper2
      : variant === 'tinted'
      ? colors.mossTint
      : colors.paper;

  const content = (
    <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.mossTint }}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
    shadowColor: 'rgba(42,38,32,1)',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 2,
    overflow: 'hidden',
  },
});
