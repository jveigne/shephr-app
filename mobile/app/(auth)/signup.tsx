import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../../components/Card';
import Field from '../../components/Field';
import Label from '../../components/Label';
import Button from '../../components/Button';
import Wordmark from '../../components/Wordmark';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { notify } from '../../utils/dialogs';
import i18n from '../../utils/i18n/i18n';
import { flagEmoji, sortedDialCountries, type DialCountry } from '../../constants/dialCodes';
import type { MeResponse } from '../../services/authApi';

/**
 * Inscription — écran unique : identité, email, téléphone (RG-ID-04/05), mot de passe confirmé.
 * Le compte créé n'est rattaché à rien → on enchaîne sur `/join` (rattachement à une assemblée),
 * qui fait partie intégrante de l'inscription.
 *
 * Identifiant déjà pris : on NE quitte PAS l'écran. Le mot de passe saisi est probablement celui
 * du compte existant → on tente la connexion en silence ; si elle échoue, on redemande le mot de
 * passe sur place. On n'émet jamais de session sur la seule existence de l'identifiant.
 *
 * Le champ s'affiche « Email » mais part dans `identifier` : depuis la séparation des identités
 * par application (JP 30/07), Shephr a son propre espace de noms — s'inscrire ici n'entre jamais
 * en collision avec un compte d'une autre application.
 */
