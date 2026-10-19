import React from 'react';
import { View, StyleSheet } from 'react-native';
import Label from '@/components/Label';
import Field from '@/components/Field';
import { useLanguage } from '@/contexts/LanguageContext';
import { PREACHER_MAX } from '@/utils/events';

/**
 * D-EVT-16 (JP 14/10) — saisie du prédicateur, partagée par la déclaration (`app/events/declare`),
 * la programmation / modification (`EventForm`) et « Marquer comme réalisé » (`app/events/[id]`).
 * Facultative mais mise en valeur : placée juste après le type et la date. Rien pour un type non
 * évangélique, comme les compteurs D-EVT-15 ; le drapeau `evangelism` vient du catalogue mis en
 * cache, la décision tient donc hors ligne. Changer de type ne vide pas la saisie : seuls les envois
 * d'un type évangélique la portent (`filledPreacher` / `replacedPreacher` / `closingPreacher`).
 */
export default function EventPreacherField({
  value,
  onChange,
  evangelism,
}: {
  value: string;
  onChange: (next: string) => void;
  evangelism: boolean;
}) {
  const { t } = useLanguage();
  if (!evangelism) return null;
  return (
    <View style={styles.section}>
      <Label style={styles.label}>{t('events.declare.preacher')}</Label>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder={t('events.declare.preacherPlaceholder')}
        maxLength={PREACHER_MAX}
        autoCapitalize="words"
        accessibilityLabel={t('events.declare.preacher')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  label: { marginBottom: 8 },
});
