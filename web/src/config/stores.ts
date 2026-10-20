/**
 * Liens des stores et de l'application — UNE seule source dans le web (contrat Documents §9, P2).
 *
 * D-DOC-05 (JP 18/10) : le lecteur public `/d/:slug` n'affiche que l'aperçu et renvoie vers l'app ;
 * ces liens alimentent le mur de fin d'aperçu, le pied de page d'un document `open` et l'écran
 * « plus disponible ».
 *
 * P2 fourni (JP 20/10) : fiche « Shepherd - Church Management » sur les deux stores. Lien App Store
 * SANS code pays (`/app/id…` et non `/nl/app/…`) : Apple redirige chacun vers le store de son pays.
 * Garde-fou conservé : un lien qui ne commence pas par `https://` désactive son bouton.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6790212965';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.cmfi.shephr';

/** Schéma de l'app, déjà déclaré dans `mobile/app.json` (`"scheme": "shephr"`). */
export const APP_SCHEME = 'shephr';

export const isStoreUrlConfigured = (url: string) => url.startsWith('https://');
