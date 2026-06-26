import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
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
      const res = await acceptInvitationByCode(code.trim().toUpperCase(), password);
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
                  <Text style={styles.previewMeta}>{preview.email}</Text>
                  {preview.ministryName && (
                    <Text style={styles.previewMeta}>{preview.ministryName}</Text>
                  )}
                </Card>
                <View style={{ gap: 12, marginTop: 14 }}>
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
                <Text style={styles.changeCode} onPress={() => { setPreview(null); setPassword(''); setConfirm(''); }}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
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
