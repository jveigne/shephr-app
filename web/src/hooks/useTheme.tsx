import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import {
  choixDepuisServeur,
  fetchMyPreferences,
  putMyPreferences,
  versServeur,
  type UserPreferences,
} from '../services/preferencesApi';
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
 * <p>Synchronisation avec le compte (étape W4, mêmes règles que le mobile `contexts/ThemeContext`) :
 * - connecté, le thème du compte s'applique (`me.preferences`, puis `GET /me/preferences`) ; un
 *   compte sans préférence affiche le thème par défaut (D4) ;
 * - seul un choix dans la section Apparence (`components/AppearanceCard`) envoie un `PUT`,
 *   jamais la connexion ni une relecture ;
 * - le choix s'applique tout de suite et l'envoi est mis EN ATTENTE (`localStorage`
 *   `shephr.theme.pending.{userId}`) : tant qu'il l'est, une lecture du serveur ne l'écrase pas —
 *   le serveur gagne sinon, sans comparaison de dates (D5) ; l'attente est levée par un `PUT`
 *   accepté, rejouée au retour du réseau et sur l'onglet, effacée à la déconnexion ;
 * - pas de temps réel : relecture de `GET /me/preferences` quand l'onglet redevient visible
 *   (`visibilitychange`, `focus`), SANS `refreshMe` — il recréerait `me` (D6).
 */

export const THEME_STORAGE_KEY = 'shephr.theme.v1';

/** Envoi en attente (D5), lié au COMPTE et non au navigateur. */
const cleAttente = (userId: string) => `shephr.theme.pending.${userId}`;

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

type Choix = { mode: ModeTheme; accent: string };

function lireCle(cle: string): Choix | null {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return null;
    const v = JSON.parse(brut) as Partial<Enregistrement>;
    const mode = MODES.includes(v.mode as ModeTheme) ? (v.mode as ModeTheme) : 'clair';
    const accent = v.accent && estHexValide(v.accent) ? normaliserHex(v.accent) : ACCENT_DEFAUT;
    return { mode, accent };
  } catch {
    return null; // stockage indisponible ou illisible
  }
}

function lire(): Choix {
  // D1 : le Clair reste le défaut tant que l'utilisateur n'a rien choisi.
  return lireCle(THEME_STORAGE_KEY) ?? { mode: 'clair', accent: ACCENT_DEFAUT };
}

const lireAttente = (userId: string) => lireCle(cleAttente(userId));

function ecrireAttente(userId: string, v: Choix | null) {
  try {
    if (v) localStorage.setItem(cleAttente(userId), JSON.stringify(v));
    else localStorage.removeItem(cleAttente(userId));
  } catch {
    /* sans stockage, l'envoi est seulement tenté une fois */
  }
}

