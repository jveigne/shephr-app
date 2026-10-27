import React from 'react';
import FeatureLock from '@/components/FeatureLock';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Verrou de l'offre NÉHÉMIE (« le suivi de toute ma ville », plan `EGLISE_VILLE`, axe GÉOGRAPHIQUE).
 *
 * <p>Affiché à la place du contenu sur un 403 `MODULE_ACCESS_DENIED` dont le `moduleCode` est un code
 * de droit de ville — `ETUDE_SUIVI` (suivi de l'étude, contrat 27/10 §9.1) ou, depuis le lot
 * « Offres Caleb / Néhémie », `EVENEMENTS_SUIVI` (statistiques d'Évènements à l'intérieur d'une
 * ville, D-OFF-12) — ou pour une ville `entitled = false` de `GET /study/localities` (§9.3).
 *
 * <p>D-OFF-09 (JP 27/10) : un seul texte, quel que soit `canSubscribe` — titre « Suivi de la ville »,
 * texte « Cette fonctionnalité n'est pas activée pour votre église. ». Plus aucune mention du web,
 * d'un abonnement ou d'un paiement (l'ancien `study.city.lock.webOnly` est supprimé).
 * D-OFF-11 (JP 27/10) : lien « En savoir plus » vers `/offres?offer=nehemie`, porté par
 * `FeatureLock` — aucun prix, aucun bouton « S'abonner », aucun champ de code.
 */
export default function StudyCityLock({ compact }: { compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <FeatureLock
      compact={compact}
      offer="nehemie"
      title={t('study.city.lock.title')}
      body={t('study.city.lock.notActivated')}
    />
  );
}
