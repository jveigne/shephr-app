import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isChainManager } from '@/services/authApi';
import { ENTITLEMENT_HIERARCHIE_SUIVI, getPersonalEntitlements } from '@/services/entitlementsApi';

export type LockedAssembly = { id: string; name: string; cityName: string | null };

/**
 * D-OFF-02 / D-OFF-06 (JP 27/10, plan `05_Plan_Offres_Caleb_Nehemie.md` §3.2-§3.4, D-OFF-11) —
 * verrou Caleb D'AVANCE sur la Vie d'assemblée et le Suivi pastoral.
 *
 * <p>Le serveur ne liste que les assemblées LISIBLES (`GET /assembly/units`, `GET /member-care/units`
 * = assemblée gratuite + chaîne si Caleb) : sans l'offre Caleb, les autres assemblées n'arrivent
 * jamais au front, et le 403 `HIERARCHIE_SUIVI` ne survient que sur un état périmé. Comme le web
 * (`pages/Assembly.tsx` › `lockedLed`, `HierarchyLockedCompact hideWhenEntitled`), l'écran :
 * <ul>
 *   <li>propose, avec un cadenas, les assemblées que le compte DIRIGE (`me.assemblies`) absentes de
 *       la liste du serveur — sans Caleb, la seconde d'un dirigeant d'unité qui en dirige deux
 *       (P-02) ; l'assemblée de rattachement n'en fait partie que si le compte est DIRIGEANT_UNITE ;</li>
 *   <li>remplace « Aucune assemblée » par le verrou Caleb pour un manager dont le code personnel
 *       `HIERARCHIE_SUIVI` n'est pas ouvert (`GET /entitlements/personal`) — un dirigeant de ville
 *       sans assemblée gratuite a des assemblées dans sa chaîne (recette n°4).</li>
 * </ul>
 * Axe de la CHAÎNE de supervision, jamais la géographie (offre Néhémie). Affichage seul : le droit
 * reste jugé par le serveur. Pas de react-query sur mobile : `useState` + `useFocusEffect`.
 *
 * @param listedIds ids renvoyés par le serveur, `null` tant que la liste n'est pas chargée.
 */
export function useCalebAssemblyGate(listedIds: string[] | null) {
  const { me } = useAuth();
  const eligible = isChainManager(me);
  /** `true` / `false` : code personnel ouvert ou non ; `null` : inconnu (chargement, panne, non éligible). */
  const [calebOpen, setCalebOpen] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    if (!eligible) {
      setCalebOpen(null);
      return;
    }
    try {
      const personal = await getPersonalEntitlements();
      setCalebOpen(personal.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI));
    } catch {
      // Panne : aucun verrou d'avance (le 403 du serveur reste le filet).
      setCalebOpen(null);
    }
  }, [eligible]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const lockedLed = useMemo<LockedAssembly[]>(() => {
    if (!eligible || calebOpen === true || listedIds == null || !me) return [];
    const listed = new Set(listedIds);
    const leadsUnits = me.goalRole === 'DIRIGEANT_UNITE' || me.donationRole === 'DIRIGEANT_UNITE';
    return (me.assemblies ?? []).filter(
      (a) => !listed.has(a.id) && (leadsUnits || a.id !== me.goalUnitId),
    );
  }, [eligible, calebOpen, listedIds, me]);

  return {
    /** Assemblées dirigées mais non listées : proposées avec un cadenas, ouvrent le verrou Caleb. */
    lockedLed,
    /** Liste vide : verrou Caleb à la place de « Aucune assemblée ». */
    showChainLock: eligible && calebOpen === false,
    reload,
  };
}
