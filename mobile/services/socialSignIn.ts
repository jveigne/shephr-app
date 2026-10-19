import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { AppleLoginPayload } from '@/services/socialAuthApi';

/**
 * Côté natif de la connexion simplifiée : obtenir la preuve d'identité auprès de Google ou
 * d'Apple. Aucun appel au backend ici (voir `socialAuthApi.ts`).
 *
 * Web : rien de tout cela n'est proposé (SDK natifs) — les boutons sont masqués.
 * Annulation par l'utilisateur : les fonctions renvoient `null`, sans erreur, pour que l'écran
 * n'affiche aucune alerte.
 */

type Extra = {
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Valeur factice laissée dans `app.json` tant que les clients OAuth ne sont pas créés. */
const isPlaceholder = (v?: string) => !v || v.includes('REMPLACER_');

/**
 * Google n'est proposé que si les client IDs réels sont renseignés dans `app.json`
 * (`expo.extra`) : avec les valeurs factices `REMPLACER_...`, le SDK échouerait à chaque appui
 * — un bouton qui ne marche jamais vaudrait aussi un rejet en revue.
 */
export const googleSignInEnabled =
  Platform.OS !== 'web' &&
  !isPlaceholder(extra.GOOGLE_WEB_CLIENT_ID) &&
  (Platform.OS !== 'ios' || !isPlaceholder(extra.GOOGLE_IOS_CLIENT_ID));

let googleConfigured = false;

/** Une fois au démarrage (`app/_layout.tsx`). Sans effet sur web ou sans client IDs réels. */
export function configureGoogleSignIn(): void {
  if (!googleSignInEnabled || googleConfigured) return;
  try {
    GoogleSignin.configure({
      // Le client « Web » sert d'audience de l'idToken (vérifiée par le backend).
      webClientId: extra.GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? extra.GOOGLE_IOS_CLIENT_ID : undefined,
    });
    googleConfigured = true;
  } catch (e) {
    console.log('GoogleSignin.configure failed', e);
  }
}

/** Erreur côté SDK, distincte des refus du backend. */
export class SocialSignInError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

/** Ouvre la feuille Google et renvoie l'idToken, ou `null` si la personne a annulé. */
export async function getGoogleIdToken(): Promise<string | null> {
  configureGoogleSignIn();
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return null;
    const idToken = res.data.idToken;
    // Sans webClientId valide, Google ne délivre pas d'idToken.
    if (!idToken) throw new SocialSignInError('GOOGLE_NO_ID_TOKEN');
    return idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      // Feuille fermée, ou un appui de trop pendant qu'elle s'ouvre : pas d'alerte.
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) {
        return null;
      }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new SocialSignInError('PLAY_SERVICES_NOT_AVAILABLE');
      }
    }
    throw e;
  }
}

/** À la déconnexion : l'appui suivant redemandera le choix du compte Google. */
export async function googleSignOut(): Promise<void> {
  if (!googleSignInEnabled) return;
  try {
    configureGoogleSignIn();
    await GoogleSignin.signOut();
  } catch (e) {
    console.log('GoogleSignin.signOut failed', e);
  }
}

/** iOS uniquement (13+) ; le bouton Apple n'est affiché que si cette promesse rend `true`. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function randomNonce(): string {
  return Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ouvre la feuille Apple et renvoie de quoi appeler `POST /api/auth/oauth/apple`, ou `null`
 * si la personne a annulé. Nonce : Apple reçoit SHA-256(rawNonce) en hex et le recopie dans le
 * jeton ; le backend reçoit `rawNonce`, refait le hachage et compare (anti-rejeu).
 */
export async function getAppleCredential(): Promise<AppleLoginPayload | null> {
  const rawNonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!cred.identityToken || !cred.authorizationCode) {
      throw new SocialSignInError('APPLE_NO_TOKEN');
    }
    // Nom et email : transmis par Apple à la première autorisation seulement — à envoyer
    // tout de suite, le backend ne les reverra jamais.
    const payload: AppleLoginPayload = {
      identityToken: cred.identityToken,
      authorizationCode: cred.authorizationCode,
      rawNonce,
    };
    if (cred.fullName?.givenName) payload.givenName = cred.fullName.givenName;
    if (cred.fullName?.familyName) payload.familyName = cred.fullName.familyName;
    if (cred.email) payload.email = cred.email;
    return payload;
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}
