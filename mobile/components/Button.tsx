import React, { ReactNode } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  View,
} from 'react-native';
import { colors, fonts } from '../theme';

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
  const palette = PALETTES[variant];

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

const PALETTES: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.moss, fg: colors.white },
  ghost: { bg: 'transparent', fg: colors.moss, border: colors.hairStrong },
  soft: { bg: colors.parchmentDeep, fg: colors.mossDeep },
  danger: { bg: 'transparent', fg: colors.clay, border: 'rgba(184,106,74,0.3)' },
};

const styles = StyleSheet.create({
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
});
