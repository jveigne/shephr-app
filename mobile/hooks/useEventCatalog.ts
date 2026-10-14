import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMyEventScopes,
  listEventTypes,
  type EventScopesResponse,
  type EventTypeDto,
} from '../services/eventsApi';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Lot E6 (plan 14/10, §6.3) — CATALOGUE DE SAISIE D'UNE ACTION : types (`GET /types`) et nœuds
 * de déclaration (`GET /me/scopes`), en cache mémoire + AsyncStorage.
 *
 * <p>Sur le modèle de `hooks/useDonationCategories.ts` (`useState` + `useFocusEffect`, pas de
 * react-query côté mobile ; cache mémoire partagé, requêtes en vol dédupliquées, fenêtre
 * anti-rafale, cache disque). Le but est le même que la file hors-ligne : RG-ACT-08, la saisie
 * fonctionne SANS RÉSEAU. Les nœuds sont mis en cache au même titre que les types — sans eux, le
 * formulaire ne saurait ni dire « Cette action sera enregistrée pour … », ni proposer le sélecteur.
 *
 * <p>Une différence voulue avec les rubriques de don : le cache disque porte l'id du COMPTE qui l'a
 * rempli, et n'est relu que par ce compte. Il survit donc à un redémarrage de l'application — ce
 * qui permet de déclarer hors ligne dès l'ouverture — sans jamais montrer à un compte les types ou
 * les assemblées d'un autre (les types sont propres au ministère, les nœuds au périmètre).
 */

/** Un retour au premier plan dans cette fenêtre ne redéclenche pas d'appel. */
const MIN_REFRESH_MS = 60_000;

interface Stored<T> {
  ownerId: string;
  value: T;
}

interface OwnedCache<T> {
  /** Données du compte `ownerId` : mémoire, puis disque, puis réseau. */
  load: (ownerId: string, force: boolean) => Promise<void>;
  read: (ownerId: string) => T | null;
  subscribe: (listener: () => void) => () => void;
  /** Oublie tout (mémoire ET disque) — changement de compte. */
  purge: () => Promise<void>;
}

