import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  fetchAccessibleModules,
  fetchMe,
  hasGoalsAccess,
  isLeaderRole,
  isTreasurerRole,
  login as loginRequest,
  register as registerRequest,
  type AuthResponse,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
  type UserDTO,
} from '@/services/authApi';
import { getAuthToken, setAuthToken } from '@/services/apiClient';
import {
  cacheMe,
  cacheModules,
  clearCachedSession,
  isAuthRefusal,
  isTransientFailure,
  readCachedSession,
} from '@/services/sessionCache';
import { resetDonationCategoriesCache } from '@/hooks/useDonationCategories';
import { claimEventCatalog } from '@/hooks/useEventCatalog';
import { claimEventQueue, isOnline, releaseEventQueue } from '@/services/eventQueue';
import { loginWithAppleToken, loginWithGoogleToken } from '@/services/socialAuthApi';
import {
  resetPassword as resetPasswordRequest,
  type ResetPasswordPayload,
} from '@/services/passwordResetApi';
import { getAppleCredential, getGoogleIdToken, googleSignOut } from '@/services/socialSignIn';

/**
 * Issue d'une connexion Google / Apple : `cancelled` quand la personne a fermé la feuille du
 * fournisseur (aucune alerte à afficher), sinon le profil chargé comme pour `login`.
 */
export type SocialLoginResult =
  | { status: 'cancelled' }
  | { status: 'success'; me: MeResponse | null };

