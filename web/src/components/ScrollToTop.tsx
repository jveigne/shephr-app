import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Défilement en haut de page à chaque changement de CHEMIN — D-FIX (bug JP 29/10 : « Offres » s'ouvrait
 * en bas). `BrowserRouter` ne gère aucune restauration de défilement : un lien cliqué en bas d'une page
 * (pied de page de la landing, bas du menu) ouvrait la page suivante à la même hauteur.
 * - PUSH / REPLACE (lien, redirection) → `window.scrollTo(0, 0)` ;
 * - POP (retour / avance du navigateur) → rien : le navigateur restaure la position ;
 * - seul le chemin compte : changer la query (`?tab=`, `?folder=`, `&annule=1`) garde la position ;
 * - une page qui vise une ancre la fait elle-même APRÈS (ex. `/offres?offer=…` défile jusqu'à la carte).
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
    // Seul le chemin déclenche (le type de navigation est lu au même rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}
