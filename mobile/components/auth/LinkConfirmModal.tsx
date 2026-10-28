/**
 * Confirmation de la liaison Google / Apple trouvée par identifiant — D-MKT-05, JP 28/10
 * (plan `cmfipraise-backend/docs/shephr/28_10_2026/05_…` §2.3, RG-MKT-55).
 *
 * <p>S'ouvre SEULEMENT sur une réponse 202 `LINK_CONFIRMATION_REQUIRED` : un compte Shephr porte
 * déjà cette adresse comme identifiant sans qu'elle ait jamais été prouvée ; rien n'est lié tant
 * que la personne n'a pas saisi le code à 6 chiffres envoyé à l'adresse masquée.
 *
 * <p>Le `challengeId` est un secret : il vit dans les props / l'état de ce composant, jamais dans
 * une route, AsyncStorage ni un journal. Succès → `applySession` (via `confirmFederatedLink`) puis
 * `onSignedIn(me)` : même chemin qu'un Google / Apple réussi (retour générique conservé par
 * l'écran login). 410 → message + fermeture ; 422 → message, champ vidé ; 429 → « patientez ».
 *
 * <p>Mise en page reprise de `components/push/ModaleActivationPush.tsx` (carte, voile, boutons).
 */
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Button from '@/components/Button';
import Card from '@/components/Card';
import Field from '@/components/Field';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MeResponse } from '@/services/authApi';
import { resendFederatedLinkCode, type LinkConfirmationRequired } from '@/services/socialAuthApi';
import { notify } from '@/utils/dialogs';
import { linkConfirmErrorMessage, retryAfterSeconds } from '@/utils/socialAuthErrors';

interface Props {
  challenge: LinkConfirmationRequired;
  /** Nom du fournisseur tel qu'affiché (« Google » / « Apple » — noms de marque, non traduits). */
  providerLabel: string;
  onSignedIn: (me: MeResponse | null) => void;
  /** Annulation, ou défi devenu invalide : la modale se ferme. */
  onClose: () => void;
}

export default function LinkConfirmModal({ challenge, providerLabel, onSignedIn, onClose }: Props) {
  const { confirmFederatedLink } = useAuth();
  const { t } = useLanguage();

  const [code, setCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState(challenge.maskedEmail);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Compte à rebours du bouton « Renvoyer le code » (RG-MKT-47 : 60 s entre deux envois).
  const [resendIn, setResendIn] = useState(Math.max(0, challenge.resendInSeconds || 60));
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const fail = (e: unknown) => {
    const res = linkConfirmErrorMessage(e, t, providerLabel);
    if (res.action === 'close') {
      notify(t('auth.loginFailedTitle'), res.message);
      onClose();
      return;
    }
    if (res.clearCode) setCode('');
    setInfo(null);
    setError(res.message);
  };

  const submit = async () => {
    if (checking || code.length !== 6) return;
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      const me = await confirmFederatedLink(challenge.challengeId, code);
      if (!alive.current) return;
      onSignedIn(me);
    } catch (e) {
      if (alive.current) fail(e);
    } finally {
      if (alive.current) setChecking(false);
    }
  };

  const resend = async () => {
    if (resending || resendIn > 0) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await resendFederatedLinkCode(challenge.challengeId);
      if (!alive.current) return;
      setMaskedEmail(res.maskedEmail);
      setResendIn(Math.max(0, res.resendInSeconds || 60));
      setCode('');
      setInfo(t('auth.social.linkConfirm.resent'));
    } catch (e) {
      if (!alive.current) return;
      const wait = retryAfterSeconds(e);
      if (wait) setResendIn(wait);
      fail(e);
    } finally {
      if (alive.current) setResending(false);
    }
  };

  const busy = checking || resending;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Card style={styles.card}>
          <View style={styles.iconBubble}>
            <Ionicons name="mail-outline" size={24} color={colors.moss} />
          </View>
          <Text style={styles.title}>{t('auth.social.linkConfirm.title')}</Text>
          <Text style={styles.message}>
            {t('auth.social.linkConfirm.intro', { provider: providerLabel, email: maskedEmail })}
          </Text>

          <Text style={styles.label}>{t('auth.social.linkConfirm.code')}</Text>
          <Field
            value={code}
            // Pas de `maxLength` : un code collé « 123 456 » serait tronqué avant le nettoyage.
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 6));
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoCorrect={false}
            autoFocus
            editable={!checking}
            placeholder="000000"
            accessibilityLabel={t('auth.social.linkConfirm.code')}
            onSubmitEditing={() => void submit()}
            style={styles.codeField}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Text
            accessibilityRole="button"
            onPress={resendIn > 0 || busy ? undefined : () => void resend()}
            style={[styles.resend, (resendIn > 0 || busy) && styles.resendDisabled]}
          >
            {resendIn > 0
              ? t('auth.social.linkConfirm.resendIn', { seconds: resendIn })
              : t('auth.social.linkConfirm.resend')}
          </Text>

          <Text style={styles.notMine}>{t('auth.social.linkConfirm.notMine')}</Text>

          <View style={styles.actions}>
            <Button
              label={t('auth.social.linkConfirm.cancel')}
              variant="ghost"
              onPress={onClose}
              disabled={busy}
              style={{ flex: 1 }}
              height={48}
            />
            <Button
              label={checking ? t('auth.social.linkConfirm.checking') : t('auth.social.linkConfirm.submit')}
              onPress={() => void submit()}
              loading={checking}
              disabled={code.length !== 6 || resending}
              style={{ flex: 1 }}
              height={48}
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { paddingHorizontal: 22, paddingVertical: 24, alignItems: 'center' },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginTop: 14,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
    alignSelf: 'stretch',
    marginTop: 16,
    marginBottom: 6,
  },
  codeField: {
    fontFamily: fonts.mono,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.clay,
    marginTop: 10,
    textAlign: 'center',
  },
  info: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.moss,
    marginTop: 10,
    textAlign: 'center',
  },
  resend: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.moss,
    marginTop: 14,
    textAlign: 'center',
  },
  resendDisabled: { color: colors.ink3, fontWeight: '400' },
  notMine: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
});
