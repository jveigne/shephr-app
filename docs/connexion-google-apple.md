# Connexion Google et Apple (mobile Shephr)

> Statut : **code en place, configuration à faire** (15/10/2026). Le serveur est partagé avec
> CMFIPraise. Plan de référence : `cmfipraise-app/docs/connexion-simplifiee-plan.md`.
> Hors périmètre : téléphone (OTP), lier ou délier une méthode depuis le profil, rattachement
> des comptes Shephr sans email.

## Ce que fait l'app

- Écran `app/(auth)/login.tsx` : **Apple** (iOS seulement, et seulement si
  `AppleAuthentication.isAvailableAsync()`), puis **Google**, puis « ou », puis le formulaire
  identifiant / mot de passe. Rien n'est affiché sur web.
- Google n'apparaît que lorsque les client IDs réels remplacent les valeurs factices
  `REMPLACER_...` dans `app.json` (`services/socialSignIn.ts`, `googleSignInEnabled`). Tant que ce
  n'est pas fait, le bouton reste masqué : un bouton qui échoue à chaque appui serait refusé en revue.
- Appels (communs aux deux apps, publics) :
  - `POST /api/auth/oauth/google` `{ idToken, app: "SHEPHR" }`
  - `POST /api/auth/oauth/apple` `{ identityToken, authorizationCode, rawNonce, app: "SHEPHR", givenName?, familyName?, email? }`
  - Nonce Apple : l'app tire `rawNonce` (32 octets aléatoires, `expo-crypto`), passe
    SHA-256(rawNonce) en hex à Apple, puis envoie `rawNonce` au backend, qui refait le calcul.
  - Nom et email Apple : fournis par Apple **à la première autorisation seulement**, envoyés quand ils existent.
- La réponse est celle de `POST /api/church/auth/login`. Elle passe par `applySession`
  (`contexts/AuthContext.tsx`, ex-`openSession`), le même chemin que le login mot de passe,
  l'inscription et `establishSession`. Le push (`PushBridge`), les modules et la file hors ligne
  suivent donc la session comme avant. Le routage après connexion (`goAfterLogin` : rattachement
  ou accueil) est le même pour les trois méthodes.
- Annulation (feuille fermée, `ERR_REQUEST_CANCELED`, `SIGN_IN_CANCELLED`, `IN_PROGRESS`) : aucune alerte.
- Erreurs du serveur (`utils/socialAuthErrors.ts`, lit `code` puis `error`) traduites en fr et en :
  `INVALID_TOKEN`, `EMAIL_NOT_VERIFIED`, `PRIVILEGED_ACCOUNT_REQUIRES_PASSWORD`, `ACCOUNT_DISABLED`,
  `PROVIDER_NOT_CONFIGURED` (et tout 503). Sans réponse du serveur : « Serveur injoignable ».
- `logout()` appelle aussi `GoogleSignin.signOut()` (sans effet sur web, erreurs ignorées).

## Fichiers

| Fichier | Rôle |
|---|---|
| `mobile/services/socialAuthApi.ts` | Appels `/api/auth/oauth/{google,apple}` |
| `mobile/services/socialSignIn.ts` | SDK natifs : configure, feuille Google, feuille Apple + nonce, signOut |
| `mobile/utils/socialAuthErrors.ts` | Traduction des refus |
| `mobile/components/auth/SocialSignInButtons.tsx` | Bouton Apple natif, bouton Google (charte claire, logo G), séparateur |
| `mobile/contexts/AuthContext.tsx` | `applySession`, `loginWithGoogle`, `loginWithApple`, `logout` |
| `mobile/app/_layout.tsx` | `configureGoogleSignIn()` au démarrage |
| `mobile/app.json` | Plugins `expo-apple-authentication` et `@react-native-google-signin/google-signin`, `ios.usesAppleSignIn`, `extra.GOOGLE_*` |

`app.config.js` reprend `app.json` tel quel (il ne surcharge que `android.googleServicesFile`) :
plugins et `extra` se modifient dans **`app.json`**.

## Configuration à faire

1. **Apple Developer** : capacité *Sign in with Apple* sur l'App ID `org.cmfi.shephr`. EAS la
   synchronise normalement au build, puisque l'entitlement `com.apple.developer.applesignin` est
   généré par `usesAppleSignIn`. La clé `.p8` *Sign in with Apple* (Team ID, Key ID) se règle côté serveur.
2. **Google Cloud, projet Firebase `shephr-5072d`** : écran de consentement OAuth, puis trois clients OAuth :
   - **Web** : son ID va dans `extra.GOOGLE_WEB_CLIENT_ID` ; c'est l'audience (`aud`) de l'idToken ;
   - **iOS** (bundle `org.cmfi.shephr`) : son ID va dans `extra.GOOGLE_IOS_CLIENT_ID`, son
     « iOS URL scheme » (`com.googleusercontent.apps.…`) dans `extra.GOOGLE_IOS_URL_SCHEME` **et**
     dans l'option `iosUrlScheme` du plugin ;
   - **Android** (package `com.cmfi.shephr`) : SHA-1 du keystore EAS (`eas credentials`) **et**
     SHA-1 de la clé Play App Signing. Sans ce dernier, `DEVELOPER_ERROR` en version Play Store uniquement.
3. **Serveur (Railway)** : ajouter les IDs Web et iOS de Shephr à `GOOGLE_CLIENT_IDS`, et
   `org.cmfi.shephr` à `APPLE_CLIENT_IDS`.
4. Nouveau **build de développement** (dépendances natives ajoutées) : Expo Go ne convient pas.

Valeur factice et prebuild : le plugin Google exige un `iosUrlScheme` qui commence par
`com.googleusercontent.apps.`. La valeur factice `com.googleusercontent.apps.REMPLACER_GOOGLE_IOS_URL_SCHEME`
respecte ce préfixe, donc `npx expo config --type introspect` passe. Elle doit être remplacée avant tout build destiné aux testeurs.
