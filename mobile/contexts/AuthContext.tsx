import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  fetchAccessibleModules,
  fetchMe,
  hasGoalsAccess,
  isLeaderRole,
  login as loginRequest,
  register as registerRequest,
  type AuthResponse,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
  type UserDTO,
} from '../services/authApi';
import { getAuthToken, setAuthToken } from '../services/apiClient';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: UserDTO | null;
  me: MeResponse | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isLeader: boolean;
  hasGoals: boolean;
  hasUnit: boolean;
  /** Modules accessibles (codes) ; alimente le gating de navigation. */
  modules: string[];
  hasMemberCare: boolean;
  /** Renvoie le profil chargé (null si /me a échoué) — permet le routage post-login (Feature B). */
  login: (payload: LoginRequest) => Promise<MeResponse | null>;
  register: (payload: RegisterRequest) => Promise<void>;
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

  const refreshMe = useCallback(async () => {
    try {
      const me = await fetchMe();
      setState((s) => ({ ...s, me }));
    } catch {
      setState((s) => ({ ...s, me: null }));
    }
  }, []);

  // Charge les modules accessibles à chaque changement de session (login/logout/restauration).
  useEffect(() => {
    let active = true;
    if (!state.token) {
      setModules([]);
      return;
    }
    fetchAccessibleModules()
      .then((m) => active && setModules(m))
      .catch(() => active && setModules([]));
    return () => {
      active = false;
    };
  }, [state.token]);

  useEffect(() => {
    (async () => {
      const token = await getAuthToken();
      if (token) {
        try {
          const me = await fetchMe();
          setState({ ready: true, token, user: null, me });
          return;
        } catch {
          await setAuthToken(null);
        }
      }
      setState({ ready: true, token: null, user: null, me: null });
    })();
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await loginRequest(payload);
    await setAuthToken(res.token);
    let me: MeResponse | null = null;
    try {
      me = await fetchMe();
    } catch {
      me = null;
    }
    setState({ ready: true, token: res.token, user: res.user, me });
    return me;
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const res = await registerRequest(payload);
    await setAuthToken(res.token);
    let me: MeResponse | null = null;
    try {
      me = await fetchMe();
    } catch {
      me = null;
    }
    setState({ ready: true, token: res.token, user: res.user, me });
  }, []);

  const establishSession = useCallback(async (res: AuthResponse) => {
    await setAuthToken(res.token);
    let me: MeResponse | null = null;
    try {
      me = await fetchMe();
    } catch {
      me = null;
    }
    setState({ ready: true, token: res.token, user: res.user, me });
  }, []);

  const logout = useCallback(async () => {
    await setAuthToken(null);
    setState({ ready: true, token: null, user: null, me: null });
  }, []);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: !!state.token,
    isLeader: isLeaderRole(state.me),
    hasGoals: hasGoalsAccess(state.me),
    hasUnit: !!state.me?.donationUnitId,
    modules,
    hasMemberCare: modules.includes('MEMBER_CARE'),
    login,
    register,
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
