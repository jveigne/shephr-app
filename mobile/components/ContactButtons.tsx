import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '@/components/Button';
import { colors } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { mailtoUrl, openContactLink, telUrl, whatsappUrl } from '@/utils/contactLinks';

/**
 * Appeler / WhatsApp / E-mail — Q7 (JP 11/11, contrat 11/11 §9.1) : relance une personne depuis sa fiche ou la
 * liste des inscrits. Un bouton sans donnée est masqué ; rien ne s'affiche s'il n'y a aucune coordonnée.
 * Aucun envoi groupé.
 */
export default function ContactButtons({
  phoneNumber,
  phoneCountryCode,
  email,
  compact,
}: {
  phoneNumber: string | null;
  phoneCountryCode: string | null;
  email: string | null;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const tel = telUrl(phoneNumber, phoneCountryCode);
  const wa = whatsappUrl(phoneNumber, phoneCountryCode);
  const mail = mailtoUrl(email);
  if (!tel && !wa && !mail) return null;
  const height = compact ? 38 : 44;
  return (
    <View style={styles.row}>
      {!!tel && (
        <Button
          label={t('followUps.call')}
          variant="soft"
          height={height}
          style={styles.btn}
          onPress={() => openContactLink(tel)}
          iconLeft={<Ionicons name="call-outline" size={16} color={colors.mossDeep} />}
        />
      )}
      {!!wa && (
        <Button
          label={t('followUps.whatsapp')}
          variant="soft"
          height={height}
          style={styles.btn}
          onPress={() => openContactLink(wa)}
          iconLeft={<Ionicons name="logo-whatsapp" size={16} color={colors.mossDeep} />}
        />
      )}
      {!!mail && (
        <Button
          label={t('followUps.email')}
          variant="ghost"
          height={height}
          style={styles.btn}
          onPress={() => openContactLink(mail)}
          iconLeft={<Ionicons name="mail-outline" size={16} color={colors.moss} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { paddingHorizontal: 14, flexGrow: 1 },
});
