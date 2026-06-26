import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';

const STORAGE_KEY = 'shephr.lang';

function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'fr';
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

/** Persist + switch the active language ('fr' | 'en'). */
export function setLanguage(lng: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  void i18n.changeLanguage(lng);
}

/**
 * Apply the user's preferred language from /me ('FR' | 'EN') only when the user
 * has not explicitly chosen one yet (no stored override).
 */
export function applyUserLanguage(language: 'FR' | 'EN' | null | undefined) {
  if (!language) return;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (stored) return;
  void i18n.changeLanguage(language === 'EN' ? 'en' : 'fr');
}

export default i18n;
