import { router, type Href } from 'expo-router';
import { isUnattachedPerson, type MeResponse } from '@/services/authApi';
import { takeReturnTarget } from '@/services/returnTarget';

/**
 * Après toute connexion (mot de passe, Google, Apple, mot de passe oublié, inscription d'un compte
 * existant) : même routage.
 *
 * Feature B : sans AUCUN rattachement ni rôle → parcours de rattachement (`/join`) ; sinon
 * l'application. Sorti de `login.tsx` le 18/10/2026 pour que la réinitialisation du mot de passe
 * mène exactement au même endroit qu'une connexion.
 *
 * Plan 18/10 (§6.3, lot D5) — un lien universel arrivé sans session (`services/returnTarget`) est
 * rouvert à la place de l'accueil. Le compte sans rattachement passe d'abord par `/join`, qui
 * garde la cible et la rouvre à son tour (`routeHomeOrReturn`).
 */
export function routeAfterLogin(me: MeResponse | null) {
  const unattached =
    !!me &&
    !me.superAdmin &&
    !me.goalRole &&
    !me.donationRole &&
    !me.goalUnitId &&
    !me.donationUnitId;
  if (unattached) {
    // RG-PAYS-22 / D-PAYS-10 (JP 11/11, contrat 11/11 §10.2) : le rattachement est FACULTATIF — un compte qui a
    // choisi « Je n'ai pas d'assemblée » (pays posé, décidé par le serveur) et n'a aucune demande en cours entre
    // dans son espace sans assemblée (accueil, évènements ouverts) ; sinon le parcours `/join`, inchangé.
    if (isUnattachedPerson(me) && !me?.pendingJoinRequest) {
      void routeHomeOrReturn();
      return;
    }
    router.replace('/(auth)/join');
    return;
  }
  void routeHomeOrReturn();
}

/**
 * Sortie d'un parcours d'authentification (connexion, rattachement) : la cible mémorisée s'il y
 * en a une, sinon l'accueil. `dismissTo` et non `replace` : le lecteur qui a envoyé vers la
 * connexion est souvent encore sous la pile — on y REVIENT (il se recharge avec la nouvelle
 * session) au lieu d'en empiler une copie ; absent de la pile, `dismissTo` remplace l'écran courant.
 */
export async function routeHomeOrReturn(): Promise<void> {
  const target = await takeReturnTarget();
  if (target) {
    router.dismissTo(target as Href);
    return;
  }
  router.replace('/(tabs)/home');
}
