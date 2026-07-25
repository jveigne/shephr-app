import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Modal, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Wordmark from '../../components/Wordmark';
import Card from '../../components/Card';
import Field from '../../components/Field';
import Label from '../../components/Label';
import Button from '../../components/Button';
import { colors, fonts } from '../../theme';
import { notify } from '../../utils/dialogs';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import i18n from '../../utils/i18n/i18n';
import { flagEmoji, sortedDialCountries, type DialCountry } from '../../constants/dialCodes';
import {
  acceptInvitationByCode,
  previewInvitationByCode,
  type InvitationPreview,
} from '../../services/authApi';

/** Activation par CODE COURT (Lot 3.4, UC-TRV-10) : un dirigeant invité saisit son code. */
export default function ActivateScreen() {
  const insets = useSafeAreaInsets();
  const { establishSession } = useAuth();
  const { t } = useLanguage();

  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // A1 (RG-ID-04) : téléphone OBLIGATOIRE — le PAYS choisi porte l'indicatif (décision JP 23/07).
  const [country, setCountry] = useState<DialCountry | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const errMsg = (e: any, fallback: string) =>
    e?.response ? e.response.data?.message ?? fallback
      : t('activate.serverUnreachable');

  const onCheckCode = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      notify(t('common.appName'), t('activate.codeMinLength'));
      return;
    }
    setLoading(true);
    try {
      setPreview(await previewInvitationByCode(c));
    } catch (e: any) {
      notify(t('activate.invalidCodeTitle'), errMsg(e, t('activate.invalidCodeBody')));
    } finally {
      setLoading(false);
    }
  };

  const onActivate = async () => {
    if (!country) {
      notify(t('common.appName'), t('activate.countryRequired'));
      return;
    }
    if (phone.trim().replace(/\D/g, '').length < 6) {
      notify(t('common.appName'), t('activate.phoneRequired'));
      return;
    }
    const mail = email.trim();
    if (mail.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      notify(t('common.appName'), t('activate.emailInvalid'));
      return;
    }
    if (password.length < 8) {
      notify(t('common.appName'), t('activate.passwordMinLength'));
      return;
    }
    if (password !== confirm) {
      notify(t('common.appName'), t('activate.passwordsMismatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await acceptInvitationByCode(code.trim().toUpperCase(), password, {
        phoneNumber: phone.trim(),
        countryCode: country.dial,
        email: mail || undefined,
      });
      await establishSession(res);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      notify(t('activate.activationFailedTitle'), errMsg(e, t('activate.activationFailedBody')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Wordmark size={40} color={colors.mossDeep} />
          <View style={{ flex: 1, minHeight: 40 }} />

          <Card style={styles.card}>
            <Label style={{ marginBottom: 6 }}>{t('activate.kicker')}</Label>
            <Text style={styles.heading}>{t('activate.title')}</Text>

            {preview == null ? (
              <>
                <Label style={{ marginBottom: 6 }}>{t('activate.yourCode')}</Label>
                <Field
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder={t('activate.codePlaceholder')}
                />
                <Button
                  label={t('activate.checkCode')}
                  onPress={onCheckCode}
                  loading={loading}
                  fullWidth
                  style={{ marginTop: 18 }}
                  iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
                />
              </>
            ) : (
              <>
                <Card variant="tinted" style={styles.previewCard}>
                  <Text style={styles.previewName}>{preview.fullName}</Text>
                  <Text style={styles.previewMeta}>{preview.email ?? preview.username}</Text>
                  {preview.ministryName && (
                    <Text style={styles.previewMeta}>{preview.ministryName}</Text>
                  )}
                </Card>
                <View style={{ gap: 12, marginTop: 14 }}>
                  <View>
                    <Label style={{ marginBottom: 6 }}>{t('activate.phoneLabel')}</Label>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => setCountryOpen(true)} style={styles.countryButton}>
                        <Text style={styles.countryButtonText}>
                          {country ? `${flagEmoji(country.iso)} ${country.dial}` : t('activate.countryPlaceholder')}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={colors.ink3} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Field
                          value={phone}
                          onChangeText={setPhone}
                          placeholder={t('activate.phonePlaceholder')}
                          keyboardType="phone-pad"
                        />
                      </View>
                    </View>
                    {country && (
                      <Text style={styles.countryName}>
                        {flagEmoji(country.iso)} {i18n.language?.startsWith('en') ? country.nameEn : country.name} · {country.dial}
                      </Text>
                    )}
                  </View>
                  <View>
                    <Label style={{ marginBottom: 6 }}>{t('activate.emailOptional')}</Label>
                    <Field
                      value={email}
                      onChangeText={setEmail}
                      placeholder={t('activate.emailPlaceholder')}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                    />
                  </View>
                  <View>
                    <Label style={{ marginBottom: 6 }}>{t('activate.choosePassword')}</Label>
                    <Field value={password} onChangeText={setPassword} secureTextEntry placeholder={t('activate.passwordPlaceholder')} />
                  </View>
                  <View>
                    <Label style={{ marginBottom: 6 }}>{t('activate.confirmPassword')}</Label>
                    <Field value={confirm} onChangeText={setConfirm} secureTextEntry placeholder={t('activate.confirmPasswordPlaceholder')} />
                  </View>
                </View>
                <Button
                  label={t('activate.activateAccount')}
                  onPress={onActivate}
                  loading={loading}
                  fullWidth
                  style={{ marginTop: 18 }}
                  iconRight={<Ionicons name="checkmark" size={18} color={colors.white} />}
                />
                <Text style={styles.changeCode} onPress={() => { setPreview(null); setPassword(''); setConfirm(''); setPhone(''); setCountry(null); setEmail(''); }}>
                  {t('activate.notYou')}
                </Text>
              </>
            )}

            <View style={styles.divider} />
            <View style={styles.backRow}>
              <Text style={styles.backLink} onPress={() => router.replace('/(auth)/login')}>
                <Ionicons name="arrow-back" size={14} color={colors.moss} /> {t('activate.backToLogin')}
              </Text>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPickerModal
        open={countryOpen}
        onClose={() => setCountryOpen(false)}
        onPick={(c) => { setCountry(c); setCountryOpen(false); }}
      />
    </View>
  );
}

/** Sélecteur de pays (A1) : recherche + liste drapeau · nom · indicatif. */
function CountryPickerModal({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: DialCountry) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const lang = i18n.language?.startsWith('en') ? 'en' as const : 'fr' as const;
  const q = query.trim().toLowerCase();
  const countries = sortedDialCountries(lang).filter((c) =>
    q.length === 0
    || c.name.toLowerCase().includes(q)
    || c.nameEn.toLowerCase().includes(q)
    || c.dial.includes(q));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <Card style={styles.pickerCard}>
          <Label style={{ marginBottom: 8 }}>{t('activate.countryLabel')}</Label>
          <View style={styles.pickerSearch}>
            <Ionicons name="search" size={15} color={colors.ink3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.pickerSearchInput}
              placeholder={t('activate.countrySearchPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
            />
          </View>
          <ScrollView style={{ marginTop: 8, maxHeight: 380 }}>
            {countries.map((c) => (
              <Pressable key={c.iso} onPress={() => { onPick(c); setQuery(''); }} style={styles.pickerRow}>
                <Text style={styles.pickerFlag}>{flagEmoji(c.iso)}</Text>
                <Text style={styles.pickerName} numberOfLines={1}>
                  {lang === 'en' ? c.nameEn : c.name}
                </Text>
                <Text style={styles.pickerDial}>{c.dial}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => { onClose(); setQuery(''); }} style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={styles.pickerCancel}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
  countryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)', backgroundColor: colors.paper, height: 52,
  },
  countryButtonText: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink },
  countryName: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 6 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.45)', justifyContent: 'center', padding: 20 },
  pickerCard: { paddingHorizontal: 18, paddingVertical: 18, maxHeight: '85%' },
  pickerSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper,
  },
  pickerSearchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  pickerFlag: { fontSize: 18 },
  pickerName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2 },
  pickerDial: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink3 },
  pickerCancel: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink3, fontWeight: '600' },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  card: { paddingHorizontal: 20, paddingVertical: 22 },
  heading: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, marginBottom: 18, letterSpacing: -0.3 },
  previewCard: { paddingHorizontal: 16, paddingVertical: 14 },
  previewName: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  previewMeta: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 2 },
  changeCode: { textAlign: 'center', marginTop: 14, fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  divider: { height: 1, backgroundColor: 'rgba(42,38,32,0.08)', marginTop: 18 },
  backRow: { flexDirection: 'row', justifyContent: 'center', paddingTop: 16 },
  backLink: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
});