function createOwnedCache<T>(storageKey: string, fetcher: () => Promise<T>): OwnedCache<T> {
  let memory: Stored<T> | null = null;
  let hydratedFor: string | null = null;
  let lastFetchAt = 0;
  let inFlight: { ownerId: string; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function hydrate(ownerId: string) {
    if (hydratedFor === ownerId) return;
    hydratedFor = ownerId;
    if (memory?.ownerId === ownerId) return;
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stored<T>;
      // Écrit par un autre compte : ignoré (et écrasé au prochain appel réussi).
      if (parsed?.ownerId === ownerId && memory?.ownerId !== ownerId) {
        memory = parsed;
        notify();
      }
    } catch {
      // Cache illisible : il n'est qu'une optimisation.
    }
  }

  function fetchNow(ownerId: string): Promise<void> {
    if (inFlight?.ownerId === ownerId) return inFlight.promise;
    const promise = fetcher()
      .then((value) => {
        // Le compte a changé pendant l'appel : la réponse ne lui appartient pas.
        if (hydratedFor !== ownerId) return;
        memory = { ownerId, value };
        lastFetchAt = Date.now();
        notify();
        void AsyncStorage.setItem(storageKey, JSON.stringify(memory)).catch(() => undefined);
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { ownerId, promise };
    return promise;
  }

  return {
    async load(ownerId, force) {
      await hydrate(ownerId);
      const fresh = memory?.ownerId === ownerId && Date.now() - lastFetchAt < MIN_REFRESH_MS;
      if (!force && fresh) return;
      await fetchNow(ownerId);
    },
    read(ownerId) {
      return memory?.ownerId === ownerId ? memory.value : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async purge() {
      memory = null;
      hydratedFor = null;
      lastFetchAt = 0;
      inFlight = null;
      notify();
      try {
        await AsyncStorage.removeItem(storageKey);
      } catch {
        // Le cache disque reste tagué de son ancien propriétaire : il ne sera relu par personne d'autre.
      }
    },
  };
}

const typesCache = createOwnedCache<EventTypeDto[]>('shephr.eventTypes.v1', listEventTypes);
const scopesCache = createOwnedCache<EventScopesResponse>('shephr.eventScopes.v1', getMyEventScopes);

/** Compte propriétaire des caches disque : on ne purge que sur un VRAI changement de compte. */
const OWNER_KEY = 'shephr.eventCatalogOwner.v1';

/**
 * Réclamation en cours : tout chargement l'attend, sans quoi un préchargement parti au même
 * instant remplirait le cache… juste avant que la purge ne le vide.
 */
let catalogClaim: Promise<void> = Promise.resolve();

/**
 * Lie le catalogue au compte connecté — **appelé par `AuthContext` à chaque nouveau `me.id`**, avec
 * `claimEventQueue`. Un autre compte que le dernier : caches mémoire et disque vidés.
 */
export function claimEventCatalog(userId: string): Promise<void> {
  catalogClaim = catalogClaim.then(() => claimNow(userId));
  return catalogClaim;
}

async function claimNow(userId: string): Promise<void> {
  let previous: string | null = null;
  try {
    previous = await AsyncStorage.getItem(OWNER_KEY);
  } catch {
    previous = null;
  }
  if (previous === userId) return;
  await Promise.all([typesCache.purge(), scopesCache.purge()]);
  try {
    await AsyncStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Au pire, la purge se refera au prochain lancement : elle est sans conséquence.
  }
}

/**
 * Préchargement en arrière-plan (`components/EventQueueSync`) : le catalogue est en mémoire avant
 * que le réseau ne tombe, même si l'écran de saisie n'a encore jamais été ouvert.
 */
export function prefetchEventCatalog(userId: string): void {
  // Réclamer d'abord (sans effet si `userId` est déjà propriétaire) : l'appelant peut passer
  // avant `AuthContext`.
  void claimEventCatalog(userId).then(() =>
    Promise.allSettled([typesCache.load(userId, false), scopesCache.load(userId, false)]),
  );
}

export interface EventCatalog {
  /** Types ACTIFS du ministère, dans l'ordre du catalogue. `[]` aussi tant que rien n'est chargé. */
  types: EventTypeDto[];
  /** null tant qu'aucune réponse (même de cache) n'est disponible. */
  scopes: EventScopesResponse | null;
  /** Vrai tant qu'aucune donnée (même de cache) n'est disponible. */
  loading: boolean;
  /** Le dernier appel a échoué ET aucun cache n'a pris le relais. */
  error: boolean;
  /** Vrai si l'on affiche un cache faute d'avoir pu joindre le serveur. */
  stale: boolean;
  /** Libellé d'un type dans la langue courante (RG-EVT-01 : `nameEn` null → `name`). */
  typeLabel: (type: Pick<EventTypeDto, 'name' | 'nameEn'>) => string;
  reload: () => Promise<void>;
}

/**
 * @param userId compte connecté (`me.id`) — passé par l'écran plutôt que lu ici : `AuthContext`
 *               importe déjà ce module (`claimEventCatalog`), le relire créerait un cycle.
 */
export function useEventCatalog(userId: string | null | undefined): EventCatalog {
  const isEnglish = useIsEnglish();
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Abonnement aux caches partagés : toutes les instances montées voient les mêmes données.
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const offTypes = typesCache.subscribe(bump);
    const offScopes = scopesCache.subscribe(bump);
    return () => {
      offTypes();
      offScopes();
    };
  }, []);

  const load = useCallback(
    async (force: boolean) => {
      if (!userId) {
        setLoading(false);
        return;
      }
      await catalogClaim;
      const results = await Promise.allSettled([
        typesCache.load(userId, force),
        scopesCache.load(userId, force),
      ]);
      setFailed(results.some((r) => r.status === 'rejected'));
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const types = userId ? typesCache.read(userId) : null;
  const scopes = userId ? scopesCache.read(userId) : null;
  const complete = types !== null && scopes !== null;

  const typeLabel = useCallback(
    (type: Pick<EventTypeDto, 'name' | 'nameEn'>) => (isEnglish && type.nameEn) || type.name,
    [isEnglish],
  );

  return {
    types: types ?? [],
    scopes,
    loading: loading && !complete,
    // Une coupure réseau ne vide pas l'écran : on ne signale l'erreur que s'il manque quelque chose.
    error: failed && !complete,
    stale: failed && complete,
    typeLabel,
    reload: () => load(true),
  };
}

/** Langue d'affichage courante — `language` du contexte, seule source de vérité (cf. LanguageContext). */
function useIsEnglish(): boolean {
  const { language } = useLanguage();
  return (language ?? '').toLowerCase().startsWith('en');
}
