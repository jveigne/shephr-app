import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { FEATURES } from '../config/features';
import { useAuth } from '../hooks/useAuth';
import { getStudyCatalog } from '../services/assemblyApi';
import { isAttachedAccount } from '../services/authApi';

/**
 * Accès à l'Étude de l'assemblée (« Le Message de Bertoua ») — SEUL point de décision du web.
 * Utilisé par `Sidebar`, `MemberShell`, `pages/Study.tsx` et `pages/StudySession.tsx` (D-WEB-02).
 *
 * D-ETU-50 (JP 27/10, lot « pro-plan ») : l'Étude est GRATUITE — D-ETU-28 levée pour tous ses usages.
 * Garde = flag de livraison `FEATURES.study` ET compte rattaché (`isAttachedAccount` : superAdmin,
 * rôle module > MEMBRE ou `goalUnitId`), comme la tuile mobile ; le code `STUDY` d'`accessible-modules`
 * n'est PLUS exigé (il y figure de toute façon : `sub_module.STUDY.free = TRUE`). Si la plateforme coupe
 * l'interrupteur `STUDY` (`enabled = false`), le serveur répond 403 `MODULE_ACCESS_DENIED` `STUDY` :
 * les pages l'affichent comme « module non activé » (`isStudyModuleOff`).
 * Le suivi de la VILLE est, lui, payant (`ETUDE_SUIVI`, vérifié par ville côté serveur — D-ETU-51) :
 * il n'est jamais décidé ici, mais par `GET /study/localities` et les 403 enrichis (contrat 27/10 §9).
 *
 * `enabled` : l'appelant peut couper l'accès tant que sa propre garde n'est pas levée (ex.
 * `MemberShell` attend la session).
 */
export function useStudyAccess(options?: { enabled?: boolean }): { hasStudy: boolean; isLoading: boolean } {
  const { ready, me } = useAuth();
  const enabled = (options?.enabled ?? true) && FEATURES.study;
  return {
    hasStudy: enabled && isAttachedAccount(me),
    isLoading: enabled && !ready,
  };
}

/**
 * D-ETU-54 (JP 27/10, recette n°10 du plan) — entrée de menu « Le Message de Bertoua » (Sidebar,
 * MemberShell) : visible seulement si l'étude est accessible (`hasStudy`) ET si `/study/catalog` est
 * non vide, comme la tuile mobile. Sans cela, l'Étude devenue gratuite ferait apparaître l'entrée chez
 * tous les ministères sans module Bertoua importé. Même clé que `pages/Study.tsx` : un seul appel.
 */
export function useStudyMenuVisible(hasStudy: boolean): boolean {
  const catalogQ = useQuery({
    queryKey: ['assembly', 'study', 'catalog'],
    queryFn: () => getStudyCatalog(),
    enabled: hasStudy,
  });
  return hasStudy && (catalogQ.data?.length ?? 0) > 0;
}

/** D-ETU-50 (JP 27/10) — 403 `MODULE_ACCESS_DENIED` sur `STUDY` : interrupteur plateforme coupé. */
export function isStudyModuleOff(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { error?: string; details?: { moduleCode?: string } } } } | null)
    ?.response;
  if (res?.status !== 403 || res.data?.error !== 'MODULE_ACCESS_DENIED') return false;
  const code = res.data?.details?.moduleCode;
  // Serveur antérieur au 27/10 (sans `details`) : seul STUDY gate l'étude, c'est donc lui.
  return code == null || code === '' || code === 'STUDY';
}

/**
 * D-WEB-02 (JP 27/10) — préfixe des liens de l'étude selon le shell : `/my-study` (MemberShell) ou
 * `/study` (AppShell) ; la page de séance est `{préfixe}/session/{id}`.
 */
export function useStudyBase(): '/study' | '/my-study' {
  const { pathname } = useLocation();
  return pathname.startsWith('/my-study') ? '/my-study' : '/study';
}
