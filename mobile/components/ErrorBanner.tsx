import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, transparence } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle-outline" size={18} color={c.alerte} />
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.retry}>{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = creerStyles((c) => ({
  banner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: transparence(c.alerte, 0.10),
    borderWidth: 1,
    borderColor: transparence(c.alerte, 0.28),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: c.texte2, lineHeight: 18 },
  retry: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '700', color: c.alerte },
}));
