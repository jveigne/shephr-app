import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { readBrandingCache } from '@/theme/branding';
import { patchMyCountry } from '@/services/countriesApi';
import { refreshBrandingIfDue, syncAccountCountry } from '@/utils/brandingSync';

/**
 * Thème par pays, côté session — contrat 11/11 §5.4 (JP 11/11). Monté UNE fois sous `AuthProvider`
 * (`app/_layout.tsx` › `BrandingRefresh`) :
 * <ul>
 *   <li>relecture de la configuration au lancement et au retour au premier plan, au plus une fois par heure,
 *       appliquée au lancement suivant (`refreshBrandingIfDue`) ;</li>
 *   <li>RG-PAYS-04 : après chaque MeResponse, le thème suit `me.countryIso` (rechargement une fois si le pays
 *       change, `syncAccountCountry`) ;</li>
 *   <li>contrat §3.3 : compte sans pays enregistré (Google / Apple, compte ancien), non verrouillé, et pays choisi
 *       sur l'appareil → `PATCH /me/country` une fois, en silence, puis relecture du profil.</li>
 * </ul>
 * Les données mobiles ne passent pas par react-query : simples effets.
 */
export function useBrandingRefresh(): void {
  const { me, refreshMe } = useAuth();

  useEffect(() => {
    void refreshBrandingIfDue();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshBrandingIfDue();
    });
    return () => sub.remove();
  }, []);

  const countryIso = me?.countryIso;
  const meId = me?.id ?? null;
  useEffect(() => {
    // Un serveur antérieur au lot n'envoie pas `countryIso` (undefined) : rien n'est décidé.
    if (!meId || countryIso === undefined) return;
    void syncAccountCountry(countryIso);
  }, [meId, countryIso]);

  // Un seul essai par compte et par session ; un échec n'est pas redit (le pays reste celui de l'appareil).
  const patchedFor = useRef<string | null>(null);
  const needsCountry = !!me && me.countryNodeId === null && me.countryLocked === false;
  useEffect(() => {
    if (!needsCountry || !meId || patchedFor.current === meId) return;
    const device = readBrandingCache().deviceCountry;
    if (!device) return;
    patchedFor.current = meId;
    patchMyCountry(device)
      .then(() => refreshMe())
      .catch(() => undefined);
  }, [needsCountry, meId, refreshMe]);
}
