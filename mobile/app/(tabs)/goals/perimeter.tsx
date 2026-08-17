import React from 'react';
import { router } from 'expo-router';
import GoalAggregatesScreen from '../../../components/GoalAggregates';
import GoalsMinistryOverview from '../../../components/GoalsMinistryOverview';
import { GoalEmptyState } from '../../../components/GoalCards';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { goalPerimeterNodes, isMinistryWideGoals, isSubCoordinatorLeader } from '../../../services/authApi';

/**
 * « Mon périmètre » — vues de LECTURE d'un dirigeant (RG-BQ-04 : le label de dirigeant ne confère
 * plus que de la lecture).
 *
 * <p>Extrait de `goals/index.tsx` le 16/08 : l'aiguillage d'entrée mène désormais tout compte
 * rattaché sur SES objectifs, ces vues sont donc atteintes depuis « Mes objectifs » et non plus
 * en lieu et place de l'écran personnel.
 *
 * <p>Ministère-large (LEADER / SECRETARIAT / superAdmin) → totaux + nations ; sinon agrégats des
 * régions / villes / nations portées, et à défaut la SOMME À PLAT du sous-arbre
 * (`GET /goals/me/aggregate`) — c'est le seul agrégat d'un DIRIGEANT_UNITE, qui ne porte aucun
 * nœud géographique. Sans ce repli, la carte menait un dirigeant d'assemblée sur un « Compte non
 * rattaché » faux (il a bien une assemblée) ; le web fait le même repli
 * (`Goals.tsx`, `PerimeterBlock node={null}`).
 *
 * <p>⚠ Le RÔLE gate, la géographie ne fait que désigner la branche (`goalPerimeterNodes`, 16/08).
 * Tester d'abord les `goal*Id` portés ouvrait cet écran à des comptes que le backend refuse — un
 * `goalZoneId` est servi à l'affichage jusqu'au simple membre, alors que `getVisibleZoneIds`
 * renvoie `Set.of()` sous le rang DIRIGEANT_SENIOR. Même aiguillage que le web
 * (`Goals.tsx`, `showPerimeter`) : les deux surfaces doivent raconter la même chose.
 */
export default function PerimeterScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();

  // Le RÔLE gate, la géographie ne fait que désigner la branche (chantier 16/08) : un
  // rattachement porté par un rang trop bas est écarté par `goalPerimeterNodes`, sans quoi la
  // section s'affichait avec le nom de la région en titre et des zéros — un 403 rendu en donnée.
  const { zoneIds, cityIds, countryIds } = goalPerimeterNodes(me);

  // ⚠ « Secrétariat » se lit ici sur le rôle OBJECTIFS uniquement (un secrétariat Dons n'ouvre pas
  // la vue de gestion des Objectifs) — ne pas y substituer `isSecretariat`, qui unit les deux modules.
  if (isMinistryWideGoals(me)) {
    return (
      <GoalsMinistryOverview
        secretariat={(me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT'}
      />
    );
  }
  // Rôle d'abord : le sous-coordinateur a `GET /goals/me/aggregate` même sans aucun nœud porté ;
  // les listes ne servent qu'à construire les sections supplémentaires.
  if (isSubCoordinatorLeader(me) || zoneIds.length > 0 || cityIds.length > 0 || countryIds.length > 0) {
    return <GoalAggregatesScreen zoneIds={zoneIds} cityIds={cityIds} countryIds={countryIds} />;
  }

  // Pas d'assemblée du tout : la seule action utile est d'en rejoindre une (RG-BQ-13 — chacun
  // change d'assemblée lui-même, sans demande ni valideur).
  if (!me?.goalUnitId) {
    return (
      <GoalEmptyState
        icon="link-outline"
        title={t('goals.noUnitTitle')}
        hint={t('goals.noUnitHint')}
        actionLabel={t('assembly.changeCta')}
        onAction={() => router.push('/(tabs)/goals/assembly')}
      />
    );
  }

  // Rattaché, mais aucun périmètre de LECTURE (ex. coordinateur sans nation affectée) : ne pas
  // dire « compte non rattaché », c'est faux — renvoyer sur ses objectifs personnels.
  return (
    <GoalEmptyState
      icon="stats-chart-outline"
      title={t('goals.noPerimeterTitle')}
      hint={t('goals.noPerimeterHint')}
      actionLabel={t('goals.backToMine')}
      onAction={() => router.push('/(tabs)/goals/member')}
    />
  );
}
