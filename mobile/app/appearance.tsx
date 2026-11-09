/**
 * Écran Apparence (`docs/theme-plan.md` §4.2, étape M2) : l'utilisateur compose son thème.
 *
 * <p>Deux choix, et rien de plus : le MODE (Automatique, Clair, Sombre, Noir et blanc) et la
 * COULEUR D'ACCENT (une pastille proposée ou un hex libre). Fond, texte et filets ne se
 * choisissent pas : ils découlent du mode, c'est ce qui garantit que l'app reste lisible.
 * L'accent ne remplace que la famille verte ; la terre reste la couleur secondaire (D2, B4).
 *
 * <p>On y vient du Profil, donc connecté (D4, décision B2 de JP : aucun sélecteur sur les pages
 * publiques). Tout s'applique en direct, sans bouton « Enregistrer ». À l'étape M5, chaque
 * changement fait ici sera aussi envoyé au compte (seul point qui envoie un `PUT`, D4).
 *
 * <p>L'écran est stylé par le thème (`creerStyles`) dès M2, pour qu'on voie le choix
 * s'appliquer ; les autres écrans suivent aux étapes M3 et M4.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBack } from '@/utils/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { creerStyles } from '@/theme/creerStyles';
import { estHexValide, normaliserHex } from '@/theme/couleurs';
import { ACCENTS_PREDEFINIS, type ModeTheme } from '@/theme/palettes';
import { fonts, radii } from '@/theme';

const MODES: { mode: ModeTheme; icone: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { mode: 'auto', icone: 'phone-portrait-outline' },
  { mode: 'clair', icone: 'sunny-outline' },
  { mode: 'sombre', icone: 'moon-outline' },
  { mode: 'noirEtBlanc', icone: 'contrast-outline' },
];

export default function AppearanceScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { couleurs: c, mode, modeResolu, accent, setMode, setAccent } = useTheme();
  const styles = useStyles();

  const predefini = ACCENTS_PREDEFINIS.some((a) => normaliserHex(a.valeur) === accent);
  const [saisie, setSaisie] = useState(predefini ? '' : accent);
  const saisieValide = estHexValide(saisie);
  const accentIgnore = modeResolu === 'noirEtBlanc';

  return (
    <View style={styles.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contenu, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
      >
        <Pressable
          onPress={() => goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.retour}
        >
          <Ionicons name="chevron-back" size={24} color={c.accent} />
        </Pressable>

        <Text style={styles.titre}>{t('appearance.title')}</Text>
        <Text style={styles.intro}>{t('appearance.intro')}</Text>

        {/* ---- Mode ---- */}
        <Text style={styles.section}>{t('appearance.modeSection')}</Text>
        <View style={styles.carte}>
          {MODES.map(({ mode: m, icone }, rang) => {
            const actif = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.ligne, rang > 0 && styles.ligneSuivante]}
                accessibilityRole="radio"
                accessibilityState={{ checked: actif }}
              >
                <View style={[styles.pastilleIcone, actif && styles.pastilleIconeActive]}>
                  <Ionicons name={icone} size={20} color={actif ? c.surAccent : c.accent} />
                </View>
                <View style={styles.libelle}>
                  <Text style={styles.libelleTitre}>{t(`appearance.modes.${m}`)}</Text>
                  <Text style={styles.aide}>{t(`appearance.modes.${m}Help`)}</Text>
                </View>
                <Ionicons
                  name={actif ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={actif ? c.accent : c.texte3}
                />
              </Pressable>
            );
          })}
        </View>

        {/* ---- Accent ---- */}
        <Text style={styles.section}>{t('appearance.accentSection')}</Text>
        <View style={[styles.carte, styles.carteAccent, accentIgnore && styles.desactive]}>
          <View style={styles.pastilles}>
            {ACCENTS_PREDEFINIS.map((a) => {
              const actif = normaliserHex(a.valeur) === accent;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    setAccent(a.valeur);
                    setSaisie('');
                  }}
                  disabled={accentIgnore}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`appearance.accents.${a.id}`)}
                  accessibilityState={{ checked: actif }}
                  style={[styles.pastille, actif && styles.pastilleActive]}
                >
                  <View style={[styles.pastilleCouleur, { backgroundColor: a.valeur }]}>
                    {actif && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.libelleSaisie}>{t('appearance.customAccent')}</Text>
          <View style={styles.rangeeSaisie}>
            <View
              style={[styles.temoin, { backgroundColor: saisieValide ? normaliserHex(saisie) : c.surfaceHaute }]}
            />
            <TextInput
              value={saisie}
              onChangeText={setSaisie}
              placeholder="#1E3A2F"
              placeholderTextColor={c.texte3}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              editable={!accentIgnore}
              style={styles.champ}
            />
            <Pressable
              onPress={() => setAccent(saisie)}
              disabled={!saisieValide || accentIgnore}
              style={[styles.boutonAppliquer, (!saisieValide || accentIgnore) && styles.desactive]}
              accessibilityRole="button"
            >
              <Text style={styles.boutonTexte}>{t('appearance.apply')}</Text>
            </Pressable>
          </View>
          {saisie.length > 0 && !saisieValide && (
            <Text style={styles.erreur}>{t('appearance.invalidHex')}</Text>
          )}
          <Text style={styles.aide}>
            {accentIgnore ? t('appearance.accentIgnored') : t('appearance.contrastNote')}
          </Text>
        </View>

        {/* ---- Aperçu ---- */}
        <Text style={styles.section}>{t('appearance.previewSection')}</Text>
        <View style={[styles.carte, styles.carteAccent]}>
          <View style={styles.apercuLigne}>
            <View style={styles.pastilleIcone}>
              <Ionicons name="flag-outline" size={20} color={c.accent} />
            </View>
            <View style={styles.libelle}>
              <Text style={styles.apercuTitre}>{t('appearance.previewTitle')}</Text>
              <Text style={styles.aide}>{t('appearance.previewMeta')}</Text>
            </View>
            <Text style={styles.apercuChiffre}>72 %</Text>
          </View>
          <View style={styles.apercuPiste}>
            <View style={styles.apercuJauge} />
          </View>
          <Pressable style={styles.boutonApercu} accessibilityRole="button">
            <Text style={styles.boutonTexte}>{t('appearance.previewButton')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = creerStyles((c) => ({
  page: { flex: 1, backgroundColor: c.page },
  contenu: { paddingHorizontal: 20 },
  retour: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8 },
  titre: { fontFamily: fonts.serif, fontSize: 26, color: c.texte, marginTop: 8 },
  intro: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: c.texte2, marginTop: 8 },
  section: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: c.texte3,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  carte: {
    backgroundColor: c.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.filet,
    paddingHorizontal: 18,
  },
  carteAccent: { paddingVertical: 16 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  ligneSuivante: { borderTopWidth: 1, borderTopColor: c.filet },
  libelle: { flex: 1 },
  libelleTitre: { fontFamily: fonts.sans, fontSize: 14.5, color: c.texte },
  aide: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: c.texte3, marginTop: 2 },
  pastilleIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentTeinte2,
  },
  pastilleIconeActive: { backgroundColor: c.accent },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pastille: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  pastilleActive: { borderColor: c.texte },
  pastilleCouleur: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  libelleSaisie: { fontFamily: fonts.sans, fontSize: 13, color: c.texte2, marginTop: 18, marginBottom: 8 },
  rangeeSaisie: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  temoin: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: c.filetFort },
  champ: {
    flex: 1,
    // Sans `minWidth: 0`, le champ garde sa largeur intrinsèque sur Expo web et pousse le bouton
    // « Appliquer » hors de la carte (constaté sur CMFIPraise).
    minWidth: 0,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: c.filetFort,
    backgroundColor: c.surfaceHaute,
    color: c.texte,
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  boutonAppliquer: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
  boutonTexte: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: c.surAccent },
  desactive: { opacity: 0.45 },
  erreur: { fontFamily: fonts.sans, fontSize: 12.5, color: c.alerte, marginTop: 6 },
  apercuLigne: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  apercuTitre: { fontFamily: fonts.serif, fontSize: 17, color: c.texte },
  apercuChiffre: { fontFamily: fonts.serif, fontSize: 20, color: c.accent },
  apercuPiste: { height: 6, borderRadius: 3, backgroundColor: c.accentTeinte2, marginTop: 14, overflow: 'hidden' },
  apercuJauge: { width: '72%', height: 6, borderRadius: 3, backgroundColor: c.secondaire },
  boutonApercu: {
    marginTop: 16,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
}));
