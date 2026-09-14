import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import type { DeclarationStatus } from '../services/donationApi';

/**
 * Lot T7 (décision J-1, JP 14/09) — pastille de statut d'une déclaration.
 *
 * <p>DEUX états, pas davantage : « Déclaré » puis « Vérifié ». Il n'existe ni « écart » ni
 * « rejeté » — quand le montant ne correspond pas, le trésorier ne valide pas et la déclaration
 * reste « Déclaré ». N'ajouter aucune couleur d'alerte ici : elle laisserait croire à un troisième
 * état (§8b.12 de docs/donations-recette.md).
 */
export default function DeclarationStatusPill({
  status,
  size = 'md',
}: {
  status: DeclarationStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useLanguage();
  const verified = status === 'VERIFIE';
  const tone = verified ? colors.moss : colors.earthDeep;
  const small = size === 'sm';

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: tone + '16',
          borderColor: tone + '3A',
          paddingHorizontal: small ? 8 : 10,
          paddingVertical: small ? 3 : 5,
        },
      ]}
    >
      <Ionicons
        name={verified ? 'checkmark-circle' : 'time-outline'}
        size={small ? 11 : 13}
        color={tone}
      />
      <Text style={[styles.label, { color: tone, fontSize: small ? 10.5 : 11.5 }]}>
        {t(`declarations.status.${status}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 99,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
