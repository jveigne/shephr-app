/**
 * Domaine de partage — UNE seule source dans le web (contrat Documents §7.3 et §9, P1).
 *
 * D-DOC-09 (JP 18/10) [HYPOTHÈSE] : le lien universel vit sur le domaine de l'Espace ministère
 * (`https://<SHARE_DOMAIN>/d/{slug}`). Les fronts ne composent PAS le lien de partage : ils
 * utilisent `DocumentShareResponse.shareUrl`, à défaut `PublicDocument.shareUrl`. Cette base ne sert
 * que de dernier repli (champ vide inattendu).
 *
 * `VITE_SHARE_BASE_URL` (P1 : https://www.shephr.org (JP 18/10) — et non shephr.org, qui redirige (308) vers www : Apple et Android ne suivent aucune redirection pour les fichiers .well-known) ; absent → origine courante.
 */
export const SHARE_BASE_URL: string = (() => {
  const configured = import.meta.env.VITE_SHARE_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : 'https://www.shephr.org';
})();