type Mode = 'form' | 'existing';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { register, login } = useAuth();
  const { t } = useLanguage();

  const [mode, setMode] = useState<Mode>('form');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<DialCountry | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ''), [phone]);

  // Téléphone FACULTATIF à l'inscription libre (retour Apple, JP 14/08) : le champ reste affiché
  // et rien n'indique qu'il est optionnel — mais il ne bloque plus la création du compte. S'il est
  // renseigné, il reste validé comme avant (indicatif + au moins 6 chiffres), en erreur de FORMAT.
  const phoneProvided = phoneDigits.length > 0;
  const phoneTooShort = phoneProvided && phoneDigits.length < 6;
  const countryMissing = phoneProvided && country == null;

  const formValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes('@') &&
    !phoneTooShort &&
    !countryMissing &&
    password.length >= 6 &&
    confirm === password;

  /** Un compte déjà rattaché va directement à l'app ; sinon il finit son inscription. */
  const routeAfterAuth = (me: MeResponse | null) => {
    const unattached =
      !!me &&
      !me.superAdmin &&
      !me.goalRole &&
      !me.donationRole &&
      !me.goalUnitId &&
      !me.donationUnitId;
    router.replace(unattached ? '/(auth)/join' : '/(tabs)/home');
  };

  const submit = async () => {
    if (!formValid) return;
    setLoading(true);
    setPhoneTaken(false);
    try {
      await register({
        identifier: email.trim(),
        password,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        // Numéro vide ⇒ on n'envoie pas non plus l'indicatif : un indicatif orphelin fausserait
        // l'unicité (indicatif, numéro) le jour où l'utilisateur renseignera son téléphone.
        phoneNumber: phoneProvided ? phone.trim() : undefined,
        countryCode: phoneProvided ? country?.dial : undefined,
      });
      // Compte neuf : aucun rattachement possible → rattachement à une assemblée.
      router.replace('/(auth)/join');
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'USERNAME_ALREADY_EXISTS') {
        try {
          routeAfterAuth(await login({ identifier: email.trim(), password }));
          return;
        } catch {
          // Mot de passe différent de celui du compte existant : on le redemande, en place.
          setMode('existing');
          setPassword('');
          setConfirm('');
        }
      } else if (code === 'PHONE_ALREADY_EXISTS') {
        setPhoneTaken(true);
      } else {
        notify(
          t('signup.signupFailedTitle'),
          e?.response ? e?.response?.data?.message ?? t('errors.tryAgain') : t('errors.serverUnreachable'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const submitExisting = async () => {
    if (password.length < 6) return;
    setLoading(true);
    try {
      routeAfterAuth(await login({ identifier: email.trim(), password }));
    } catch (e: any) {
      notify(
        t('auth.loginFailedTitle'),
        e?.response ? e?.response?.data?.message ?? t('auth.invalidCredentials') : t('errors.serverUnreachable'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Hills />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => (mode === 'existing' ? setMode('form') : router.back())}
              style={styles.iconBtn}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color={colors.mossDeep} />
            </Pressable>
            <Wordmark size={22} />
          </View>

          <Text style={styles.title}>
            {mode === 'form' ? t('signup.title1') : t('signup.existingTitle')}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'form' ? t('signup.step1Hint') : t('signup.existingHint')}
          </Text>

          {mode === 'form' ? (
            <View style={{ gap: 14, marginTop: 22 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 6 }}>{t('signup.firstName')}</Label>
                  <Field
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder={t('signup.firstNamePlaceholder')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 6 }}>{t('signup.lastName')}</Label>
                  <Field
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder={t('signup.lastNamePlaceholder')}
                  />
                </View>
              </View>

              <View>
                <Label style={{ marginBottom: 6 }}>{t('auth.email')}</Label>
                <Field
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder={t('auth.emailPlaceholder')}
                />
              </View>

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
                      onChangeText={(v) => {
                        setPhone(v);
                        setPhoneTaken(false);
                      }}
                      placeholder={t('activate.phonePlaceholder')}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                {country && (
                  <Text style={styles.countryName}>
                    {flagEmoji(country.iso)}{' '}
                    {i18n.language?.startsWith('en') ? country.nameEn : country.name} · {country.dial}
                  </Text>
                )}
                {countryMissing && <Text style={styles.errText}>{t('activate.countryRequired')}</Text>}
                {phoneTooShort && <Text style={styles.errText}>{t('signup.phoneInvalid')}</Text>}
                {phoneTaken && <Text style={styles.errText}>{t('signup.phoneTaken')}</Text>}
              </View>

              <View>
                <Label style={{ marginBottom: 6 }}>{t('auth.password')}</Label>
                <Field
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder={t('auth.passwordPlaceholder')}
                />
              </View>

              <View>
                <Label style={{ marginBottom: 6 }}>{t('activate.confirmPassword')}</Label>
                <Field
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  placeholder={t('activate.confirmPasswordPlaceholder')}
                />
                {confirm.length > 0 && confirm !== password && (
                  <Text style={styles.errText}>{t('activate.passwordsMismatch')}</Text>
                )}
              </View>

              <Button
                label={t('signup.continue')}
                onPress={submit}
                fullWidth
                disabled={!formValid}
                loading={loading}
                height={56}
                iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
              />
            </View>
          ) : (
            <View style={{ gap: 14, marginTop: 22 }}>
              <Card style={styles.emailCard}>
                <Ionicons name="mail-outline" size={18} color={colors.mossDeep} />
                <Text style={styles.emailCardText} numberOfLines={1}>
                  {email.trim()}
                </Text>
              </Card>

              <View>
                <Label style={{ marginBottom: 6 }}>{t('auth.password')}</Label>
                <Field
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder={t('auth.passwordPlaceholder')}
                />
              </View>

              <Button
                label={t('auth.signIn')}
                onPress={submitExisting}
                fullWidth
                disabled={password.length < 6}
                loading={loading}
                height={56}
                iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
              />

              <Pressable onPress={() => setMode('form')} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={styles.cancelLink}>{t('signup.useAnotherEmail')}</Text>
              </Pressable>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomHint}>{t('auth.alreadyAccount')}</Text>
            <Text onPress={() => router.replace('/(auth)/login')} style={styles.bottomLink}>
              {t('auth.signIn')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPickerModal
        open={countryOpen}
        onClose={() => setCountryOpen(false)}
        onPick={(c) => {
          setCountry(c);
          setCountryOpen(false);
        }}
      />
    </View>
  );
}

/** Sélecteur de pays (indicatif) — même référentiel que l'activation. */
function CountryPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: DialCountry) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const lang = i18n.language?.startsWith('en') ? ('en' as const) : ('fr' as const);
  const q = query.trim().toLowerCase();
  const countries = sortedDialCountries(lang).filter(
    (c) =>
      q.length === 0 ||
      c.name.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.dial.includes(q),
  );

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
              <Pressable
                key={c.iso}
                onPress={() => {
                  onPick(c);
                  setQuery('');
                }}
                style={styles.pickerRow}
              >
                <Text style={styles.pickerFlag}>{flagEmoji(c.iso)}</Text>
                <Text style={styles.pickerName} numberOfLines={1}>
                  {lang === 'en' ? c.nameEn : c.name}
                </Text>
                <Text style={styles.pickerDial}>{c.dial}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => {
              onClose();
              setQuery('');
            }}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

function Hills() {
  return (
    <Svg
      viewBox="0 0 402 240"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFillObject, { opacity: 0.65 }] as any}
    >
      <Path
        d="M-10,130 C 80,80 160,180 240,130 S 380,80 420,120 L 420,250 L -10,250 Z"
        fill="#1E3A2F"
        opacity={0.14}
      />
      <Circle cx="320" cy="80" r="34" fill="#C9956B" opacity={0.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.mossDeep,
    marginTop: 18,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink2,
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    backgroundColor: colors.paper,
    height: 52,
  },
  countryButtonText: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink },
  countryName: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 6 },
  errText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.clay,
    marginTop: 6,
  },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(30,58,47,0.06)',
    borderColor: 'rgba(30,58,47,0.15)',
  },
  emailCardText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink3, fontWeight: '600' },
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
    paddingVertical: 8,
    backgroundColor: colors.paper,
  },
  pickerSearchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  pickerFlag: { fontSize: 18 },
  pickerName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2 },
  pickerDial: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink3 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  bottomHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  bottomLink: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.moss,
  },
});
