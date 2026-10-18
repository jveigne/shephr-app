import { router } from 'expo-router';
import type { MeResponse } from '@/services/authApi';

/**
 * Après toute connexion (mot de passe, Google, Apple, mot de passe oublié) : même routage.
 *
 * Feature B : sans AUCUN rattachement ni rôle → parcours de rattachement (`/join`) ; sinon
 * l'application. Sorti de `login.tsx` le 18/10/2026 pour que la réinitialisation du mot de passe
 * mène exactement au même endroit qu'une connexion.
 */
export function routeAfterLogin(me: MeResponse | null) {
  const unattached =
    !!me &&
    !me.superAdmin &&
    !me.goalRole &&
    !me.donationRole &&
    !me.goalUnitId &&
    !me.donationUnitId;
  router.replace(unattached ? '/(auth)/join' : '/(tabs)/home');
}