interface AuthState {
  ready: boolean;
  token: string | null;
  user: UserDTO | null;
  me: MeResponse | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isLeader: boolean;
  /**
   * Lot T4 (défaut C, 14/09) — fonction de TRÉSORIER, lue sur `me.treasurer`. Elle seule ouvre
   * l'onglet « Trésorerie » et les vues `/api/church/leader/**` : un rang pastoral (`isLeader`)
   * n'y donne plus rien. Relue à chaque `/me`, donc une nomination vaut sans nouveau login.
   */
  isTreasurer: boolean;
  hasGoals: boolean;
  hasUnit: boolean;
  /** Modules accessibles (codes) ; alimente le gating de navigation. */
  modules: string[];
  hasMemberCare: boolean;
  /**
   * Vie d'assemblée (réunions, CR, avancement) : abonnement ASSEMBLY actif — D-ASM-12 (JP 23/09),
   * module distinct de MEMBER_CARE.
   */
  hasAssembly: boolean;
  /** Module Dons accessible : abonnement DONATIONS actif couvrant l'utilisateur (RG-06). */
  hasDonations: boolean;
  /**
   * Évènements & recensement des actions d'évangélisation : abonnement EVENTS actif — D-EVT-05
   * (JP 14/10), un seul module pour l'agenda et le recensement. Sans lui, tuile et écrans sont
   * invisibles (RG-06).
   */
  hasEvents: boolean;
  /** Renvoie le profil chargé (null si /me a échoué) — permet le routage post-login (Feature B). */
  login: (payload: LoginRequest) => Promise<MeResponse | null>;
  register: (payload: RegisterRequest) => Promise<void>;
  /** Connexion simplifiée Google (iOS / Android) — `POST /api/auth/oauth/google`. */
  loginWithGoogle: () => Promise<SocialLoginResult>;
  /** Sign in with Apple (iOS) — `POST /api/auth/oauth/apple`. */
  loginWithApple: () => Promise<SocialLoginResult>;
  /**
   * Mot de passe oublié (18/10/2026) — `POST /api/auth/password/reset` : change le mot de passe
   * avec le code reçu par e-mail et ouvre la session comme `login` (même réponse, même chemin).
   * Renvoie le profil chargé, pour le même routage post-login.
   */
  resetPassword: (payload: ResetPasswordPayload) => Promise<MeResponse | null>;
  /** Établit une session à partir d'une réponse d'auth (ex. activation par code — Lot 3.4). */
  establishSession: (res: AuthResponse) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ready: false,
    token: null,
    user: null,
    me: null,
  });

  const [modules, setModules] = useState<string[]>([]);

  /**
   * Lot E6 (14/10, RG-ACT-08) — profil et modules servis par le cache (`services/sessionCache`)
   * faute d'avoir pu joindre le serveur : à revalider au premier retour du réseau ou du premier
   * plan. `modulesEpoch` relance le chargement des modules.
   */
  const [meStale, setMeStale] = useState(false);
  const [modulesStale, setModulesStale] = useState(false);
  const [modulesEpoch, setModulesEpoch] = useState(0);

  const userId = state.me?.id ?? null;

  const refreshMe = useCallback(async () => {
    const token = await getAuthToken();
    try {
      const me = await fetchMe();
      if (token) void cacheMe(me, token);
      setState((s) => ({ ...s, me }));
      setMeStale(false);
      // Les modules dépendent du rattachement (unité, zone, ministère) : un `/me` relu après
      // `join` ou un changement d'assemblée doit aussi les relire — sinon, même jeton et même
      // `me.id`, l'effet ci-dessous ne se relancerait qu'au prochain login.
      setModulesEpoch((n) => n + 1);
    } catch (e) {
      // Hors ligne : le profil connu reste (RG-ACT-08) — le perdre fermerait la tuile de
      // déclaration et la file hors-ligne jusqu'au prochain lancement. Revalidé plus tard.
      if (isTransientFailure(e)) {
        setMeStale(true);
        return;
      }
      setState((s) => ({ ...s, me: null }));
    }
  }, []);

  // Lot T5 — le référentiel des rubriques est SCOPÉ AU MINISTÈRE du compte (décision D0-5) :
  // son cache doit tomber au même moment que la session, sinon le compte suivant verrait
  // d'abord les rubriques du précédent. Même raison que le `queryClient.clear()` du web.
  useEffect(() => {
    resetDonationCategoriesCache();
  }, [state.token]);

  // Charge les modules accessibles à chaque changement de session (login/logout/restauration),
  // à l'arrivée du profil et à chaque revalidation.
  useEffect(() => {
    let active = true;
    const token = state.token;
    if (!token) {
      setModules([]);
      setModulesStale(false);
      return;
    }
    fetchAccessibleModules()
      .then((m) => {
        if (!active) return;
        setModules(m);
        setModulesStale(false);
        if (userId) void cacheModules(token, userId, m);
      })
      .catch(async (e) => {
        if (!active) return;
        if (!isTransientFailure(e) || !userId) {
          setModules([]);
          setModulesStale(isTransientFailure(e));
          return;
        }
        // RG-ACT-08 — serveur injoignable : les derniers modules connus de CE compte, plutôt
        // qu'une application vide (RG-06 masquerait tout, tuile « Déclarer une action » comprise).
        const cached = await readCachedSession(token);
        if (!active) return;
        setModules(cached?.userId === userId && cached.modules ? cached.modules : []);
        setModulesStale(true);
      });
    return () => {
      active = false;
    };
  }, [state.token, userId, modulesEpoch]);

  // Lot E6 (14/10) — file hors-ligne des déclarations d'action et catalogue de saisie : liés au
  // COMPTE, pas à la session. Ils sont vidés quand un AUTRE compte se connecte (comme les
  // rubriques de don, et pour la même raison), mais survivent à une reconnexion du même compte :
  // une déclaration faite hors ligne avant l'expiration de la session doit partir après (RG-ACT-08,
  // §3.3 du contrat). D'où la clé `me.id`, et non le jeton — qui est passé à la file pour qu'elle
  // envoie sous l'identité de son propriétaire, et d'aucun autre.
  const sessionToken = state.token;
  useEffect(() => {
    if (!userId || !sessionToken) return;
    void claimEventQueue(userId, sessionToken);
    void claimEventCatalog(userId);
  }, [userId, sessionToken]);

  useEffect(() => {
    (async () => {
      const token = await getAuthToken();
      if (!token) {
        setState({ ready: true, token: null, user: null, me: null });
        return;
      }
      try {
        const me = await fetchMe();
        void cacheMe(me, token);
        setState({ ready: true, token, user: null, me });
        return;
      } catch (e) {
        if (isAuthRefusal(e)) {
          await Promise.all([setAuthToken(null), clearCachedSession()]);
          setState({ ready: true, token: null, user: null, me: null });
          return;
        }
      }
      // RG-ACT-08 (Lot E6, 14/10) — lancement sans réseau, souvent après que le système a tué
      // l'application sur le terrain : la session n'est PAS perdue pour autant. Seul un refus du
      // jeton (401 / 403) déconnecte ; sinon on repart du dernier profil connu, revalidé dès que
      // le serveur répond. Sans cela, plus de tuile ni de file hors-ligne jusqu'à une reconnexion
      // — qui exigerait elle-même le réseau.
      const cached = await readCachedSession(token);
      if (cached?.modules) setModules(cached.modules);
      setMeStale(true);
      setState({ ready: true, token, user: null, me: cached?.me ?? null });
    })();
  }, []);

  /**
   * Ouvre une session : la file des actions est détachée de la précédente et le cache de profil
   * vidé AVANT que le nouveau jeton ne soit posé — dès cet instant, `apiClient` envoie sous la
   * nouvelle identité (Lot E6, 14/10).
   *
   * Point d'entrée UNIQUE de toute connexion — mot de passe, inscription, Google, Apple, mot de
   * passe oublié : la réponse des endpoints OAuth et de `/api/auth/password/reset` est la même
   * que celle de `/api/church/auth/login`, et tout ce qui suit une session (push via
   * `PushBridge`, modules, file hors-ligne) réagit au jeton posé ici.
   */
  const applySession = useCallback(async (res: AuthResponse): Promise<MeResponse | null> => {
    releaseEventQueue();
    await Promise.all([setAuthToken(res.token), clearCachedSession()]);
    let me: MeResponse | null = null;
    let stale = false;
    try {
      me = await fetchMe();
      void cacheMe(me, res.token);
    } catch (e) {
      me = null;
      stale = isTransientFailure(e);
    }
    setMeStale(stale);
    setState({ ready: true, token: res.token, user: res.user, me });
    return me;
  }, []);

  const login = useCallback(
    async (payload: LoginRequest) => applySession(await loginRequest(payload)),
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      await applySession(await registerRequest(payload));
    },
    [applySession],
  );

  const loginWithGoogle = useCallback(async (): Promise<SocialLoginResult> => {
    const idToken = await getGoogleIdToken();
    if (!idToken) return { status: 'cancelled' };
    const me = await applySession(await loginWithGoogleToken(idToken));
    return { status: 'success', me };
  }, [applySession]);

  const loginWithApple = useCallback(async (): Promise<SocialLoginResult> => {
    const credential = await getAppleCredential();
    if (!credential) return { status: 'cancelled' };
    const me = await applySession(await loginWithAppleToken(credential));
    return { status: 'success', me };
  }, [applySession]);

  const resetPassword = useCallback(
    async (payload: ResetPasswordPayload) => applySession(await resetPasswordRequest(payload)),
    [applySession],
  );

  const establishSession = useCallback(
    async (res: AuthResponse) => {
      await applySession(res);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    // Lot E6 — d'abord détacher la file : plus rien ne part sous l'identité qui s'en va.
    releaseEventQueue();
    await Promise.all([setAuthToken(null), clearCachedSession()]);
    setMeStale(false);
    setState({ ready: true, token: null, user: null, me: null });
    // Session Google du SDK : sans cela, l'appui suivant reprendrait le même compte sans
    // proposer d'en choisir un autre. Jamais bloquant (try/catch interne, rien sur web).
    void googleSignOut();
  }, []);

  // Revalidation d'une session servie par le cache : au retour du réseau, au retour au premier
  // plan, et une fois tout de suite si le réseau est déjà là (il a pu revenir pendant le
  // démarrage). Un échec passager laisse l'état inchangé, donc sans boucle ; un refus du jeton
  // termine la session, comme il l'aurait fait au démarrage.
  const needsRevalidation = !!state.token && (meStale || modulesStale);
  useEffect(() => {
    if (!needsRevalidation || !sessionToken) return;
    let cancelled = false;

    const revalidate = async () => {
      if (modulesStale) setModulesEpoch((n) => n + 1);
      if (!meStale) return;
      try {
        const me = await fetchMe();
        // Session changée pendant l'appel : la réponse ne la concerne plus.
        if (cancelled || (await getAuthToken()) !== sessionToken) return;
        void cacheMe(me, sessionToken);
        setState((s) => (s.token === sessionToken ? { ...s, me } : s));
        setMeStale(false);
      } catch (e) {
        if (cancelled || !isAuthRefusal(e)) return;
        if ((await getAuthToken()) === sessionToken) await logout();
      }
    };

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void revalidate();
    });
    // Appelé tout de suite avec l'état courant, puis à chaque changement.
    let wasOnline: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((net) => {
      const online = isOnline(net);
      if (online && wasOnline !== true) void revalidate();
      wasOnline = online;
    });

    return () => {
      cancelled = true;
      appState.remove();
      unsubscribeNet();
    };
  }, [needsRevalidation, meStale, modulesStale, sessionToken, logout]);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: !!state.token,
    isLeader: isLeaderRole(state.me),
    isTreasurer: isTreasurerRole(state.me),
    hasGoals: hasGoalsAccess(state.me),
    hasUnit: !!state.me?.donationUnitId,
    modules,
    hasMemberCare: modules.includes('MEMBER_CARE'),
    hasAssembly: modules.includes('ASSEMBLY'),
    hasDonations: modules.includes('DONATIONS'),
    hasEvents: modules.includes('EVENTS'),
    login,
    register,
    loginWithGoogle,
    loginWithApple,
    resetPassword,
    establishSession,
    refreshMe,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
