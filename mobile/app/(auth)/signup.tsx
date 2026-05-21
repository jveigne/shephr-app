import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Alert,
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
import { joinUnit, type MyUnitResponse } from '../../services/unitApi';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [code, setCode] = useState('');
  const [accept, setAccept] = useState(false);
  const [resolved, setResolved] = useState<MyUnitResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const codeNormalized = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    [code],
  );
  const codeDisplay = codeNormalized.replace(/(.{3})(.+)/, '$1-$2');

  const step1Valid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes('@') &&
    password.length >= 6;

  const handleStep1 = async () => {
    if (!step1Valid) return;
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
      });
      setStep(2);
    } catch (e: any) {
      Alert.alert(
        "Inscription impossible",
        e?.response?.data?.message ?? 'Veuillez réessayer.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (codeNormalized.length !== 6 || !accept) return;
    setLoading(true);
    try {
      const r = await joinUnit({ joinCode: codeNormalized });
      setResolved(r);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert(
        'Code invalide',
        e?.response?.data?.message ?? 'Ce code ne correspond à aucune unité.',
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
              onPress={() => (step === 1 ? router.back() : setStep(1))}
              style={styles.iconBtn}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color={colors.mossDeep} />
            </Pressable>
            <Wordmark size={22} />
            <View style={{ flex: 1 }} />
            <Text style={styles.stepPill}>{step}/2</Text>
          </View>

          <View style={styles.progressRow}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: step >= 1 ? colors.moss : 'rgba(30,58,47,0.15)' },
              ]}
            />
            <View
              style={[
                styles.progressBar,
                { backgroundColor: step >= 2 ? colors.moss : 'rgba(30,58,47,0.15)' },
              ]}
            />
          </View>

          <Text style={styles.title}>
            {step === 1 ? 'Créer votre compte' : 'Rejoindre votre église'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'Quelques informations pour démarrer votre journal de dons.'
              : `Bonjour ${firstName} — saisissez le code transmis par votre responsable.`}
          </Text>

          {step === 1 ? (
            <View style={{ gap: 14, marginTop: 22 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 6 }}>Prénom</Label>
                  <Field value={firstName} onChangeText={setFirstName} placeholder="Esther" />
                </View>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 6 }}>Nom</Label>
                  <Field value={lastName} onChangeText={setLastName} placeholder="Mbeki" />
                </View>
              </View>
              <View>
                <Label style={{ marginBottom: 6 }}>Adresse e-mail</Label>
                <Field
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="vous@exemple.com"
                />
              </View>
              <View>
                <Label style={{ marginBottom: 6 }}>Mot de passe</Label>
                <Field
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Au moins 6 caractères"
                />
              </View>

              <Button
                label="Continuer"
                onPress={handleStep1}
                fullWidth
                disabled={!step1Valid}
                loading={loading}
                height={56}
                iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
              />

              <View style={styles.hint}>
                <Text style={styles.hintTitle}>Étape suivante</Text>
                <Text style={styles.hintBody}>
                  Vous saisirez un code d'invitation pour rejoindre votre église. Sans ce code, votre compte
                  restera inactif.
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 22 }}>
              <Label style={{ marginBottom: 8 }}>Code d'invitation</Label>
              <Card style={{ paddingVertical: 18, paddingHorizontal: 18 }}>
                <Field
                  value={codeDisplay}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  placeholder="ABC-123"
                  style={{
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    textAlign: 'center',
                    fontFamily: fonts.mono,
                    fontSize: 24,
                    letterSpacing: 1.5,
                    color: colors.mossDeep,
                    paddingVertical: 4,
                  }}
                />
              </Card>

              <Text style={styles.codeHint}>
                Saisissez les 6 caractères du code transmis par votre responsable.
              </Text>

              {resolved && (
                <Card style={styles.resolvedCard}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={styles.checkChip}>
                      <Ionicons name="checkmark" size={18} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label>Vous allez rejoindre</Label>
                      <Text style={styles.resolvedUnit}>{resolved.unitName}</Text>
                      <Text style={styles.resolvedMeta}>
                        {resolved.type === 'CENTER' ? 'Centre' : 'Assemblée'} ·{' '}
                        {resolved.localityName} · {resolved.ministryName}
                      </Text>
                    </View>
                  </View>
                </Card>
              )}

              <Pressable onPress={() => setAccept(!accept)} style={styles.consentRow}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: accept ? colors.moss : 'transparent',
                      borderColor: accept ? colors.moss : colors.hairStrong,
                    },
                  ]}
                >
                  {accept && <Ionicons name="checkmark" size={12} color={colors.white} />}
                </View>
                <Text style={styles.consentText}>
                  J'accepte que mes déclarations soient visibles par les responsables de mon unité.
                </Text>
              </Pressable>

              <Button
                label="Rejoindre mon église"
                onPress={handleJoin}
                fullWidth
                disabled={codeNormalized.length !== 6 || !accept}
                loading={loading}
                height={56}
                style={{ marginTop: 18 }}
                iconLeft={<Ionicons name="checkmark" size={18} color={colors.white} />}
              />
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomHint}>Déjà inscrit ?</Text>
            <Text
              onPress={() => router.replace('/(auth)/login')}
              style={styles.bottomLink}
            >
              Se connecter
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  stepPill: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.mossDeep,
    backgroundColor: 'rgba(30,58,47,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    letterSpacing: 0.6,
  },
  progressRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  progressBar: { flex: 1, height: 3, borderRadius: 99 },
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
  hint: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(201,149,107,0.10)',
    borderLeftColor: colors.earth,
    borderLeftWidth: 3,
  },
  hintTitle: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    color: colors.earthDeep,
    fontSize: 12,
  },
  hintBody: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink2,
    marginTop: 2,
    lineHeight: 18,
  },
  codeHint: {
    marginTop: 14,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    lineHeight: 18,
    backgroundColor: 'rgba(42,38,32,0.04)',
    padding: 12,
    borderRadius: 14,
  },
  resolvedCard: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(30,58,47,0.06)',
    borderColor: 'rgba(30,58,47,0.15)',
  },
  checkChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvedUnit: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.mossDeep,
    marginTop: 2,
  },
  resolvedMeta: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink2,
    marginTop: 4,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(42,38,32,0.04)',
    marginTop: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink2,
    lineHeight: 18,
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
