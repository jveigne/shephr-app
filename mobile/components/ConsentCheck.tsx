import React from 'react';
import { Pressable, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/theme';

/**
 * Case de consentement — RG-PAYS-12 / RG-PAYS-26 (JP 11/11) : jamais pré-cochée (RGPD), libellé complet visible.
 * Utilisée par le rattachement (`(auth)/join`), « Je n'ai pas d'assemblée » et « Je participe ».
 */
export default function ConsentCheck({
  checked,
  onChange,
  label,
  style,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={[styles.row, style]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={6}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.moss : colors.ink3} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  label: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20 },
});
