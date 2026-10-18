import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '@/components/Card';
import Field from '@/components/Field';
import Label from '@/components/Label';
import Button from '@/components/Button';
import Wordmark from '@/components/Wordmark';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { goBack } from '@/utils/navigation';
import { routeAfterLogin } from '@/utils/authRouting';
import { requestPasswordReset } from '@/services/passwordResetApi';
import {
  classifyPasswordResetError,
  passwordResetErrorMessage,
  type PasswordResetError,
} from '@/utils/passwordResetErrors';

/** Valeurs du backend (`ResetCodeRules`), si les paramètres de route manquent. */
const DEFAULT_RESEND_AFTER_SECONDS = 60;
const DEFAULT_VALIDITY_MINUTES = 15;

function positiveInt(raw: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/**
 * Mot de passe oublié, écran 2 (plan `mot-de-passe-oublie-plan.md` §6 A3, 18/10/2026) : code à
 * 6 chiffres + nouveau mot de passe confirmé → `POST /api/auth/password/reset`.
 *
 * - L'identifiant est celui envoyé à `/forgot`, renvoyé TEL QUEL : le code est lié à la demande
 *   (même appli, même identifiant), sinon le serveur répond `INVALID_CODE`.
 * - « Renvoyer le code » n'est actif qu'après le délai indiqué par le backend
 *   (`resendAfterSeconds`, compté depuis le `/forgot` réussi) : avant, le serveur répondrait 202
 *   sans rien envoyer. Tout nouveau code rend les précédents invalides.
 * - Code expiré ou trop d'essais : la saisie est fermée jusqu'à un nouveau code. Trop de demandes
 *   (429) : le bouton reste bloqué pendant `Retry-After`.
 * - Succès : la réponse est celle du login Shephr ; la session s'ouvre par `AuthContext`
 *   (`resetPassword` → `applySession`) puis le même routage qu'après une connexion.
 */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { ready, isAuthenticated, resetPassword } = useAuth();
  const { t, language } = useLanguage();
  const params = useLocalSearchParams<{
    identifier?: string;
    resendAfter?: string;
    validity?: string;
  }>();
  const identifier = typeof params.identifier === 'string' ? params.identifier : '';

  const [validityMinutes, setValidityMinutes] = useState(() =>
    positiveInt(params.validity, DEFAULT_VALIDITY_MINUTES),
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<PasswordResetError | null>(null);
  /** Code expiré ou trop d'essais : seul un nouveau code rouvre la saisie. */
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(
    () => Date.now() + positiveInt(params.resendAfter, DEFAULT_RESEND_AFTER_SECONDS) * 1000,
  );
  /** 429 `TOO_MANY_REQUESTS` : pas de nouvel essai avant cette date (`Retry-After`). */
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  /**
   * Posé AVANT l'appel : dès que la session s'ouvre, `isAuthenticated` passe à vrai et la garde
   * ci-dessous renverrait vers l'accueil — alors qu'un compte non rattaché doit aller à `/join`.
   */
  const [signingIn, setSigningIn] = useState(false);

  // Compte à rebours (renvoi, blocage 429) : une horloge à la seconde tant qu'il en reste un.
  const ticking = resendAt > now || blockedUntil > now;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const blocked = blockedUntil > now;

  if (ready && isAuthenticated && !signingIn) return <Redirect href="/(tabs)/home" />;
  // Atteint sans passer par l'écran 1 (lien direct, rechargement web) : rien à vérifier.
  if (!identifier) return <Redirect href="/(auth)/forgot-password" />;

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const blockedFor = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  const passwordTooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && confirm !== password;
  const formValid =
    code.length === 6 && password.length >= 6 && confirm === password && !needsNewCode && !blocked;

  const submit = async () => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    setSigningIn(true);
    let me: Awaited<ReturnType<typeof resetPassword>>;
    try {
      me = await resetPassword({
        identifier,
        // Le serveur ne retire que les espaces de bord : tout ce qui n'est pas un chiffre part ici.
        code: code.replace(/\D/g, ''),
        newPassword: password,
      });
    } catch (e) {
      console.log('Réinitialisation du mot de passe : échec', e);
      setSigningIn(false);
      const err = classifyPasswordResetError(e);
      setError(err);
      if (err.kind === 'CODE_EXPIRED' || err.kind === 'TOO_MANY_ATTEMPTS') setNeedsNewCode(true);
      if (err.kind === 'INVALID_CODE') setCode('');
      if (err.kind === 'TOO_MANY_REQUESTS') {
        const until = Date.now() + (err.retryAfterSeconds ?? 60) * 1000;
        setBlockedUntil(until);
        setNow(Date.now());
      }
      return;
    } finally {
      setSubmitting(false);
    }
    // Hors du try : un incident de navigation n'est pas un échec de la réinitialisation (le mot
    // de passe est changé, la session ouverte) et ne doit jamais afficher une erreur de code.
    // Les écrans du parcours ne restent pas sous l'application : retour au bas de la pile
    // `(auth)`, puis même routage qu'après la connexion.
    if (router.canDismiss()) router.dismissAll();
    routeAfterLogin(me);
  };

  const resend = async () => {
    if (resendIn > 0 || resending) return;
    setResending(true);
    try {
      const res = await requestPasswordReset(identifier, language);
      const sentAt = Date.now();
      setResendAt(sentAt + res.resendAfterSeconds * 1000);
      setNow(sentAt);
      setValidityMinutes(res.codeValidityMinutes);
      setResent(true);
      setNeedsNewCode(false);
      setCode('');
      // Un éventuel blocage 429 vient de `/reset` et ne dépend pas du code : il demeure.
      setError((e) => (e?.kind === 'TOO_MANY_REQUESTS' ? e : null));
    } catch (e) {
      setError(classifyPasswordResetError(e));
    } finally {
      setResending(false);
    }
  };

  // Fin du blocage 429 : le message « Réessayez dans N min » n'a plus lieu d'être.
  const showError = !!error && !(error.kind === 'TOO_MANY_REQUESTS' && !blocked);
  const errorMessage = showError
    ? passwordResetErrorMessage(error, t, error.kind === 'TOO_MANY_REQUESTS' ? blockedFor : undefined)
    : null;

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

          <Text style={styles.title}>{t('passwordReset.resetTitle')}</Text>
          {/* Message neutre : la réponse de `/forgot` est la même qu'un compte existe ou non. */}
          <Text style={styles.subtitle}>
            {t(resent ? 'passwordReset.resentNotice' : 'passwordReset.sentNotice')}{' '}
            {t('passwordReset.validity', { minutes: validityMinutes })}
          </Text>

          <View style={{ gap: 14, marginTop: 22 }}>
            <Card style={styles.emailCard}>
              <Ionicons name="mail-outline" size={18} color={colors.mossDeep} />
              <Text style={styles.emailCardText} numberOfLines={1}>
                {identifier}
              </Text>
              <Text onPress={() => goBack('/(auth)/login')} style={styles.changeLink}>
                {t('passwordReset.changeEmail')}
              </Text>
            </Card>

            <View>
              <Label style={{ marginBottom: 6 }}>{t('passwordReset.codeLabel')}</Label>
              <Field
                value={code}
                // Pas de `maxLength` : un code collé « 123 456 » serait tronqué AVANT le
                // nettoyage. On garde les chiffres, puis les 6 premiers.
                onChangeText={(v) => {
                  setCode(v.replace(/\D/g, '').slice(0, 6));
                  if (error?.kind === 'INVALID_CODE' || error?.kind === 'INVALID_REQUEST') setError(null);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoCorrect={false}
                editable={!needsNewCode}
                placeholder={t('passwordReset.codePlaceholder')}
                style={[styles.codeField, needsNewCode && styles.fieldDisabled]}
              />
            </View>

            <View>
              <Label style={{ marginBottom: 6 }}>{t('passwordReset.newPassword')}</Label>
              <Field
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                placeholder={t('auth.passwordPlaceholder')}
              />
              {passwordTooShort && (
                <Text style={styles.errText}>{t('passwordReset.passwordTooShort')}</Text>
              )}
            </View>

            <View>
              <Label style={{ marginBottom: 6 }}>{t('passwordReset.confirmPassword')}</Label>
              <Field
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                placeholder={t('passwordReset.confirmPasswordPlaceholder')}
              />
              {mismatch && <Text style={styles.errText}>{t('passwordReset.passwordsMismatch')}</Text>}
            </View>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.clay} />
                <Text style={styles.errorBoxText}>{errorMessage}</Text>
              </View>
            )}

            <Button
              label={t('passwordReset.submit')}
              onPress={submit}
              fullWidth
              disabled={!formValid}
              loading={submitting}
              height={56}
              iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
            />

            <Button
              label={
                resendIn > 0
                  ? t('passwordReset.resendIn', { seconds: resendIn })
                  : t(needsNewCode ? 'passwordReset.newCode' : 'passwordReset.resend')
              }
              variant={needsNewCode ? 'primary' : 'ghost'}
              onPress={resend}
              fullWidth
              disabled={resendIn > 0}
              loading={resending}
              height={50}
            />
          </View>

          <View style={{ flex: 1 }} />
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
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.mossTint,
    borderColor: colors.mossTint2,
  },
  emailCardText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  changeLink: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  codeField: {
    fontFamily: fonts.mono,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  fieldDisabled: { opacity: 0.5 },
  errText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.clay,
    marginTop: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairStrong,
    backgroundColor: colors.paper2,
  },
  errorBoxText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.clay },
});
