import React, { useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.includes('@') || password.length < 6) {
      notify(t('common.appName'), t('auth.checkEmailPassword'));
      return;
    }
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      router.replace('/(tabs)/home');
    } catch (e: any) {
      // Sans e.response, la requête n'a pas atteint le backend (URL/réseau), ce n'est pas un 401.
      const msg = e?.response
        ? e.response.data?.message ?? t('auth.invalidCredentials')
        : t('errors.serverUnreachable');
      notify(t('auth.loginFailedTitle'), msg);
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
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Wordmark size={40} color={colors.mossDeep} />

          <View style={{ flex: 1, minHeight: 40 }} />

          <Card style={styles.card}>
            <Label style={{ marginBottom: 6 }}>{t('auth.welcome')}</Label>
            <Text style={styles.heading}>{t('auth.loginTitle')}</Text>

            <View style={{ gap: 12 }}>
              <View>
                <Label style={{ marginBottom: 6 }}>{t('auth.email')}</Label>
                <Field
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder={t('auth.emailPlaceholder')}
                />
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
            </View>

            <Button
              label={t('auth.signIn')}
              onPress={onSubmit}
              loading={loading}
              fullWidth
              style={{ marginTop: 18 }}
              iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
            />

            <View style={styles.linksRow}>
              <Text style={styles.linkSub}>{t('auth.forgotPassword')}</Text>
              <Text style={styles.linkAccent} onPress={() => router.push('/(auth)/activate')}>
                {t('auth.haveActivationCode')}
              </Text>
            </View>

            <View style={styles.divider} />
            <View style={styles.signupRow}>
              <Text style={styles.signupHint}>{t('auth.noAccount')}</Text>
              <Text
                style={styles.signupLink}
                onPress={() => router.push('/(auth)/signup')}
              >
                {t('auth.newAccount')}
                <Ionicons name="arrow-forward" size={14} color={colors.moss} />
              </Text>
            </View>
          </Card>

          <Text style={styles.footer}>
            {t('auth.footer')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Hills() {
  return (
    <Svg
      viewBox="0 0 402 380"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFillObject as any}
    >
      <Defs>
        <LinearGradient id="hill1" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#2E5142" />
          <Stop offset="1" stopColor="#1E3A2F" />
        </LinearGradient>
      </Defs>
      <Path
        d="M-10,210 C 80,150 160,260 240,210 S 380,150 420,200 L 420,400 L -10,400 Z"
        fill="url(#hill1)"
        opacity={0.18}
      />
      <Path
        d="M-10,260 C 60,200 180,310 260,250 S 380,220 420,260 L 420,400 L -10,400 Z"
        fill="#1E3A2F"
        opacity={0.09}
      />
      <Circle cx="300" cy="120" r="42" fill="#C9956B" opacity={0.55} />
      <Circle cx="300" cy="120" r="64" fill="#C9956B" opacity={0.18} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
  scroll: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  tagline: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 26,
    color: colors.mossDeep,
    marginTop: 14,
    maxWidth: 260,
  },
  card: { paddingHorizontal: 20, paddingVertical: 22 },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginBottom: 18,
    letterSpacing: -0.3,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  linkSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  linkAccent: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: colors.earthDeep,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(42,38,32,0.08)',
    marginTop: 18,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 16,
  },
  signupHint: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  signupLink: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: colors.moss,
  },
  footer: {
    textAlign: 'center',
    marginTop: 18,
    fontSize: 11.5,
    color: colors.ink3,
    letterSpacing: 0.5,
    fontFamily: fonts.sans,
  },
});
