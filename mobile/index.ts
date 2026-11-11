// Point d'entrée maison — D-PAYS-01 / spec conf-pays §2.3 (JP 11/11), contrat 11/11 §5.4.
//
// Les écrans figent leurs couleurs dans `StyleSheet.create` au chargement du module, et expo-router les charge en
// mode `sync` depuis `expo-router/entry`. On pose donc les couleurs du pays (cache lu de façon SYNCHRONE) dans
// `colors` AVANT d'évaluer le routeur : tous les écrans voient la bonne palette, sans en réécrire un seul.
//
// Ordre imposé :
//   1. `@expo/metro-runtime` en tout premier (Fast Refresh sur le web, comme `expo-router/entry-classic`) ;
//   2. `bootBranding()` (aucun écran importé par `theme/branding`) ;
//   3. `expo-router/entry` par `require` — un `import` serait remonté au-dessus de l'appel par Babel.
import '@expo/metro-runtime';
import { bootBranding } from '@/theme/branding';

bootBranding();

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
