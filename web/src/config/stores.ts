/**
 * Liens des stores et de l'application — UNE seule source dans le web (contrat Documents §9, P2).
 *
 * D-DOC-05 (JP 18/10) : le lecteur public `/d/:slug` n'affiche que l'aperçu et renvoie vers l'app ;
 * ces liens alimentent le mur de fin d'aperçu, le pied de page d'un document `open` et l'écran
 * « plus disponible ».
 *
 * ⚠ P2 non fourni (18/10) : les liens App Store / Play Store sont des placeholders `TODO_…`. Tant
 * qu'ils ne commencent pas par `https://`, `isStoreUrlConfigured` renvoie false et les boutons
 * s'affichent inactifs (jamais un lien mort vers une URL relative).
 */
export const APP_STORE_URL = 'TODO_APP_STORE_URL';
export const PLAY_STORE_URL = 'TODO_PLAY_STORE_URL';

/** Schéma de l'app, déjà déclaré dans `mobile/app.json` (`"scheme": "shephr"`). */
export const APP_SCHEME = 'shephr';

export const isStoreUrlConfigured = (url: string) => url.startsWith('https://');
