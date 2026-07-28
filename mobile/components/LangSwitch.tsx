import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

const LANGS = ['fr', 'en'] as const;

/**
 * Sélecteur FR/EN compact pour les écrans accessibles sans connexion
 * (la préférence du compte n'est appliquée qu'après authentification).
 */
export default function LangSwitch({ style }: { style?: StyleProp<ViewStyle> }) {
  const { language, setLanguage, t } = useLanguage();
  const current = language?.startsWith('en') ? 'en' : 'fr';

  return (
    <View style={[styles.group, style]} accessibilityRole="radiogroup" accessibilityLabel={t('profile.language')}>
      {LANGS.map((l) => {
        const active = current === l;
        return (
          <Pressable
            key={l}
            onPress={() => setLanguage(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            hitSlop={6}
            style={[styles.item, active && styles.itemActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{l.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.hairStrong,
    borderRadius: 999,
    overflow: 'hidden',
  },
  item: { paddingHorizontal: 12, paddingVertical: 5 },
  itemActive: { backgroundColor: colors.moss },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
  },
  labelActive: { color: colors.white },
});
