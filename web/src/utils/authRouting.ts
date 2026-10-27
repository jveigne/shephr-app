import type { NavigateFunction } from 'react-router-dom';
import { hasMemberSpace, hasMinistryAccess, type MeResponse } from '../services/authApi';
import { safeDocumentNext } from './documents';

/**
 * Routage après ouverture d'une session — extrait de `pages/Login.tsx` (D-WEB-05, JP 27/10) pour que
 * la connexion et le « mot de passe oublié » (`pages/ResetPassword.tsx`, dont la réponse est celle du
 * login) mènent au MÊME endroit. Miroir de `mobile/utils/authRouting.routeAfterLogin`.
 */

/**
 * Destination à reprendre après une session expirée. N'accepte qu'un chemin interne :
 * une URL absolue ou protocol-relative (`//ailleurs`) serait une redirection ouverte.
 * L'accès reste arbitré par les gardes d'AppShell/MemberShell à l'arrivée.
 */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw.startsWith('/login') ? null : raw;
}

/**
 * Pages d'abonnement (hors shell, lot ABO4) : ouvertes à tout compte connecté. O10 (JP 27/10, plan 05) :
 * la page publique des offres /offres (qui remplace /abonnements) aussi — retour après « Se connecter ».
 */
export const isBillingPath = (p: string) =>
  p === '/abonnements' ||
  p.startsWith('/abonnements/') ||
  p.startsWith('/abonnements?') ||
  p === '/offres' ||
  p.startsWith('/offres?');

/**
 * Issue du routage :
 * - `welcome` : navigation faite vers un espace (l'appelant peut afficher le toast de bienvenue) ;
 * - `join` : navigation faite vers l'onboarding `/join` (aucun rattachement) ;
 * - `denied` : aucun espace web pour ce compte — rien n'a été navigué, l'appelant affiche `login.memberDenied`.
 */
export type AfterLoginOutcome = 'welcome' | 'join' | 'denied';

export function routeAfterLogin(
  me: MeResponse,
  nextPath: string | null,
  navigate: NavigateFunction,
): AfterLoginOutcome {
  // Lot ABO4 (D-ABO-05, JP 23/10) : les pages d'abonnement servent TOUT compte connecté,
  // rattaché ou non — le retour après connexion n'attend donc aucun rôle.
  if (nextPath && isBillingPath(nextPath)) {
    navigate(nextPath, { replace: true });
    return 'welcome';
  }
  const noAttachmentAtAll =
    !me.superAdmin &&
    me.goalRole == null &&
    me.donationRole == null &&
    me.goalUnitId == null &&
    me.donationUnitId == null;
  // D-WEB-04 (JP 27/10) : retour sur le lecteur d'un document (`/d/{slug}`, page publique) pour
  // TOUT compte, comme les pages d'abonnement. Un compte sans aucun rattachement passe d'abord par
  // `/join`, qui le renverra au document une fois rattaché (miroir de `services/returnTarget` mobile).
  const docNext = safeDocumentNext(nextPath);
  if (docNext) {
    if (noAttachmentAtAll) {
      navigate(`/join?next=${encodeURIComponent(docNext)}`, { replace: true });
      return 'join';
    }
    navigate(docNext, { replace: true });
    return 'welcome';
  }
  if (hasMinistryAccess(me)) {
    // Comportement actuel : accès Web Espace ministère.
    navigate(nextPath ?? '/dashboard', { replace: true });
    return 'welcome';
  }
  if (hasMemberSpace(me)) {
    // Feature A — MEMBRE Goals rattaché : espace minimal « Mes objectifs ».
    navigate(nextPath ?? '/my-goals', { replace: true });
    return 'welcome';
  }
  if (noAttachmentAtAll) {
    // Feature B — aucun rattachement ni rôle : onboarding /join.
    navigate('/join', { replace: true });
    return 'join';
  }
  return 'denied';
}
