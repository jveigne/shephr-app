import axios from 'axios';

export const TOKEN_STORAGE_KEY = 'shephr.admin.token';

export const apiClient = axios.create({
  // Empty in dev so the Vite proxy handles `/api/*`; set to the backend URL
  // for prod builds via VITE_API_BASE_URL (see .env.production).
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Endpoints où un 401 signifie « identifiants refusés », pas « session expirée ».
 * Le formulaire appelant doit pouvoir afficher son erreur en place : sans cette liste,
 * un mot de passe erroné saisi depuis /signup (compte déjà existant) éjectait vers /login
 * avant que le formulaire ait pu redemander le mot de passe.
 * `/auth/me` en est volontairement absent : un 401 là-bas EST une session expirée.
 */
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/invitation'];

const isCredentialRequest = (url: string | undefined) =>
  !!url && CREDENTIAL_ENDPOINTS.some((p) => url.includes(p));

/** Notifié par l'AuthProvider, qui seul sait purger l'état React et naviguer sans recharger. */
type SessionExpiredHandler = (from: string) => void;
let onSessionExpired: SessionExpiredHandler | null = null;
export const setSessionExpiredHandler = (h: SessionExpiredHandler | null) => {
  onSessionExpired = h;
};

/** Plusieurs requêtes parallèles peuvent renvoyer 401 ensemble : on n'expire qu'une fois. */
let expiring = false;

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;
    // Sans token, un 401 vient d'un appel anonyme : rien à expirer.
    if (status === 401 && getAuthToken() && !isCredentialRequest(error?.config?.url) && !expiring) {
      expiring = true;
      setAuthToken(null);
      const from = window.location.pathname + window.location.search;
      if (onSessionExpired) {
        onSessionExpired(from);
      } else {
        // Filet de sécurité si le 401 précède le montage de l'AuthProvider.
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    expiring = false; // nouvelle session : on réarme la détection d'expiration
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const getAuthToken = (): string | null => localStorage.getItem(TOKEN_STORAGE_KEY);
