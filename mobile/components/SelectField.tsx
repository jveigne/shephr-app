import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Field from '@/components/Field';
import Label from '@/components/Label';
import { fonts, transparence } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
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
  inline,
}: {
  label: string;
  options: T[];
  pick: T | null;
  onChange: (p: T) => void;
  disabled?: boolean;
  /**
   * Déroule la liste SOUS le champ au lieu d'ouvrir une modale (JP 16/08).
   *
   * <p>Obligatoire quand ce composant est utilisé DANS une `Modal` (formulaire de la page
   * Structure) : deux `Modal` React Native imbriquées laissent, à la fermeture, un calque
   * invisible qui avale tous les appuis — l'écran s'affiche mais ne répond plus.
   */
  inline?: boolean;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
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

  const search = options.length >= SEARCH_FROM && (
    <View style={styles.pickerSearch}>
      <Ionicons name="search" size={15} color={c.texte3} />
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={label}
        autoCapitalize="none"
        style={styles.pickerSearchInput}
      />
    </View>
  );

  const rows = (
    <ScrollView
      style={{ marginTop: 8, maxHeight: inline ? 240 : 360 }}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      {shown.length === 0 && <Text style={styles.emptyHint}>{t('join.noOption')}</Text>}
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
          {pick?.id === o.id && <Ionicons name="checkmark" size={16} color={c.accent} />}
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <View style={{ marginTop: 10 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <Pressable
        onPress={() => !disabled && options.length > 0 && setOpen((v) => (inline ? !v : true))}
        style={[styles.selectField, disabled && styles.selectFieldDisabled]}
      >
        <Text
          style={[styles.selectValue, !pick && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {pick ? pick.name : t('common.choose')}
        </Text>
        <Ionicons name={open && inline ? 'chevron-up' : 'chevron-down'} size={16} color={c.texte3} />
      </Pressable>

      {inline ? (
        open && <View style={styles.inlinePanel}>{search}{rows}</View>
      ) : (
        <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
          <View style={styles.pickerBackdrop}>
            <Card style={styles.pickerCard}>
              <Label style={{ marginBottom: 8 }}>{label}</Label>
              {search}
              {rows}
              <Pressable onPress={close} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
              </Pressable>
            </Card>
          </View>
        </Modal>
      )}
    </View>
  );
}

const useStyles = creerStyles((c) => ({
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: transparence(c.texte, 0.15),
    backgroundColor: c.surface,
  },
  selectFieldDisabled: { opacity: 0.45 },
  inlinePanel: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: transparence(c.texte, 0.12),
    backgroundColor: c.surfaceHaute,
  },
  selectValue: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: c.texte },
  selectPlaceholder: { color: c.texte3 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: c.voile,
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: { paddingHorizontal: 18, paddingVertical: 18, maxHeight: '85%' },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: transparence(c.texte, 0.15),
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: c.surface,
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
    borderBottomColor: transparence(c.texte, 0.06),
  },
  pickerName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: c.texte2 },
  pickerNameActive: { color: c.accentProfond, fontWeight: '600' },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: c.texte3, fontWeight: '600' },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: c.texte3,
    marginTop: 12,
    lineHeight: 18,
  },
}));
