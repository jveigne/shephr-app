/**
 * Thème de l'application (`docs/theme-plan.md` §4.2).
 *
 * <p>Tient le choix de l'utilisateur — un mode et un accent — et en déduit la palette affichée.
 * Le dernier thème est gardé sur l'appareil (AsyncStorage `app_theme`) : c'est celui des pages
 * publiques (login, inscription), sinon le thème par défaut (D4, décision B2 de JP).
 *
 * <p>Étape M1 : choix LOCAL seulement. La synchronisation avec le compte (`GET` / `PUT
 * /me/preferences`, envoi en attente — D5, D6) arrive à l'étape M5.
 *
 * <p>Le mode `auto` suit le réglage clair / sombre du téléphone (ou du navigateur sur Expo web)
 * et bascule en direct, sans redémarrage. Sur iOS et Android, il demande
 * `userInterfaceStyle: "automatic"` dans `app.json`, donc un nouveau build (§4.2).
 */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { declarerThemeDonnees } from '@/theme/tonsDonnees';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_DEFAUT,
  ModeResolu,
  ModeTheme,
  PaletteTheme,
  construirePalette,
} from '@/theme/palettes';
import { estHexValide, normaliserHex } from '@/theme/couleurs';

export const THEME_KEY = 'app_theme';

const MODES: ModeTheme[] = ['auto', 'clair', 'sombre', 'noirEtBlanc'];

type ThemeContextType = {
  /** Palette à utiliser dans les styles : `couleurs.texte`, `couleurs.accent`… */
  couleurs: PaletteTheme;
  /** Choix de l'utilisateur, `auto` compris. */
  mode: ModeTheme;
  /** Mode effectivement affiché. */
  modeResolu: ModeResolu;
  /** Accent choisi (`#RRGGBB`), avant ajustement de contraste. */
  accent: string;
  /** `true` quand le fond est sombre : barre d'état claire, flou sombre. */
  estSombre: boolean;
  /** `false` tant que le thème enregistré n'est pas relu : évite un flash de mauvais thème. */
  pret: boolean;
  setMode: (mode: ModeTheme) => void;
  setAccent: (accent: string) => void;
};

/** Valeurs hors fournisseur : le Clair d'aujourd'hui, pour un composant monté isolément. */
const DEFAUT: ThemeContextType = {
  couleurs: construirePalette('clair'),
  mode: 'clair',
  modeResolu: 'clair',
  accent: ACCENT_DEFAUT,
  estSombre: false,
  pret: true,
  setMode: () => {},
  setAccent: () => {},
};

const ThemeContext = createContext<ThemeContextType>(DEFAUT);

type Enregistrement = { mode: ModeTheme; accent: string };

function lire(brut: string | null): Enregistrement | null {
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as Partial<Enregistrement>;
    const mode = MODES.includes(v.mode as ModeTheme) ? (v.mode as ModeTheme) : 'clair';
    const accent = v.accent && estHexValide(v.accent) ? normaliserHex(v.accent) : ACCENT_DEFAUT;
    return { mode, accent };
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systeme = useColorScheme();
  // D1 : le Clair reste le défaut tant que l'utilisateur n'a rien choisi.
  const [mode, setModeEtat] = useState<ModeTheme>('clair');
  const [accent, setAccentEtat] = useState<string>(ACCENT_DEFAUT);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((brut) => {
        const v = lire(brut);
        if (v) {
          setModeEtat(v.mode);
          setAccentEtat(v.accent);
        }
      })
      .catch(() => {})
      .finally(() => setPret(true));
  }, []);

  const enregistrer = useCallback((v: Enregistrement) => {
    AsyncStorage.setItem(THEME_KEY, JSON.stringify(v)).catch(() => {});
  }, []);

  const setMode = useCallback(
    (m: ModeTheme) => {
      if (!MODES.includes(m)) return;
      setModeEtat(m);
      enregistrer({ mode: m, accent });
    },
    [accent, enregistrer],
  );

  const setAccent = useCallback(
    (a: string) => {
      if (!estHexValide(a)) return;
      const hex = normaliserHex(a);
      setAccentEtat(hex);
      enregistrer({ mode, accent: hex });
    },
    [mode, enregistrer],
  );

  const modeResolu: ModeResolu = mode === 'auto' ? (systeme === 'dark' ? 'sombre' : 'clair') : mode;
  const couleurs = useMemo(() => construirePalette(modeResolu, accent), [modeResolu, accent]);
  // Tons des catégories et statuts (D8) : déclarés avant le rendu des enfants.
  declarerThemeDonnees(modeResolu, couleurs);

  const valeur = useMemo<ThemeContextType>(
    () => ({
      couleurs,
      mode,
      modeResolu,
      accent,
      estSombre: modeResolu === 'sombre',
      pret,
      setMode,
      setAccent,
    }),
    [couleurs, mode, modeResolu, accent, pret, setMode, setAccent],
  );

  return <ThemeContext.Provider value={valeur}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
