import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { getBranding } from '@/theme/branding';

/**
 * Mention fixe « propulsé par Shephr » — spec §4.5, contrat 11/11 §5.5 (JP 11/11) : en bas de l'accueil et des
 * réglages, NON configurable, seulement quand un pays est actif (en Shephr standard, le nom est déjà partout).
 */
export default function PoweredBy() {
  const { t } = useLanguage();
  if (!getBranding().countryIso) return null;
  return <Text style={styles.text}>{t('branding.poweredBy')}</Text>;
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
    marginTop: 22,
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
