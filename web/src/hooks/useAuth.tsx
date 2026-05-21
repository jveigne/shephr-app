import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  login as loginRequest,
  type MeResponse,
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
  isAdmin: boolean;
  login: (payload: { email: string; password: string }) => Promise<MeResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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
          setState({ ready: true, token, user: null, me });
          return;
        } catch {
          setAuthToken(null);
        }
      }
      setState({ ready: true, token: null, user: null, me: null });
    })();
  }, []);

  const login = useCallback(async (payload: { email: string; password: string }) => {
    const res = await loginRequest(payload);
    setAuthToken(res.token);
    const me = await fetchMe();
    setState({ ready: true, token: res.token, user: res.user, me });
    return me;
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setState({ ready: true, token: null, user: null, me: null });
  }, []);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: !!state.token,
    isAdmin: state.me?.role === 'ADMIN',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
