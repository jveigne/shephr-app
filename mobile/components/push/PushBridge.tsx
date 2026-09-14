/**
 * Le raccord entre l'authentification et le push — lot N4b (J-3 14/09).
 *
 * <p>Monté une seule fois, à la racine, SOUS `AuthProvider` et `LanguageProvider`. Il ne rend
 * que l'invitation d'activation et ne bloque jamais l'affichage : une app sans push doit
 * démarrer exactement comme une app avec.
 *
 * <p>Il existe pour que `contexts/AuthContext.tsx` n'ait pas à connaître le push. Les deux
 * moments qui comptent — la connexion et la déconnexion — se lisent parfaitement de l'extérieur,
 * dans les transitions de `token` et de `me.id` :
 *
 * <ul>
 *   <li><b>connexion</b> : `pret` passe à vrai avec un `userId`, le hook enregistre l'appareil
 *       (sans redemander la permission) et la ligne serveur porte désormais le compte — c'est ce
 *       qui la fait entrer dans le ciblage `List&lt;UUID&gt; utilisateurs` des relances (N4a) ;</li>
 *   <li><b>déconnexion</b> : l'appareil est <b>supprimé</b> côté serveur. Shephr n'a pas de mode
 *       visiteur — contrairement à CMFIPraise, qui garde une ligne anonyme —, et une ligne qui
 *       porterait encore l'ancien compte enverrait ses relances à un téléphone qu'il n'a plus.
 *       La suppression part avec le jeton d'authentification qu'on avait ENCORE en main : au
 *       moment où la transition est observée, `logout()` l'a déjà retiré d'AsyncStorage et
 *       l'appel serait refusé en 401.</li>
 * </ul>
 */
import React, { useEffect, useRef } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import ModaleActivationPush from './ModaleActivationPush';
import { useRouteurPush } from './routagePush';
import { oublierAppareil, usePushNotifications } from './usePushNotifications';

export default function PushBridge() {
  const { ready, token, me } = useAuth();
  const { language, t } = useLanguage();
  const routerPush = useRouteurPush();

  const userId = me?.id ?? null;

  usePushNotifications({
    userId,
    // `pret` exige un compte, pas seulement une auth résolue : `POST /api/push/devices` est
    // `authenticated()`, et sans personne connectée l'enregistrement partirait en 401 pour une
    // ligne que rien ne pourrait cibler.
    pret: ready && !!token && !!userId,
    langue: language,
    t,
    routerPush,
  });

  // Jeton de la session précédente : la seule chose qui permette encore d'appeler le DELETE
  // une fois la déconnexion faite.
  const jetonPrecedent = useRef<string | null>(null);
  useEffect(() => {
    const avant = jetonPrecedent.current;
    jetonPrecedent.current = token;
    // Déconnexion (et non simple démarrage sans session) : on avait un jeton, on n'en a plus.
    if (avant && !token) {
      void oublierAppareil(avant);
    }
  }, [token]);

  return <ModaleActivationPush />;
}
