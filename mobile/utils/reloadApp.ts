import { DevSettings, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Rechargement de l'app — spec conf-pays §2.3, contrat 11/11 §5.4 (JP 11/11). Sert UNIQUEMENT à appliquer tout de
// suite un thème de pays (les couleurs sont posées au lancement par `index.ts`) : `expo-updates` est installé pour
// `Updates.reloadAsync()` seulement, sans aucune mise à jour à distance (`updates.enabled = false` dans app.json).
//
// - Expo web : `window.location.reload()` ;
// - développement (`__DEV__`, dev client) : `DevSettings.reload()` — `reloadAsync` y est refusé ;
// - build : `Updates.reloadAsync()`, chargé à la demande pour qu'un binaire sans le module natif (dev build
//   antérieur) ne plante pas à l'import (même prudence que `ExpoCrypto` dans `services/eventQueue.ts`).
//
// Renvoie `false` si le rechargement n'a pas pu être demandé : l'appelant affiche alors `branding.restartToApply`,
// rien d'autre. Un seul rechargement à la fois (garde en mémoire de module).

let reloading = false;

export async function reloadApp(): Promise<boolean> {
  if (reloading) return true;
  reloading = true;
  try {
    if (Platform.OS === 'web') {
      globalThis.location?.reload();
      return true;
    }
    if (__DEV__) {
      DevSettings.reload();
      return true;
    }
    if (!requireOptionalNativeModule('ExpoUpdates')) {
      reloading = false;
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as typeof import('expo-updates');
    await Updates.reloadAsync();
    return true;
  } catch {
    reloading = false;
    return false;
  }
}
