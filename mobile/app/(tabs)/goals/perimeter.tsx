import React from 'react';
import { router } from 'expo-router';
import GoalAggregatesScreen from '../../../components/GoalAggregates';
import GoalsMinistryOverview from '../../../components/GoalsMinistryOverview';
import { GoalEmptyState } from '../../../components/GoalCards';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';

/**
 * « Mon périmètre » — vues de LECTURE d'un dirigeant (RG-BQ-04 : le label de dirigeant ne confère
 * plus que de la lecture).
 *
 * <p>Extrait de `goals/index.tsx` le 16/08 : l'aiguillage d'entrée mène désormais tout compte
 * rattaché sur SES objectifs, ces vues sont donc atteintes depuis « Mes objectifs » et non plus
 * en lieu et place de l'écran personnel.
 *
 * <p>Ministère-large (LEADER / SECRETARIAT / superAdmin) → totaux + nations ; sinon agrégats des
 * régions / villes / nations portées.
 */
export default function PerimeterScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();

  const secretariat = (me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT';
  const ministryWide = secretariat || me?.goalRole === 'LEADER';

  // Multi-rattachements (home + set) : toutes les régions / villes portées, principale en tête.
  const uniq = (home?: string | null, set?: string[] | null) => {
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };
  const zoneIds = uniq(me?.goalZoneId, me?.goalZoneIds);
  const cityIds = uniq(me?.goalCityId, me?.goalCityIds);
  const countryIds = me?.goalCountryIds ?? [];

  if (ministryWide) {
    return <GoalsMinistryOverview secretariat={secretariat} />;
  }
  if (zoneIds.length > 0 || cityIds.length > 0 || countryIds.length > 0) {
    return <GoalAggregatesScreen zoneIds={zoneIds} cityIds={cityIds} countryIds={countryIds} />;
  }

  // Ni assemblée de rattachement, ni périmètre de lecture : la seule action utile est de rejoindre
  // une assemblée (RG-BQ-13 — chacun change d'assemblée lui-même).
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
