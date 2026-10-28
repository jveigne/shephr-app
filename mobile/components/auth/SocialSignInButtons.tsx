import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from '@/theme';
import { notify } from '@/utils/dialogs';
import { socialAuthErrorMessage } from '@/utils/socialAuthErrors';
import { googleSignInEnabled, isAppleSignInAvailable } from '@/services/socialSignIn';
import { useAuth, type SocialLoginResult } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MeResponse } from '@/services/authApi';
import type { LinkConfirmationRequired } from '@/services/socialAuthApi';
import LinkConfirmModal from '@/components/auth/LinkConfirmModal';

interface Props {
  /** Session ouverte : même routage qu'après un login mot de passe. */
  onSignedIn: (me: MeResponse | null) => void;
  /** Vrai pendant un login mot de passe : les boutons attendent. */
  disabled?: boolean;
}

const BUTTON_HEIGHT = 50;
const RADIUS = 12;

/**
 * Connexion simplifiée : Apple (iOS, en premier — parité exigée par l'App Store) puis Google,
 * suivis d'un séparateur « ou » au-dessus du formulaire email / mot de passe.
 * Rien n'est rendu sur web, ni si aucun des deux fournisseurs n'est disponible.
 */
export default function SocialSignInButtons({ onSignedIn, disabled }: Props) {
  const { loginWithGoogle, loginWithApple } = useAuth();
  const { t } = useLanguage();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [pending, setPending] = useState<'apple' | 'google' | null>(null);
  // D-MKT-05, JP 28/10 — défi de confirmation en cours (en mémoire seulement, RG-MKT-55).
  const [link, setLink] = useState<{ provider: 'apple' | 'google'; challenge: LinkConfirmationRequired } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((ok) => {
      if (active) setAppleAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  if (Platform.OS === 'web') return null;
  if (!appleAvailable && !googleSignInEnabled) return null;

  const busy = disabled || pending !== null || link !== null;

  const run = async (provider: 'apple' | 'google', action: () => Promise<SocialLoginResult>) => {
    if (busy) return;
    setPending(provider);
    try {
      const res = await action();
      // Feuille fermée par la personne : aucune alerte.
      if (res.status === 'cancelled') return;
      // D-MKT-05 : compte trouvé par identifiant jamais prouvé → saisie du code, pas de session.
      if (res.status === 'confirmation') {
        setLink({ provider, challenge: res.challenge });
        return;
      }
      onSignedIn(res.me);
    } catch (e) {
      notify(t('auth.loginFailedTitle'), socialAuthErrorMessage(e, t));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.root}>
      {appleAvailable && (
        <View
          style={{
            opacity: busy && pending !== 'apple' ? 0.5 : 1,
            pointerEvents: busy ? 'none' : 'auto',
          }}
        >
          {pending === 'apple' ? (
            <View style={styles.appleLoading}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={RADIUS}
              style={styles.apple}
              onPress={() => void run('apple', loginWithApple)}
            />
          )}
        </View>
      )}

      {googleSignInEnabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.social.continueWithGoogle')}
          disabled={busy}
          onPress={() => void run('google', loginWithGoogle)}
          style={({ pressed }) => [
            styles.google,
            { opacity: busy && pending !== 'google' ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          {pending === 'google' ? (
            <ActivityIndicator color={GOOGLE_TEXT} />
          ) : (
            <>
              <GoogleLogo />
              <Text style={styles.googleLabel}>{t('auth.social.continueWithGoogle')}</Text>
            </>
          )}
        </Pressable>
      )}

      {link && (
        <LinkConfirmModal
          challenge={link.challenge}
          providerLabel={link.provider === 'apple' ? 'Apple' : 'Google'}
          onSignedIn={(me) => {
            setLink(null);
            onSignedIn(me);
          }}
          onClose={() => setLink(null)}
        />
      )}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.social.or')}</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

/** Logo « G » officiel en 4 couleurs (charte Google Sign-In, bouton clair). */
function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

// Charte Google, variante claire : fond blanc, contour #747775, texte #1F1F1F.
const GOOGLE_TEXT = '#1F1F1F';

const styles = StyleSheet.create({
  root: { gap: 10, marginBottom: 6 },
  apple: { width: '100%', height: BUTTON_HEIGHT },
  appleLoading: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  google: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLabel: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: '500',
    color: GOOGLE_TEXT,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(42,38,32,0.12)' },
  dividerText: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3 },
});
