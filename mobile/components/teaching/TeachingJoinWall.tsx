import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';

/** 403 `TEACHING_JOIN_REQUIRED` (D-FIN-02, JP 06/11) : l'enseignement est pour les comptes rattachés → parcours `/join` existant. */
export default function TeachingJoinWall() {
  const { t } = useLanguage();
  return (
    <Card style={styles.card}>
      <Ionicons name="home-outline" size={26} color={colors.moss} />
      <Text style={styles.text}>{t('teaching.errors.joinRequired')}</Text>
      <Button label={t('dashboard.joinTitle')} height={46} onPress={() => router.push('/(auth)/join')} fullWidth />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20, paddingHorizontal: 18, paddingVertical: 20, alignItems: 'center', gap: 12 },
  text: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center' },
});
