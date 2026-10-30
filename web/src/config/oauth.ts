/**
 * Identifiants des fournisseurs de connexion fédérée côté WEB — D-PAY-06, JP 28/10 (RG-PAY-43).
 *
 * Variables d'environnement Vite (aucun `.env` n'est versionné) ; valeurs à fournir par JP, en
 * placeholders tant qu'elles ne le sont pas :
 *   VITE_GOOGLE_WEB_CLIENT_ID=REMPLACER_GOOGLE_WEB_CLIENT_ID   (client OAuth « Application Web » ;
 *     origines JavaScript autorisées : https://<SHARE_DOMAIN> et http://localhost:5173 — à ajouter
 *     aussi à GOOGLE_CLIENT_IDS côté backend)
 *   VITE_APPLE_SERVICES_ID=REMPLACER_APPLE_SERVICES_ID         (Services ID lié à l'App ID Shephr ;
 *     backend : APPLE_WEB_CLIENT_IDS)
 *   VITE_APPLE_REDIRECT_URI=REMPLACER_APPLE_WEB_REDIRECT_URI   (Return URL déclarée chez Apple, ex.
 *     https://<SHARE_DOMAIN>/login ; backend : APPLE_WEB_REDIRECT_URI, même valeur)
 *
 * Aucun identifiant n'est inventé ni recopié du mobile : un bouton reste MASQUÉ tant que sa valeur est
 * vide ou commence par `REMPLACER_`.
 */
const configured = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s && !s.startsWith('REMPLACER_') ? s : null;
};

export const GOOGLE_WEB_CLIENT_ID: string | null = configured(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID);

/** Apple exige les deux : le Services ID et la Return URL déclarée (même avec la popup). */
export const APPLE_WEB: { servicesId: string; redirectUri: string } | null = (() => {
  const servicesId = configured(import.meta.env.VITE_APPLE_SERVICES_ID);
  const redirectUri = configured(import.meta.env.VITE_APPLE_REDIRECT_URI);
  return servicesId && redirectUri ? { servicesId, redirectUri } : null;
})();

/**
 * Au moins un bouton Google / Apple peut s'afficher — constat MKT (plan 28_10_2026/05 §10.6 n°5, JP 29/10) :
 * /offres ne promet « En un clic avec Google ou Apple » que dans ce cas.
 */
export const SOCIAL_SIGN_IN_CONFIGURED: boolean = !!(GOOGLE_WEB_CLIENT_ID || APPLE_WEB);
