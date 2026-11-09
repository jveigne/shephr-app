import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { estHexValide, normaliserHex } from '../theme/couleurs';
import {
  ACCENT_DEFAUT,
  MODES,
  ModeResolu,
  ModeTheme,
  variablesAccent,
} from '../theme/palettes';

/**
 * Thème de l'Espace ministère (`docs/theme-plan.md` §4.3).
 *
 * <p>Tient le choix de l'utilisateur — un mode et un accent — et l'applique au document :
 * `data-theme` sur `<html>` (qui sélectionne le bloc de variables de `styles.css`) et, pour un
 * accent personnalisé, la famille `--accent*` en style sur `<html>`.
 *
 * <p>Le dernier choix est gardé dans `localStorage` (`shephr.theme.v1`), AVEC les variables déjà
 * calculées pour le Clair et le Sombre : le script d'`index.html` les pose avant le premier
 * affichage, sans pouvoir importer `couleurs.ts` (pas de flash, R10). C'est aussi le thème des
 * pages publiques (login, inscription), sinon le thème par défaut (D4). Toute lecture ou écriture
 * est sous `try/catch` : navigation privée, stockage plein.
 *
 * <p>Étape W1 : choix LOCAL seulement. L'écran Apparence arrive à W2, la synchronisation avec le
 * compte (`GET` / `PUT /me/preferences`, envoi en attente — D5, D6) à W4.
 */

export const THEME_STORAGE_KEY = 'shephr.theme.v1';

/** Ce que lit le script d'`index.html` : ne pas renommer un champ sans le script. */
interface Enregistrement {
  mode: ModeTheme;
  accent: string;
  vars: { clair: Record<string, string>; sombre: Record<string, string> };
}

interface ThemeContextValue {
  /** Choix de l'utilisateur, `auto` compris. */
  mode: ModeTheme;
  /** Mode effectivement affiché. */
  modeResolu: ModeResolu;
  /** Accent choisi (`#RRGGBB`), avant ajustement de contraste. */
  accent: string;
  setMode: (mode: ModeTheme) => void;
  setAccent: (accent: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function lire(): { mode: ModeTheme; accent: string } {
  try {
    const brut = localStorage.getItem(THEME_STORAGE_KEY);
    if (brut) {
      const v = JSON.parse(brut) as Partial<Enregistrement>;
      const mode = MODES.includes(v.mode as ModeTheme) ? (v.mode as ModeTheme) : 'clair';
      const accent = v.accent && estHexValide(v.accent) ? normaliserHex(v.accent) : ACCENT_DEFAUT;
      return { mode, accent };
    }
  } catch {
    /* stockage indisponible : thème par défaut */
  }
  // D1 : le Clair reste le défaut tant que l'utilisateur n'a rien choisi.
  return { mode: 'clair', accent: ACCENT_DEFAUT };
}

function enregistrer(mode: ModeTheme, accent: string) {
  const v: Enregistrement = {
    mode,
    accent,
    vars: { clair: variablesAccent('clair', accent), sombre: variablesAccent('sombre', accent) },
  };
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* le thème s'applique quand même pour cette visite */
  }
}

const requeteSombre = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Variables d'accent posées par l'application, à retirer au changement suivant. */
let variablesPosees: string[] = [];

function appliquerAuDocument(modeResolu: ModeResolu, accent: string) {
  const racine = document.documentElement;
  racine.setAttribute('data-theme', modeResolu);
  // Le script d'index.html a pu poser des variables : on repart de zéro.
  for (const nom of variablesPosees) racine.style.removeProperty(nom);
  for (let i = racine.style.length - 1; i >= 0; i--) {
    const nom = racine.style.item(i);
    if (nom.startsWith('--accent') || nom.startsWith('--sur-')) racine.style.removeProperty(nom);
  }
  const vars = variablesAccent(modeResolu, accent);
  for (const [nom, valeur] of Object.entries(vars)) racine.style.setProperty(nom, valeur);
  variablesPosees = Object.keys(vars);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ mode, accent }, setChoix] = useState(lire);
  const [systemeSombre, setSystemeSombre] = useState(() => !!requeteSombre()?.matches);

  // Mode Automatique : suit le réglage du système, en direct.
  useEffect(() => {
    const mq = requeteSombre();
    if (!mq) return;
    const suivre = (e: MediaQueryListEvent) => setSystemeSombre(e.matches);
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, []);

  const modeResolu: ModeResolu = mode === 'auto' ? (systemeSombre ? 'sombre' : 'clair') : mode;

  useEffect(() => {
    appliquerAuDocument(modeResolu, accent);
  }, [modeResolu, accent]);

  const setMode = useCallback(
    (m: ModeTheme) => {
      if (!MODES.includes(m)) return;
      setChoix((c) => {
        enregistrer(m, c.accent);
        return { mode: m, accent: c.accent };
      });
    },
    [],
  );

  const setAccent = useCallback((a: string) => {
    if (!estHexValide(a)) return;
    const hex = normaliserHex(a);
    setChoix((c) => {
      enregistrer(c.mode, hex);
      return { mode: c.mode, accent: hex };
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, modeResolu, accent, setMode, setAccent }),
    [mode, modeResolu, accent, setMode, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
