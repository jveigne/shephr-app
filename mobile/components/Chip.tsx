import React, { ReactNode } from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

interface Props {
  label: string;
  selected?: boolean;
  accent?: boolean;
  iconLeft?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Chip({ label, selected, accent, iconLeft, onPress, style }: Props) {
  const bg = selected
    ? accent
      ? colors.earth
      : colors.moss
    : 'rgba(42,38,32,0.045)';
  const fg = selected ? colors.white : colors.ink2;
  const borderColor = selected
    ? accent
      ? colors.earthDeep
      : colors.mossDeep
    : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: bg, borderColor, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {iconLeft}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
});
