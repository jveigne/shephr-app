import React, { ReactNode } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  View,
} from 'react-native';
import { fonts } from '@/theme';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
import { transparence, type PaletteTheme } from '@/theme';
type Variant = 'primary' | 'ghost' | 'soft' | 'danger';

interface Props {
  label?: string;
  children?: ReactNode;
  variant?: Variant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
  height?: number;
}

export default function Button({
  label,
  children,
  variant = 'primary',
  onPress,
  disabled,
  loading,
  iconLeft,
  iconRight,
  style,
  fullWidth,
  height = 54,
}: Props) {
  const styles = useStyles();
  const { couleurs: c } = useTheme();
  const palette = palettesDe(c)[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border ? 1 : 0,
          height,
          width: fullWidth ? '100%' : undefined,
          opacity: disabled ? 0.4 : pressed ? 0.92 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.inner}>
          {iconLeft}
          {label && (
            <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
          )}
          {children}
          {iconRight}
        </View>
      )}
    </Pressable>
  );
}

/** Couleurs des variantes, selon la palette du thème (docs/theme-plan.md §4.4). */
function palettesDe(c: PaletteTheme): Record<Variant, { bg: string; fg: string; border?: string }> {
  return {
    primary: { bg: c.accent, fg: c.surAccent },
    ghost: { bg: 'transparent', fg: c.accent, border: c.filetFort },
    soft: { bg: c.pageProfonde, fg: c.accentProfond },
    danger: { bg: 'transparent', fg: c.alerte, border: transparence(c.alerte, 0.3) },
  };
}

const useStyles = creerStyles((c) => ({
  base: {
    borderRadius: 18,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
}));
