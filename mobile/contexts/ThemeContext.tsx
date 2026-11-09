/**
 * Thème de l'application (`docs/theme-plan.md` §4.2).
 *
 * <p>Tient le choix de l'utilisateur — un mode et un accent — et en déduit la palette affichée.
 * Le dernier thème est gardé sur l'appareil (AsyncStorage `app_theme`) : c'est celui des pages
 * publiques (login, inscription), sinon le thème par défaut (D4, décision B2 de JP).
 *
 * <p>Synchronisation avec le compte (étape M5) — un choix fait ici se retrouve sur le web, et
 * inversement :
 * - connecté, le thème du compte s'applique (`me.preferences`, puis `GET /me/preferences`) ; un
 *   compte sans préférence affiche le thème par défaut (D4) ;
 * - seul un choix dans l'écran Apparence envoie un `PUT`, jamais la connexion ni une relecture ;
 * - le choix s'applique tout de suite et l'envoi est mis EN ATTENTE (AsyncStorage
 *   `app_theme_pending.{userId}`) : tant qu'il l'est, une lecture du serveur ne l'écrase pas — le
 *   serveur gagne sinon, sans comparaison de dates (D5) ; l'attente est levée par un `PUT`
 *   accepté, rejouée au retour du réseau et au premier plan, effacée à la déconnexion ;
 * - pas de temps réel : relecture `GET /me/preferences` au retour au premier plan (D6). Elle vit
 *   ici plutôt que dans `AuthContext` (écart au §4.2) : `AuthContext` ne relit `/me` au premier
 *   plan que pour une session servie par le cache, et le thème n'a besoin que de ses préférences.
 *
 * <p>Le mode `auto` suit le réglage clair / sombre du téléphone (ou du navigateur sur Expo web)
 * et bascule en direct, sans redémarrage. Sur iOS et Android, il demande
 * `userInterfaceStyle: "automatic"` dans `app.json`, donc un nouveau build (§4.2).
 */
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/contexts/AuthContext';
import { isOnline } from '@/services/eventQueue';
import {
  choixDepuisServeur,
  fetchMyPreferences,
  putMyPreferences,
  versServeur,
  type UserPreferences,
} from '@/services/preferencesApi';
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

/** Envoi en attente (D5), lié au COMPTE et non à l'appareil. */
const cleAttente = (userId: string) => `app_theme_pending.${userId}`;

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

const memeChoix = (a: Enregistrement, b: Enregistrement) =>
  a.mode === b.mode && normaliserHex(a.accent) === normaliserHex(b.accent);

async function lireAttente(userId: string): Promise<Enregistrement | null> {
  try {
    return lire(await AsyncStorage.getItem(cleAttente(userId)));
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

  /** Affiche un choix et le garde comme dernier thème de l'appareil (pages publiques, D4). */
  const appliquer = useCallback(
    (v: Enregistrement) => {
      setModeEtat(v.mode);
      setAccentEtat(v.accent);
      enregistrer(v);
    },
    [enregistrer],
  );

  // --- Synchronisation avec le compte (M5) -------------------------------------------------
  const { token, me } = useAuth();
  const userId = token ? (me?.id ?? null) : null;
  // Le dernier choix et le compte courant, lus par les fonctions asynchrones sans les recréer.
  const choixRef = useRef<Enregistrement>({ mode, accent });
  choixRef.current = { mode, accent };
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  /** `PUT` d'un choix ; l'attente n'est levée que si elle porte encore CE choix. */
  const envoyer = useCallback(async (id: string, v: Enregistrement) => {
    try {
      await putMyPreferences(versServeur(v));
    } catch {
      return; // hors ligne ou serveur indisponible : reste en attente, rejoué plus tard
    }
    const enAttente = await lireAttente(id);
    if (enAttente && memeChoix(enAttente, v)) {
      await AsyncStorage.removeItem(cleAttente(id)).catch(() => {});
    }
  }, []);

  /**
   * D5 : un envoi en attente part en priorité et n'est jamais écrasé ; sinon le serveur gagne.
   * `recues` = préférences déjà lues (celles de `/me`) ; absent, on relit `GET /me/preferences`.
   */
  const synchroniser = useCallback(
    async (id: string, recues?: UserPreferences | null) => {
      const enAttente = await lireAttente(id);
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
      if (userIdRef.current !== id || (await lireAttente(id))) return;
      const v = choixDepuisServeur(prefs);
      if (!memeChoix(v, choixRef.current)) appliquer(v);
    },
    [envoyer, appliquer],
  );

  // Connexion, ou `/me` relu : le thème du compte s'applique (après la lecture de l'appareil,
  // sinon celle-ci l'écraserait). `preferences` absent = backend antérieur → `GET`.
  const prefsDeMe = me && 'preferences' in me ? (me.preferences ?? null) : undefined;
  const clePrefs = prefsDeMe === undefined ? 'absent' : JSON.stringify(prefsDeMe);
  useEffect(() => {
    if (!pret || !userId) return;
    void synchroniser(userId, prefsDeMe);
    // `clePrefs` résume `prefsDeMe` : un nouvel objet `me` identique ne relance rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, userId, clePrefs, synchroniser]);

  // Déconnexion : l'envoi en attente du compte qui s'en va est effacé (§4.2).
  const compteConnecteRef = useRef<string | null>(null);
  useEffect(() => {
    if (userId) compteConnecteRef.current = userId;
    else if (!token && compteConnecteRef.current) {
      void AsyncStorage.removeItem(cleAttente(compteConnecteRef.current)).catch(() => {});
      compteConnecteRef.current = null;
    }
  }, [userId, token]);

  // D6 : relecture au retour au premier plan ; au retour du réseau, seul l'envoi en attente part.
  useEffect(() => {
    if (!userId) return;
    const etatApp = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void synchroniser(userId);
    });
    let enLigne: boolean | null = null;
    const desabonner = NetInfo.addEventListener((net) => {
      const online = isOnline(net);
      if (online && enLigne === false) {
        void lireAttente(userId).then((v) => v && envoyer(userId, v));
      }
      enLigne = online;
    });
    return () => {
      etatApp.remove();
      desabonner();
    };
  }, [userId, synchroniser, envoyer]);

  /** Choix fait dans l'écran Apparence : appliqué tout de suite, puis envoyé au compte. */
  const choisir = useCallback(
    async (v: Enregistrement) => {
      appliquer(v);
      const id = userIdRef.current;
      if (!id) return; // D4 : jamais d'envoi hors connexion
      await AsyncStorage.setItem(cleAttente(id), JSON.stringify(v)).catch(() => {});
      await envoyer(id, v);
    },
    [appliquer, envoyer],
  );

  const setMode = useCallback(
    (m: ModeTheme) => {
      if (!MODES.includes(m)) return;
      void choisir({ mode: m, accent: choixRef.current.accent });
    },
    [choisir],
  );

  const setAccent = useCallback(
    (a: string) => {
      if (!estHexValide(a)) return;
      void choisir({ mode: choixRef.current.mode, accent: normaliserHex(a) });
    },
    [choisir],
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
