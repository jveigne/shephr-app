import { router } from 'expo-router';

/**
 * Retour arrière SÛR — à utiliser partout à la place de `router.back()`.
 *
 * <p>`router.back()` nu est un **no-op silencieux quand la pile de navigation est vide** : il ne
 * lève rien, il ne fait rien. L'écran devient alors sans issue — la flèche ou la croix est morte.
 * Le cas n'est pas théorique : la pile est vide dès qu'un écran est atteint par un lien direct
 * (deep link d'une notification), après un rechargement du navigateur ou un Fast Refresh sur Expo
 * web, et lorsque le navigateur est recréé.
 *
 * <p>Constaté en recette le 15/09 sur « Déclarer un don », puis retrouvé sur 21 autres écrans :
 * seul `app/structure.tsx` s'en prémunissait, avec exactement cette garde recopiée à la main.
 * Elle vit désormais ici, une fois.
 *
 * @param fallback écran de repli quand il n'y a rien derrière. L'accueil par défaut.
 */
export function goBack(fallback: '/(tabs)/home' | '/(tabs)/donations' = '/(tabs)/home') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
