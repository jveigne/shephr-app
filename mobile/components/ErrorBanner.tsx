import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Bandeau d'échec explicite — Lot T4 (14/09).
 *
 * Les écrans de trésorerie chargeaient leurs données par `Promise.allSettled` et n'affichaient
 * rien en cas de rejet : un 403 devenait un « 0 » crédible à l'écran. Un appel qui échoue se DIT,
 * avec de quoi réessayer.
 */
export default function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.clay} />
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.retry}>{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(184,106,74,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(184,106,74,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  retry: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '700', color: colors.clay },
});
