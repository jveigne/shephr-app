import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Field from './Field';
import Label from './Label';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

/** Option affichable : tout objet porteur d'un id et d'un nom. */
export interface SelectOption {
  id: string;
  name: string;
}

/**
 * Sélecteur en LISTE — parité avec le `Picker` du web : un champ qui montre la valeur choisie,
 * et une modale déroulante avec recherche dès que la liste est longue. Remplace les pastilles,
 * qui débordaient dès qu'un niveau comptait plus de quelques entrées.
 */
export default function SelectField<T extends SelectOption>({
  label,
  options,
  pick,
  onChange,
  disabled,
}: {
  label: string;
  options: T[];
  pick: T | null;
  onChange: (p: T) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q.length === 0 ? options : options.filter((o) => o.name.toLowerCase().includes(q));
  const SEARCH_FROM = 8;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <Pressable
        onPress={() => !disabled && options.length > 0 && setOpen(true)}
        style={[styles.selectField, disabled && styles.selectFieldDisabled]}
      >
        <Text
          style={[styles.selectValue, !pick && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {pick ? pick.name : t('common.choose')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.ink3} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.pickerBackdrop}>
          <Card style={styles.pickerCard}>
            <Label style={{ marginBottom: 8 }}>{label}</Label>
            {options.length >= SEARCH_FROM && (
              <View style={styles.pickerSearch}>
                <Ionicons name="search" size={15} color={colors.ink3} />
                <Field
                  value={query}
                  onChangeText={setQuery}
                  placeholder={label}
                  autoCapitalize="none"
                  style={styles.pickerSearchInput}
                />
              </View>
            )}
            <ScrollView style={{ marginTop: 8, maxHeight: 360 }}>
              {shown.length === 0 && (
                <Text style={styles.emptyHint}>{t('join.noOption')}</Text>
              )}
              {shown.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => { onChange(o); close(); }}
                  style={styles.pickerRow}
                >
                  <Text
                    style={[styles.pickerName, pick?.id === o.id && styles.pickerNameActive]}
                    numberOfLines={1}
                  >
                    {o.name}
                  </Text>
                  {pick?.id === o.id && (
                    <Ionicons name="checkmark" size={16} color={colors.moss} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={close} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    backgroundColor: colors.paper,
  },
  selectFieldDisabled: { opacity: 0.45 },
  selectValue: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink },
  selectPlaceholder: { color: colors.ink3 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: { paddingHorizontal: 18, paddingVertical: 18, maxHeight: '85%' },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  pickerSearchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  pickerName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2 },
  pickerNameActive: { color: colors.mossDeep, fontWeight: '600' },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink3, fontWeight: '600' },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 12,
    lineHeight: 18,
  },
});
