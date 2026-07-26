import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchMe,
  hasMemberSpace,
  hasMinistryAccess,
  login as loginRequest,
  type MeResponse,
  type UserDTO,
} from '../services/authApi';
import { getAuthToken, setAuthToken } from '../services/apiClient';
import { applyUserLanguage } from '../i18n';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: UserDTO | null;
  me: MeResponse | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  /** True when the user may access the Web Espace ministère (dirigeant+ or superAdmin). */
  canAccessWeb: boolean;
  /** Feature A — espace membre minimal « Mes objectifs » (MEMBRE Goals rattaché à une assemblée). */
  canAccessMemberSpace: boolean;
  login: (payload: { email: string; password: string }) => Promise<MeResponse>;
  /** Établit la session à partir d'un token déjà obtenu (ex. acceptation d'invitation). */
  establishSession: (token: string) => Promise<MeResponse>;
  /** Recharge le /me (ex. après approbation d'une demande de rattachement — Feature B). */
  refreshMe: () => Promise<MeResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    ready: false,
    token: null,
    user: null,
    me: null,
  });

  useEffect(() => {
    (async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const me = await fetchMe();
          applyUserLanguage(me.language);
          setState({ ready: true, token, user: null, me });
          return;
        } catch {
          setAuthToken(null);
        }
      }
      setState({ ready: true, token: null, user: null, me: null });
    })();
  }, []);

  const establishSession = useCallback(async (token: string) => {
    // Cache vierge pour le nouvel utilisateur : pas de fuite des données du compte précédent
    // (listes scopées par périmètre — un chef de zone ne doit pas voir le cache d'un coordinateur).
    queryClient.clear();
    setAuthToken(token);
    const me = await fetchMe();
    applyUserLanguage(me.language);
    setState({ ready: true, token, user: null, me });
    return me;
  }, [queryClient]);

  const login = useCallback(async (payload: { email: string; password: string }) => {
    const res = await loginRequest(payload);
    return establishSession(res.token);
  }, [establishSession]);

  const refreshMe = useCallback(async () => {
    const me = await fetchMe();
    applyUserLanguage(me.language);
    setState((s) => ({ ...s, me }));
    return me;
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setState({ ready: true, token: null, user: null, me: null });
    queryClient.clear(); // purge des données scopées de l'utilisateur précédent
  }, [queryClient]);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: !!state.token,
    canAccessWeb: hasMinistryAccess(state.me),
    canAccessMemberSpace: hasMemberSpace(state.me),
    login,
    establishSession,
    refreshMe,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
