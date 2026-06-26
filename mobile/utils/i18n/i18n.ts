import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import fr from './locales/fr.json';

/** Clé AsyncStorage de la préférence de langue choisie par l'utilisateur. */
export const LANGUAGE_STORAGE_KEY = 'shephr.lang';

export type AppLanguage = 'fr' | 'en';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: 'fr',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

/** Lit la préférence de langue persistée (null si l'utilisateur n'a jamais choisi). */
export async function getStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const v = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return v === 'fr' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Persiste le choix de langue de l'utilisateur. */
export async function storeLanguage(lang: AppLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

/** Mappe la langue backend ('FR' | 'EN' | ...) vers une langue de l'app. */
export function mapBackendLanguage(lang?: string | null): AppLanguage | null {
  if (!lang) return null;
  const l = lang.trim().toLowerCase();
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('en')) return 'en';
  return null;
}

export default i18n;
