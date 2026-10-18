import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { Redirect, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Field from '@/components/Field';
import Label from '@/components/Label';
import Button from '@/components/Button';
import Wordmark from '@/components/Wordmark';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { goBack } from '@/utils/navigation';
import { requestPasswordReset } from '@/services/passwordResetApi';
import {
  classifyPasswordResetError,
  passwordResetErrorMessage,
} from '@/utils/passwordResetErrors';

/**
 * Mot de passe oublié, écran 1 (plan `mot-de-passe-oublie-plan.md` §6 A2, 18/10/2026) :
 * l'adresse e-mail → `POST /api/auth/password/forgot` (`fromApp = SHEPHR`, langue de l'appli).
 *
 * Le champ s'affiche « Adresse e-mail » mais part dans `identifier` : c'est le username Shephr,
 * en pratique une adresse (JP 30/07). Il arrive prérempli avec ce qui a été saisi sur l'écran de
 * connexion.
 *
 * La réponse est TOUJOURS 202, compte existant ou non : on passe donc à l'écran 2 sans rien en
 * conclure. Jamais de « compte introuvable ».
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { ready, isAuthenticated } = useAuth();
  const focused = useIsFocused();
  const { t, language } = useLanguage();
  const params = useLocalSearchParams<{ identifier?: string }>();

  const [email, setEmail] = useState(typeof params.identifier === 'string' ? params.identifier : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identifier = email.trim();
  const valid = identifier.length > 0 && identifier.includes('@');

  // Parcours réservé aux personnes non connectées : une session ouverte n'a rien à faire ici.
  // Seulement quand l'écran est AFFICHÉ : il reste monté sous l'écran 2, et la session que celui-ci
  // ouvre après un code valide déclenchait ici une redirection concurrente de la sienne
  // (dismissAll + routeAfterLogin), d'où « Une erreur est survenue » après un reset réussi.
  if (focused && ready && isAuthenticated) return <Redirect href="/(tabs)/home" />;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestPasswordReset(identifier, language);
      router.push({
        pathname: '/(auth)/reset-password',
        params: {
          identifier,
          resendAfter: String(res.resendAfterSeconds),
          validity: String(res.codeValidityMinutes),
        },
      });
    } catch (e) {
      setError(passwordResetErrorMessage(classifyPasswordResetError(e), t));
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
              onPress={() => goBack('/(auth)/login')}
              style={styles.iconBtn}
              hitSlop={10}
              accessibilityLabel={t('common.back')}
            >
              <Ionicons name="chevron-back" size={22} color={colors.mossDeep} />
            </Pressable>
            <Wordmark size={22} />
          </View>

          <Text style={styles.title}>{t('passwordReset.forgotTitle')}</Text>
          <Text style={styles.subtitle}>{t('passwordReset.forgotHint')}</Text>

          <View style={{ gap: 14, marginTop: 22 }}>
            <View>
              <Label style={{ marginBottom: 6 }}>{t('passwordReset.emailLabel')}</Label>
              <Field
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                returnKeyType="send"
                onSubmitEditing={submit}
              />
              {error && <Text style={styles.errText}>{error}</Text>}
            </View>

            <Button
              label={t('passwordReset.sendCode')}
              onPress={submit}
              fullWidth
              disabled={!valid}
              loading={loading}
              height={56}
              iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
            />
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomHint}>{t('passwordReset.rememberPassword')}</Text>
            <Text onPress={() => goBack('/(auth)/login')} style={styles.bottomLink}>
              {t('auth.signIn')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Même décor que l'inscription. */
function Hills() {
  return (
    <Svg
      viewBox="0 0 402 240"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { opacity: 0.65 }] as any}
    >
      <Path
        d="M-10,130 C 80,80 160,180 240,130 S 380,80 420,120 L 420,250 L -10,250 Z"
        fill={colors.moss}
        opacity={0.14}
      />
      <Circle cx="320" cy="80" r="34" fill={colors.earth} opacity={0.4} />
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
  errText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.clay,
    marginTop: 6,
  },
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
