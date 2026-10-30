import React from 'react';
import FeatureLock from '@/components/FeatureLock';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Verrou de l'offre CALEB (« le suivi de ma hiérarchie », droit PERSONNEL `HIERARCHIE_SUIVI`, axe de
 * la CHAÎNE de supervision — jamais la géographie) sur une AUTRE assemblée que l'assemblée gratuite
 * du compte : CR, réunions, journal, avancement (D-OFF-02 / D-OFF-04) et Member Care (D-OFF-06),
 * plan 27/10 `05_Plan_Offres_Caleb_Nehemie.md` §3.2-§3.4.
 *
 * <p>Affiché à la place du contenu sur un 403 `MODULE_ACCESS_DENIED` / `HIERARCHIE_SUIVI`
 * (`hierarchyAccessDenied`), jamais un toast. Le droit est jugé PAR LE SERVEUR : ce verrou n'est
 * qu'un affichage.
 *
 * <p>D-OFF-09 (JP 27/10) : texte neutre, sans mention du web, d'un abonnement ni d'un paiement.
 * D-OFF-11 (JP 27/10) : lien « En savoir plus » vers `/offres?offer=caleb` (porté par `FeatureLock`).
 *
 * <p>D-BER-02 (JP 29/10) : aussi à la place de « Commencer », de la copie papier et de l'ajustement
 * du Message de Bertoua sur une assemblée qui n'est pas l'assemblée gratuite du dirigeant — `body`
 * facultatif (`study.lock.pilotCaleb`), texte par défaut inchangé.
 */
export default function CalebAssemblyLock({ compact, body }: { compact?: boolean; body?: string }) {
  const { t } = useLanguage();
  return <FeatureLock compact={compact} offer="caleb" body={body ?? t('assemblyLife.lock.otherAssembly')} />;
}
