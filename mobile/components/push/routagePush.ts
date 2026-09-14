/**
 * Routage du tap sur une bannière push — lot N4b/N4c (J-3 14/09).
 *
 * <p>Le serveur ne choisit PAS une destination : il choisit un `type` fermé
 * (`com.excellence.back.push.DonneesPush`), et c'est l'app qui décide de ce que chacun ouvre.
 * Une route arbitraire venue du réseau serait un point d'entrée non contrôlé : quiconque sait
 * émettre un push ouvrirait n'importe quel écran avec n'importe quels paramètres. Tout `type`
 * inconnu est ignoré ici, jamais interprété.
 *
 * <p><b>Ce que le tap fait, et ce qu'il ne fait pas.</b> Il ne compose aucun affichage : la
 * relance est une `UserNotification` déjà écrite en base, et `NotificationGate` reste seul à la
 * montrer. Le routeur recharge donc la file des non-lues (`fileNotifications.ts`), puis — et
 * seulement ensuite — conduit à l'écran où l'on AGIT sur ce qu'on vient de lire.
 *
 * <p>La destination se déduit de la `source` de la notification, pas de la charge utile : le
 * serveur n'envoie ni « trésorerie » ni « objectifs », et il n'a pas à le faire — `source` est
 * déjà le vocabulaire métier de `UserNotification`, et il est ici de première main.
 */
import { useCallback } from 'react';
import { router, type Href } from 'expo-router';

import { useAuth } from '../../contexts/AuthContext';
import { hasMemberGoals } from '../../services/authApi';
import { getUnreadNotifications } from '../../services/notificationsApi';
import type { DonneesPush } from '../../services/pushApi';
import { rechargerFileNotifications } from './fileNotifications';

/**
 * Sources de `UserNotification` qui méritent une destination.
 *
 * Mirrors com.excellence.back.notification.UserNotification#source
 */
const SOURCE_RESUME_TRESORERIE = 'DONATION_DIGEST';
const SOURCE_RELANCE_DONS = 'DONATION_REMINDER';
const SOURCE_RAPPEL_GOALS = 'GOAL_REMINDER';

/**
 * Valide la charge utile reçue du réseau.
 *
 * <p>Rien n'est supposé : `data` arrive telle que le service Expo l'a transmise, et une charge
 * mal formée doit sortir par `null` plutôt que par une exception au milieu d'un écouteur — un
 * tap raté vaut mieux qu'un crash au lancement de l'app.
 */
export function analyserDonneesPush(brut: unknown): DonneesPush | null {
  if (!brut || typeof brut !== 'object') return null;
  const donnees = brut as Record<string, unknown>;
  switch (donnees.type) {
    case 'NOTIFICATION':
      return typeof donnees.notificationId === 'string' && donnees.notificationId
        ? { type: 'NOTIFICATION', notificationId: donnees.notificationId }
        : null;
    // SANS identifiant, et c'est voulu : une relance groupée écrit une ligne par personne mais
    // ne porte qu'une charge utile pour tout le monde. Chacun ouvre sa propre file (J-3 14/09).
    case 'NOTIFICATIONS':
      return { type: 'NOTIFICATIONS' };
    default:
      return null;
  }
}

/**
 * `typedRoutes` régénère `.expo/types/router.d.ts` au démarrage d'Expo, pas à la compilation :
 * une route reste inconnue de TypeScript tant que le serveur n'a pas tourné. C'est la seule
 * raison de ces conversions — les gabarits sont ceux des fichiers d'écran correspondants.
 */
function naviguer(chemin: string): void {
  try {
    router.push(chemin as unknown as Href);
  } catch (e) {
    // Arbre de navigation pas encore prêt, route retirée : on a déjà rechargé la file, la
    // personne verra sa notification. Une navigation ratée ne justifie pas de lever.
    console.log('[push] navigation impossible', chemin, e);
  }
}

/**
 * Routeur du tap.
 *
 * @returns une fonction qui prend la charge utile BRUTE (`content.data`) et l'exécute. Elle ne
 *   rejette jamais : elle est appelée depuis des écouteurs natifs, où une promesse rejetée ne
 *   serait rattrapée nulle part.
 */
export function useRouteurPush() {
  const { isAuthenticated, isTreasurer, hasDonations, hasGoals, me } = useAuth();

  /**
   * Conduit à l'écran où agir, d'après la source de la notification qu'on vient d'ouvrir.
   *
   * <p>Les gardes ne sont pas décoratives : un onglet masqué (`href: null`) reste une route
   * atteignable, et y pousser quelqu'un qui n'y a pas droit lui montrerait un écran vide puis
   * un 403. Elles ne remplacent pas la garde serveur — elles évitent d'y envoyer pour rien.
   */
  const conduire = useCallback(
    (source: string | undefined) => {
      switch (source) {
        // Résumé des déclarations à vérifier → la file de travail du trésorier (N1).
        case SOURCE_RESUME_TRESORERIE:
          if (hasDonations && isTreasurer) naviguer('/(tabs)/leader/verify');
          return;
        // « Vous n'avez rien déclaré » → ses propres dons, d'où l'on déclare (N2).
        case SOURCE_RELANCE_DONS:
          if (hasDonations) naviguer('/(tabs)/donations');
          return;
        // Rappel d'engagement → l'écran des engagements de la personne (N3).
        case SOURCE_RAPPEL_GOALS:
          if (hasGoals || hasMemberGoals(me)) naviguer('/(tabs)/goals/member');
          return;
        default:
          // Source inconnue de cette version de l'app : la file rechargée suffit, elle porte le
          // texte. Inventer une destination serait pire que ne pas en avoir.
          return;
      }
    },
    [hasDonations, isTreasurer, hasGoals, me],
  );

  const ouvrirFile = useCallback(
    async (notificationId?: string) => {
      // D'ABORD la file : c'est elle qui fait foi, et elle doit s'afficher même si la lecture
      // ci-dessous échoue (réseau coupé au moment du tap).
      rechargerFileNotifications(notificationId);
      try {
        const nonLues = await getUnreadNotifications();
        const visee = notificationId
          ? nonLues.find((n) => n.id === notificationId)
          : // Relance groupée : pas d'identifiant, on prend la plus récente — c'est celle que la
            // bannière annonçait.
            [...nonLues].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        conduire(visee?.source);
      } catch (e) {
        console.log('[push] file des non-lues non chargée', e);
      }
    },
    [conduire],
  );

  return useCallback(
    (brut: unknown) => {
      const donnees = analyserDonneesPush(brut);
      if (!donnees) {
        console.log('[push] charge utile ignorée', brut);
        return;
      }
      // Session expirée ou appareil déconnecté depuis l'envoi : il n'y a pas de file à ouvrir,
      // et l'appel partirait en 401. `NotificationGate` reprendra à la prochaine connexion.
      if (!isAuthenticated) return;
      switch (donnees.type) {
        case 'NOTIFICATION':
          void ouvrirFile(donnees.notificationId);
          return;
        case 'NOTIFICATIONS':
          void ouvrirFile();
      }
    },
    [isAuthenticated, ouvrirFile],
  );
}

export default useRouteurPush;
