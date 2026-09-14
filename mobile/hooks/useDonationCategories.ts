import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  listDonationCategories,
  type DonationCategoryResponse,
} from '../services/donationCategoriesApi';
import { useLanguage } from '../contexts/LanguageContext';
import {
  donationCategoryMeta,
  type DonationCategoryMeta,
} from '../constants/categories';

/**
 * Lot T5 (JP 14/09) — RUBRIQUES DE DON : fetch + cache local.
 *
 * <p>Remplace la liste en dur de `constants/categories.ts`. Le référentiel est désormais serveur
 * (une liste par ministère, décision D0-5) : il peut donc contenir des rubriques créées par le
 * secrétariat, et ses libellés existent en français ET en anglais.
 *
 * <p>Pattern du dépôt : `useState` + `useFocusEffect`, comme `hooks/useGoalsData.ts` — **pas de
 * react-query côté mobile**. Les particularités tiennent à ce que ce hook est aussi appelé par des
 * composants de LISTE (`DonationRow`), pas seulement par des écrans :
 * <ul>
 *   <li><b>cache mémoire partagé</b> : trente lignes montées d'un coup lisent la même liste ;</li>
 *   <li><b>déduplication des requêtes en vol</b> : elles déclenchent UNE requête, pas trente ;</li>
 *   <li><b>fenêtre anti-rafale</b> : un retour au premier plan ne relance au plus qu'un appel ;</li>
 *   <li><b>cache AsyncStorage</b> : au lancement suivant, l'écran « Déclarer » s'affiche peuplé
 *       avant même la réponse réseau — et reste utilisable hors ligne.</li>
 * </ul>
 */

const CACHE_KEY = 'shephr.donationCategories.v1';
/** Un retour au premier plan dans cette fenêtre ne redéclenche pas d'appel. */
const MIN_REFRESH_MS = 60_000;

let memoryCache: DonationCategoryResponse[] | null = null;
let hydratedFromStorage = false;
let lastFetchAt = 0;
let inFlight: Promise<DonationCategoryResponse[]> | null = null;
const listeners = new Set<(value: DonationCategoryResponse[]) => void>();

function publish(value: DonationCategoryResponse[]) {
  memoryCache = value;
  listeners.forEach((l) => l(value));
}

/**
 * Vide le cache. **Appelé à chaque changement de session** (`AuthContext`) : la liste est scopée
 * au ministère du compte — la garder d'un utilisateur à l'autre ferait voir au suivant les
 * rubriques du ministère précédent.
 */
export function resetDonationCategoriesCache() {
  memoryCache = null;
  hydratedFromStorage = false;
  lastFetchAt = 0;
  inFlight = null;
  listeners.forEach((l) => l([]));
  void AsyncStorage.removeItem(CACHE_KEY);
}

async function hydrateFromStorage() {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw || memoryCache) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) publish(parsed as DonationCategoryResponse[]);
  } catch {
    // Cache illisible (format changé, stockage corrompu) : il n'est qu'une optimisation.
  }
}

async function fetchNow(): Promise<DonationCategoryResponse[]> {
  if (inFlight) return inFlight;
  inFlight = listDonationCategories()
    .then((list) => {
      lastFetchAt = Date.now();
      publish(list);
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list)).catch(() => undefined);
      return list;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export interface DonationCategoriesData {
  /** Rubriques ACTIVES du ministère, dans l'ordre voulu par le serveur. */
  categories: DonationCategoryResponse[];
  /** Vrai tant qu'aucune liste (même de cache) n'est disponible. */
  loading: boolean;
  /** L'appel a échoué ET aucun cache n'a pris le relais. */
  error: boolean;
  /** Libellé à afficher pour un code — langue courante, repli documenté. */
  labelOf: (code: string | null | undefined) => string;
  /** Icône et ton d'un code (donnée d'affichage locale, jamais servie par l'API). */
  metaOf: (code: string | null | undefined) => DonationCategoryMeta;
  reload: () => Promise<void>;
}

export function useDonationCategories(): DonationCategoriesData {
  const { t } = useLanguage();
  const isEnglish = useIsEnglish();
  const [categories, setCategories] = useState<DonationCategoryResponse[]>(memoryCache ?? []);
  const [loading, setLoading] = useState(memoryCache === null);
  const [error, setError] = useState(false);

  // Abonnement au cache partagé : toutes les instances montées voient la même liste.
  useEffect(() => {
    const listener = (value: DonationCategoryResponse[]) => setCategories(value);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const load = useCallback(async (force: boolean) => {
    await hydrateFromStorage();
    if (memoryCache) {
      setCategories(memoryCache);
      setLoading(false);
    }
    if (!force && Date.now() - lastFetchAt < MIN_REFRESH_MS && memoryCache) {
      return;
    }
    try {
      await fetchNow();
      setError(false);
    } catch {
      // Le cache (mémoire ou disque) reste affiché : une coupure réseau ne doit pas vider
      // l'écran de déclaration. On ne signale l'erreur que s'il n'y a rien à montrer.
      setError(memoryCache === null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  /**
   * Libellé d'un code, dans l'ordre : (1) le référentiel serveur, langue courante ; (2) la
   * traduction livrée pour les 6 rubriques d'origine — utile pour un don HISTORIQUE dont la
   * rubrique a depuis été désactivée, donc absente de la liste ; (3) le code brut, faute de mieux.
   * Jamais de vide : un don sans libellé serait illisible.
   */
  const labelOf = useCallback(
    (code: string | null | undefined) => {
      if (!code) return '';
      const normalized = code.trim().toLowerCase();
      const found = categories.find((c) => c.code === normalized);
      if (found) return (isEnglish && found.nameEn) || found.name;
      const key = `categories.${normalized}`;
      const translated = t(key);
      return translated === key ? code : translated;
    },
    [categories, isEnglish, t],
  );

  return {
    categories,
    loading,
    error,
    labelOf,
    metaOf: donationCategoryMeta,
    reload: () => load(true),
  };
}

/** Langue d'affichage courante — `language` du contexte, seule source de vérité (cf. LanguageContext). */
function useIsEnglish(): boolean {
  const { language } = useLanguage();
  return (language ?? '').toLowerCase().startsWith('en');
}
