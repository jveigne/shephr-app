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

/**
 * D-OFF-11 (JP 27/10) — offres présentées dans l'app par leur seul nom ; le verrou d'une
 * fonctionnalité porte un lien « En savoir plus » vers la page web publique `/offres` (plan 27/10
 * `05_Plan_Offres_Caleb_Nehemie.md` §8). `caleb` = suivi de ma hiérarchie (chaîne de supervision,
 * HIERARCHIE_SUIVI) ; `nehemie` = suivi de toute ma ville (géographie, EGLISE_VILLE).
 */
export type OfferKey = 'caleb' | 'nehemie';

/**
 * `https://<SHARE_DOMAIN>/offres?offer=caleb|nehemie` — la page web fait défiler jusqu'à la carte
 * de l'offre. Le lien n'ouvre que la présentation : aucun prix, aucun achat dans l'app (D-OFF-11).
 * Dépendance (revue 27/10) : la page PUBLIQUE `/offres` (hors shell, lecture de `?offer=`) est
 * livrée par le web (ticket O10, §3.8) — ne pas publier un build mobile avant elle, sinon le lien
 * tombe sur la garde de l'AppShell (connexion).
 */
export function offersUrl(offer?: OfferKey | null, handoff?: string | null): string {
  const base = offer ? `${SHARE_BASE_URL}/offres?offer=${offer}` : `${SHARE_BASE_URL}/offres`;
  // D-PAY-05 / RG-PAY-12 (JP 28/10) : le jeton de passage voyage dans le FRAGMENT, jamais en query
  // (le fragment n'est pas envoyé au serveur ni journalisé). Seul point de composition de ce lien.
  return handoff ? `${base}#handoff=${encodeURIComponent(handoff)}` : base;
}
