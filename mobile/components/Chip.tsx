import React, { ReactNode } from 'react';
import { Pressable, Text, StyleProp, ViewStyle } from 'react-native';
import { fonts, transparence } from '@/theme';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
interface Props {
  label: string;
  selected?: boolean;
  accent?: boolean;
  iconLeft?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Chip({ label, selected, accent, iconLeft, onPress, style }: Props) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const bg = selected
    ? accent
      ? c.secondaire
      : c.accent
    : transparence(c.texte, 0.045);
  const fg = selected ? c.surAccent : c.texte2;
  const borderColor = selected
    ? accent
      ? c.secondaireProfond
      : c.accentProfond
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

const useStyles = creerStyles((c) => ({
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
}));
