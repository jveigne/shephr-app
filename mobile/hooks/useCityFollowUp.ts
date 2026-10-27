import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isAttachedAccount } from '@/services/authApi';
import { loadCityFollowUp, type CityEntry } from '@/utils/cityFollowUp';

/**
 * Entrée « Suivi de la ville » (JP 28/10) : villes de `/study/localities` ∪ `/assembly/localities`,
 * relues à chaque retour sur l'écran. La liste est vide pour un membre et pour un dirigeant d'unité
 * (D-ABO-21 / RG-ABO-22) : l'entrée ne leur apparaît jamais. Ne dépend PAS du catalogue d'étude.
 */
export function useCityFollowUp(): { cities: CityEntry[]; reload: () => Promise<void> } {
  const { me, hasAssembly } = useAuth();
  const [cities, setCities] = useState<CityEntry[]>([]);
  const enabled = !!me && isAttachedAccount(me);

  const reload = useCallback(async () => {
    if (!enabled) {
      setCities([]);
      return;
    }
    setCities(await loadCityFollowUp(hasAssembly));
  }, [enabled, hasAssembly]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { cities, reload };
}
