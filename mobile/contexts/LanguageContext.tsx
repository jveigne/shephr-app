import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getStoredLanguage,
  storeLanguage,
  mapBackendLanguage,
  type AppLanguage,
} from '../utils/i18n/i18n';

interface LanguageContextType {
  language: string;
  /** Change la langue ET persiste le choix de l'utilisateur. */
  setLanguage: (lang: AppLanguage) => void;
  /**
   * Applique la langue du compte (`me.language`, ex. 'FR'/'EN') uniquement si
   * l'utilisateur n'a pas encore choisi explicitement une langue dans l'app.
   */
  applyAccountLanguage: (backendLang?: string | null) => void;
  t: (key: string, options?: any) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [language, setLanguageState] = useState(i18n.language);
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);

  // Au démarrage : restaure la préférence persistée si elle existe.
  useEffect(() => {
    (async () => {
      const stored = await getStoredLanguage();
      if (stored) {
        setHasExplicitChoice(true);
        if (stored !== i18n.language) {
          await i18n.changeLanguage(stored);
        }
        setLanguageState(stored);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      setHasExplicitChoice(true);
      i18n.changeLanguage(lang);
      setLanguageState(lang);
      void storeLanguage(lang);
    },
    [i18n],
  );

  const applyAccountLanguage = useCallback(
    (backendLang?: string | null) => {
      if (hasExplicitChoice) return; // l'utilisateur a la priorité sur le compte
      const mapped = mapBackendLanguage(backendLang);
      if (mapped && mapped !== i18n.language) {
        i18n.changeLanguage(mapped);
        setLanguageState(mapped);
      }
    },
    [hasExplicitChoice, i18n],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, applyAccountLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
