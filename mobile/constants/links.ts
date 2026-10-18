/**
 * Liens universels (plan 18/10, §6.3 ; contrat 02_Contrat_API_Documents §7.3 et §9).
 *
 * D-DOC-09 (JP 18/10) [HYPOTHÈSE] — le lien de partage vit sur le domaine de l'Espace ministère
 * (`https://<SHARE_DOMAIN>/d/{slug}`) ; les liens `/e/*` des Évènements le réutiliseront.
 *
 * P1 : domaine = www.shephr.org (JP 18/10) — et non shephr.org, qui redirige (308) vers www : Apple et Android ne suivent aucune redirection pour les fichiers .well-known.
 * `SHARE_DOMAIN` est l'UNIQUE source côté code mobile ; `app.json` (`ios.associatedDomains`
 * « applinks:… », `android.intentFilters` › host) ne peut pas lire une constante et porte la même
 * valeur : changer les trois ensemble, puis refaire un build EAS.
 *
 * Les fronts ne COMPOSENT jamais un lien de partage (contrat §7.3) : ils partagent
 * `DocumentShareResponse.shareUrl`, à défaut `PublicDocument.shareUrl`. Cette constante ne sert
 * qu'au repli Expo web (iframe vers le lecteur web, D-DOC-13).
 */
export const SHARE_DOMAIN = 'www.shephr.org';

/** Origine du lecteur web public (`/d/:slug` de `shephr-app/web`). */
export const SHARE_BASE_URL = `https://${SHARE_DOMAIN}`;

/** Lecteur web d'un document — repli Expo web (iframe), jamais partagé tel quel. */
export function webReaderUrl(slug: string): string {
  return `${SHARE_BASE_URL}/d/${encodeURIComponent(slug)}`;
}
