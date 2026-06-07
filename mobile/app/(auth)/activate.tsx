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
import {
  acceptInvitationByCode,
  previewInvitationByCode,
  type InvitationPreview,
} from '../../services/authApi';

/** Activation par CODE COURT (Lot 3.4, UC-TRV-10) : un dirigeant invité saisit son code. */
export default function ActivateScreen() {
  const insets = useSafeAreaInsets();
  const { establishSession } = useAuth();

  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const errMsg = (e: any, fallback: string) =>
    e?.response ? e.response.data?.message ?? fallback
      : 'Serveur injoignable — vérifiez le backend et le réseau.';

  const onCheckCode = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      notify('shephr', 'Saisissez le code reçu (au moins 6 caractères).');
      return;
    }
    setLoading(true);
    try {
      setPreview(await previewInvitationByCode(c));
    } catch (e: any) {
      notify('Code invalide', errMsg(e, 'Code inconnu, expiré ou déjà utilisé.'));
    } finally {
      setLoading(false);
    }
  };

  const onActivate = async () => {
    if (password.length < 8) {
      notify('shephr', 'Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      notify('shephr', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await acceptInvitationByCode(code.trim().toUpperCase(), password);
      await establishSession(res);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      notify('Activation impossible', errMsg(e, "L'activation a échoué."));
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
            <Label style={{ marginBottom: 6 }}>Activation</Label>
            <Text style={styles.heading}>J'ai un code d'activation</Text>

            {preview == null ? (
              <>
                <Label style={{ marginBottom: 6 }}>Votre code</Label>
                <Field
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="ex. ABCD2345"
                />
                <Button
                  label="Vérifier le code"
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
                    <Label style={{ marginBottom: 6 }}>Choisissez un mot de passe</Label>
                    <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="Au moins 8 caractères" />
                  </View>
                  <View>
                    <Label style={{ marginBottom: 6 }}>Confirmez le mot de passe</Label>
                    <Field value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Retapez le mot de passe" />
                  </View>
                </View>
                <Button
                  label="Activer mon compte"
                  onPress={onActivate}
                  loading={loading}
                  fullWidth
                  style={{ marginTop: 18 }}
                  iconRight={<Ionicons name="checkmark" size={18} color={colors.white} />}
                />
                <Text style={styles.changeCode} onPress={() => { setPreview(null); setPassword(''); setConfirm(''); }}>
                  Ce n'est pas vous ? Changer de code
                </Text>
              </>
            )}

            <View style={styles.divider} />
            <View style={styles.backRow}>
              <Text style={styles.backLink} onPress={() => router.replace('/(auth)/login')}>
                <Ionicons name="arrow-back" size={14} color={colors.moss} /> Retour à la connexion
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