const memeChoix = (a: Choix, b: Choix) => a.mode === b.mode && normaliserHex(a.accent) === normaliserHex(b.accent);

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

  /** Affiche un choix et le garde comme dernier thème du navigateur (pages publiques, D4). */
  const appliquer = useCallback((v: Choix) => {
    enregistrer(v.mode, v.accent);
    setChoix(v);
  }, []);

  // --- Synchronisation avec le compte (W4) -------------------------------------------------
  const { token, me } = useAuth();
  const userId = token ? (me?.id ?? null) : null;
  // Le dernier choix et le compte courant, lus par les fonctions asynchrones sans les recréer.
  const choixRef = useRef<Choix>({ mode, accent });
  choixRef.current = { mode, accent };
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  /** `PUT` d'un choix ; l'attente n'est levée que si elle porte encore CE choix. */
  const envoyer = useCallback(async (id: string, v: Choix) => {
    try {
      await putMyPreferences(versServeur(v));
    } catch {
      return; // hors ligne ou serveur indisponible : reste en attente, rejoué plus tard
    }
    const enAttente = lireAttente(id);
    if (enAttente && memeChoix(enAttente, v)) ecrireAttente(id, null);
  }, []);

  /**
   * D5 : un envoi en attente part en priorité et n'est jamais écrasé ; sinon le serveur gagne.
   * `recues` = préférences déjà lues (celles de `/me`) ; absent, on relit `GET /me/preferences`.
   */
  const synchroniser = useCallback(
    async (id: string, recues?: UserPreferences | null) => {
      const enAttente = lireAttente(id);
      if (enAttente) {
        await envoyer(id, enAttente);
        return;
      }
      let prefs = recues;
      if (prefs === undefined) {
        try {
          prefs = await fetchMyPreferences();
        } catch {
          return; // relecture impossible : le thème affiché reste
        }
      }
      // Session changée, ou choix fait pendant la lecture : la réponse ne vaut plus.
      if (userIdRef.current !== id || lireAttente(id)) return;
      const v = choixDepuisServeur(prefs);
      if (!memeChoix(v, choixRef.current)) appliquer(v);
    },
    [envoyer, appliquer],
  );

  // Connexion, ou `/me` relu : le thème du compte s'applique. `preferences` absent = backend
  // antérieur → `GET`. `clePrefs` résume les préférences : un nouvel objet `me` identique ne
  // relance rien.
  const prefsDeMe = me && 'preferences' in me ? (me.preferences ?? null) : undefined;
  const clePrefs = prefsDeMe === undefined ? 'absent' : JSON.stringify(prefsDeMe);
  const prefsRef = useRef(prefsDeMe);
  prefsRef.current = prefsDeMe;
  useEffect(() => {
    if (!userId) return;
    void synchroniser(userId, prefsRef.current);
  }, [userId, clePrefs, synchroniser]);

  // Déconnexion : l'envoi en attente du compte qui s'en va est effacé (§4.3).
  const compteConnecteRef = useRef<string | null>(null);
  useEffect(() => {
    if (userId) compteConnecteRef.current = userId;
    else if (!token && compteConnecteRef.current) {
      ecrireAttente(compteConnecteRef.current, null);
      compteConnecteRef.current = null;
    }
  }, [userId, token]);

  // D6 : relecture quand l'onglet redevient visible ; au retour du réseau, seul l'envoi en
  // attente part. `focus` et `visibilitychange` arrivent souvent ensemble : une relecture par
  // seconde au plus.
  useEffect(() => {
    if (!userId) return;
    let derniere = 0;
    const relire = () => {
      if (document.visibilityState !== 'visible') return;
      const maintenant = Date.now();
      if (maintenant - derniere < 1000) return;
      derniere = maintenant;
      void synchroniser(userId);
    };
    const rejouer = () => {
      const v = lireAttente(userId);
      if (v) void envoyer(userId, v);
    };
    document.addEventListener('visibilitychange', relire);
    window.addEventListener('focus', relire);
    window.addEventListener('online', rejouer);
    return () => {
      document.removeEventListener('visibilitychange', relire);
      window.removeEventListener('focus', relire);
      window.removeEventListener('online', rejouer);
    };
  }, [userId, synchroniser, envoyer]);

  /** Choix fait dans la section Apparence : appliqué tout de suite, puis envoyé au compte. */
  const choisir = useCallback(
    (v: Choix) => {
      appliquer(v);
      const id = userIdRef.current;
      if (!id) return; // D4 : jamais d'envoi hors connexion
      ecrireAttente(id, v);
      void envoyer(id, v);
    },
    [appliquer, envoyer],
  );

  const setMode = useCallback(
    (m: ModeTheme) => {
      if (!MODES.includes(m)) return;
      choisir({ mode: m, accent: choixRef.current.accent });
    },
    [choisir],
  );

  const setAccent = useCallback(
    (a: string) => {
      if (!estHexValide(a)) return;
      choisir({ mode: choixRef.current.mode, accent: normaliserHex(a) });
    },
    [choisir],
  );

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
