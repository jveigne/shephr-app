import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// « localhost » ne pointe vers la machine de dev que sur simulateur iOS / web.
// Sur appareil physique (Expo Go) ou émulateur Android, on dérive l'IP du Mac
// depuis le serveur Metro (hostUri, ex. "192.168.1.42:8081") en gardant le port 8080.
function resolveApiUrl(): string {
  const configured = (Constants.expoConfig?.extra as any)?.API_URL as string | undefined;
  if (configured && !configured.includes('localhost')) return configured;
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
    return `http://${devHost}:8080`;
  }
  return configured ?? 'http://localhost:8080';
}

const API_URL = resolveApiUrl();

export const TOKEN_STORAGE_KEY = 'shephr.auth.token';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function setAuthToken(token: string | null) {
  if (token) {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}
