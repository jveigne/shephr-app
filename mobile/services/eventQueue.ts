import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { createEvent, type EventCreateRequest } from '@/services/eventsApi';
import { toSendFailure, type EventSendFailure } from '@/utils/eventErrors';

/**
 * Lot E6 (plan 14/10, §6.3) — FILE HORS-LIGNE DES DÉCLARATIONS D'ACTION (RG-ACT-08).
 *
 * <p>Règle d'or de la spec : « ça ne bloque jamais ». Une action saisie sans réseau est gardée sur
 * le téléphone, montrée « en attente de synchro » dans « Mes actions », puis envoyée d'elle-même
 * au démarrage, au retour au premier plan, au retour du réseau, et par un nouvel essai différé
 * tant qu'il en reste (`components/EventQueueSync`).
 *
 * <p>Ce qui la rend sûre :
 * <ul>
 *   <li><b>idempotence</b> (RG-EVT-07) : chaque saisie porte un `clientId` tiré UNE fois ; un
 *       élément est toujours rejoué avec le même corps, donc le même `clientId`. Le serveur
 *       renvoie l'évènement déjà enregistré (200) au lieu d'en créer un second — un envoi dont la
 *       réponse s'est perdue peut être rejoué sans doublon ;</li>
 *   <li><b>en cas de doute, l'élément reste</b> (§3.3 du contrat) : il ne sort de la file que
 *       si le serveur l'a enregistré, ou refusé pour une raison qui ne changera pas au rejeu
 *       ({@link classifySendFailure}). Un rejeu est sans danger, une perte ne se rattrape pas ;</li>
 *   <li><b>un refus définitif n'est pas silencieux</b> : l'élément passe dans `rejected`, avec la
 *       raison, jusqu'à ce que la personne l'ait lue et retirée depuis « Mes actions » ;</li>
 *   <li><b>une file par compte</b> : elle porte l'id de son propriétaire. Un autre compte qui se
 *       connecte la trouve VIDÉE ({@link claimEventQueue}, appelé par `AuthContext`), comme le
 *       cache des rubriques de don ; le même compte qui se reconnecte (session expirée, 401) la
 *       retrouve intacte et la rejoue ;</li>
 *   <li><b>jamais sous l'identité d'un autre</b> : un vidage épingle le jeton de l'auteur, et
 *       s'arrête dès que la session change ({@link releaseEventQueue}, appelé par `AuthContext`
 *       AVANT de poser un nouveau jeton) — sur un téléphone partagé, une déconnexion suivie d'une
 *       connexion ne peut pas faire compter l'action de l'un dans l'assemblée de l'autre ;</li>
 *   <li><b>pas de blocage en tête de file</b> : un élément que le serveur refuse pour une raison
 *       qui lui est propre (5xx sur ce seul corps) reste en file, mais les suivants partent
 *       ({@link isGlobalFailure}).</li>
 * </ul>
 *
 * <p>[HYPOTHÈSE §6.3] Seules les CRÉATIONS passent par la file : modifier, supprimer, clôturer
 * exigent le réseau.
 */

const STORAGE_KEY = 'shephr.eventQueue.v1';

/** Surface utile du module natif d'`expo-crypto` (UUID v4 tiré du générateur du système). */
interface NativeCrypto {
  randomUUID(): string;
}

/**
 * Module natif d'`expo-crypto`, chargé SANS jamais lever : `null` dans un binaire construit avant
 * son ajout (dev build périmé, version du store pas encore republiée) et sur Expo web. Importer
 * `expo-crypto` directement appellerait `requireNativeModule` au chargement — et ce module est
 * importé par `AuthContext`, à la racine : c'est toute l'application qui planterait au démarrage.
 */
const nativeCrypto = requireOptionalNativeModule<NativeCrypto>('ExpoCrypto');

/** UUID v4 (RFC 4122 §4.4) à partir de 16 octets aléatoires. */
function uuidV4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * `clientId` d'une saisie (RG-EVT-07) : UUID v4, tiré UNE fois par formulaire et conservé à
 * travers les réessais — c'est lui qui rend le rejeu sans doublon.
 *
 * <p>Ne lève JAMAIS : il est tiré dans le `useState` du formulaire, un échec ferait tomber
 * l'écran de saisie. Par ordre de préférence : `crypto.randomUUID` (web en contexte sûr), le
 * module natif, `crypto.getRandomValues` (disponible même sur Expo web servi en HTTP depuis une IP
 * du réseau local, où `randomUUID` n'existe pas), et en dernier recours `Math.random`. Ce dernier
 * n'est pas cryptographique, mais l'idempotence n'en demande pas tant : la clé n'a qu'à ne pas
 * se répéter parmi les saisies d'un même auteur (le serveur la porte PAR AUTEUR).
 */
export function newEventClientId(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  try {
    if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  } catch {
    // Contexte non sûr ou implémentation partielle : on passe au suivant.
  }
  try {
    if (nativeCrypto) return nativeCrypto.randomUUID();
  } catch {
    // Module présent mais défaillant : on passe au suivant.
  }
  const bytes = new Uint8Array(16);
  try {
    if (typeof webCrypto?.getRandomValues === 'function') {
      webCrypto.getRandomValues(bytes);
      return uuidV4FromBytes(bytes);
    }
  } catch {
    // Idem : dernier recours ci-dessous.
  }
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return uuidV4FromBytes(bytes);
}

/** Une déclaration en attente. Le corps est rejoué TEL QUEL (même `clientId`). */
export interface QueuedEvent {
  request: EventCreateRequest;
  /** Horodatage ISO de la saisie. */
  queuedAt: string;
  /**
   * Instantanés d'affichage pris à la saisie : la ligne « en attente » doit se lire hors ligne,
   * même si le catalogue des types change entre-temps.
   */
  typeName: string;
  typeNameEn: string | null;
  scopeName: string | null;
  /**
   * Dernier échec À REJOUER (envoi direct ou vidage), absent tant qu'aucun envoi n'a été tenté
   * ou si le dernier a manqué faute de réseau. Il dit à « Mes actions » POURQUOI l'élément attend
   * encore — une session expirée (401) demande une reconnexion, pas de la patience.
   */
  lastFailure?: EventSendFailure;
}

/** Une déclaration que le serveur a refusée pour de bon — gardée pour être lue, puis retirée. */
export interface RejectedEvent extends QueuedEvent {
  rejectedAt: string;
  failure: EventSendFailure;
}

interface StoredQueue {
  ownerId: string;
  pending: QueuedEvent[];
  rejected: RejectedEvent[];
}

export interface EventQueueSnapshot {
  /** Compte propriétaire ; null tant que la file n'a pas été réclamée par un compte connecté. */
  ownerId: string | null;
  pending: QueuedEvent[];
  rejected: RejectedEvent[];
  /** Un vidage est en cours. */
  syncing: boolean;
  /** Envois réussis depuis le lancement — « Mes actions » se recharge quand il bouge. */
  syncedCount: number;
}

let snapshot: EventQueueSnapshot = {
  ownerId: null,
  pending: [],
  rejected: [],
  syncing: false,
  syncedCount: 0,
};
const listeners = new Set<() => void>();

function publish(patch: Partial<EventQueueSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/**
 * Les mutations de la file sont SÉRIALISÉES : une saisie qui arrive pendant un vidage ne doit
 * pas écraser, par un lire-modifier-écrire concurrent, le retrait d'un élément tout juste envoyé.
 * Les appels réseau, eux, se font HORS de cette chaîne — sinon une déclaration attendrait la fin
 * d'un envoi lent pour être mise en file.
 */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Écrit la file. L'état est CAPTURÉ avant la première attente : appelé juste après `publish`, il
 * écrit ce que la mutation vient de produire, même si une libération survient pendant l'écriture.
 */
async function persist() {
  if (!snapshot.ownerId) return;
  const stored: StoredQueue = {
    ownerId: snapshot.ownerId,
    pending: snapshot.pending,
    rejected: snapshot.rejected,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Stockage plein ou indisponible : la file reste en mémoire pour la session en cours, et le
    // vidage suivant retentera d'écrire. Rien de mieux à faire sans bloquer la saisie.
  }
}

async function readStored(): Promise<StoredQueue | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.ownerId === 'string' &&
      Array.isArray(parsed.pending) &&
      Array.isArray(parsed.rejected)
    ) {
      return parsed as StoredQueue;
    }
  } catch {
    // Illisible (format changé, stockage corrompu) : traité comme une file vide.
  }
  return null;
}

/** Dernière réclamation en cours : un vidage l'attend, sans quoi il lirait une file pas encore chargée. */
let claiming: Promise<void> = Promise.resolve();

/**
 * Jeton de la session propriétaire, posé par {@link claimEventQueue} avec l'id du compte : les deux
 * viennent du MÊME état de `AuthContext`, ils ne peuvent donc pas se contredire. Un vidage l'épingle
 * sur chaque envoi au lieu de laisser `apiClient` relire le stockage — qui, pendant une connexion,
 * porte déjà le jeton du nouveau compte bien avant que son `/me` ne soit connu. Gardé hors du
 * `snapshot` : un jeton n'a rien à faire dans l'état lu par les écrans.
 */
let ownerToken: string | null = null;

/**
 * Génération de session : incrémentée à chaque {@link releaseEventQueue}. Un vidage la relève à
 * son départ et s'arrête dès qu'elle change ; une réclamation partie avant la libération ne
 * ressuscite pas l'ancien propriétaire.
 */
let generation = 0;

/**
 * Lie la file au compte connecté. **Appelé par `AuthContext` à chaque nouvelle session (`me.id`,
 * jeton).**
 *
 * <p>Même compte que la file stockée : elle est rechargée telle quelle (une session expirée ne
 * perd rien). Autre compte : elle est VIDÉE — ses éléments seraient sinon envoyés sous l'identité
 * du nouveau venu, et rattachés à SES assemblées. Le même compte avec un nouveau jeton
 * (reconnexion) garde sa file et ne fait que changer de jeton.
 */
export function claimEventQueue(userId: string, token: string): Promise<void> {
  const claimedAt = generation;
  claiming = serial(async () => {
    if (generation !== claimedAt) return;
    if (snapshot.ownerId === userId) {
      ownerToken = token;
      return;
    }
    const stored = await readStored();
    // Libérée pendant la lecture (déconnexion) : cette session n'est plus celle de personne.
    if (generation !== claimedAt) return;
    ownerToken = token;
    if (stored && stored.ownerId === userId) {
      publish({ ownerId: userId, pending: stored.pending, rejected: stored.rejected });
      return;
    }
    publish({ ownerId: userId, pending: [], rejected: [] });
    if (stored) {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {
        // Le prochain `persist` l'écrasera de toute façon avec le nouveau propriétaire.
      }
    }
  });
  return claiming;
}

/**
 * Détache la file de la session qui se termine. **Appelé par `AuthContext` à la déconnexion et
 * AVANT de poser le jeton d'une nouvelle session** (connexion, inscription, activation).
 *
 * <p>Synchrone, hors de `serial` : le vidage en cours doit le voir avant son prochain envoi, sans
 * attendre la fin d'une mutation. Seule la MÉMOIRE est vidée : la file stockée reste celle de son
 * propriétaire, qui la retrouvera telle quelle à sa reconnexion ({@link claimEventQueue}). Une
 * mutation déjà lancée a capturé son état avant d'écrire (`persist`) : rien ne se perd.
 */
export function releaseEventQueue(): void {
  generation += 1;
  ownerToken = null;
  publish({ ownerId: null, pending: [], rejected: [] });
}

/**
 * Échec à garder sur l'élément : sans réponse, rien à dire de plus que « en attente » — la
 * personne voit déjà qu'elle est hors ligne.
 */
const retryNote = (failure: EventSendFailure | undefined) =>
  failure && failure.status !== null ? failure : undefined;

/**
 * Met une déclaration en file. Le propriétaire doit être le compte connecté : sinon la promesse
 * est REJETÉE — jamais d'abandon silencieux, l'écran de saisie doit pouvoir le dire.
 *
 * @param failure échec de l'envoi direct qui a conduit ici, s'il y en a eu un — retenu sur
 *                l'élément ({@link QueuedEvent.lastFailure}).
 */
export async function enqueueEvent(
  ownerId: string,
  item: QueuedEvent,
  failure?: EventSendFailure,
): Promise<void> {
  await claiming;
  return serial(async () => {
    if (snapshot.ownerId !== ownerId) throw new Error('EVENT_QUEUE_OWNER_MISMATCH');
    // Une même saisie ne doit jamais occuper deux places (double appui, envoi direct parti en
    // file puis resoumis) : le `clientId` fait foi.
    if (snapshot.pending.some((p) => p.request.clientId === item.request.clientId)) return;
    publish({ pending: [...snapshot.pending, { ...item, lastFailure: retryNote(failure) }] });
    await persist();
  });
}

/** Retire un refus que la personne a lu (« Mes actions »). */
export function dismissRejectedEvent(clientId: string): Promise<void> {
  return serial(async () => {
    publish({ rejected: snapshot.rejected.filter((r) => r.request.clientId !== clientId) });
    await persist();
  });
}

/**
 * Sort d'un échec d'envoi — table du §3.3 du contrat, appliquée à la lettre.
 *
 * <ul>
 *   <li>`reject` (définitif, l'élément sort avec sa raison) : 400 de validation ou
 *       INVALID_SCOPE / INVALID_PERIOD / INVALID_PARAMETER ; 403 UNAUTHORIZED_ACCESS (hors
 *       périmètre) ; 404 (type ou nœud inconnu) ; tout 422 (règle métier) ;</li>
 *   <li>`retry` (l'élément reste) : tout le reste — pas de réponse (réseau, délai), 401 (session
 *       expirée, rejoué après reconnexion du même compte), 403 MODULE_ACCESS_DENIED (abonnement
 *       peut-être suspendu temporairement), 400 « Bad Request » non qualifié, 5xx dont 503
 *       SERVICE_UNAVAILABLE, et tout statut que la table ne cite pas.</li>
 * </ul>
 */
export function classifySendFailure(failure: EventSendFailure): 'reject' | 'retry' {
  const { status, code, validation } = failure;
  if (status === 400) {
    if (validation) return 'reject';
    return code === 'INVALID_SCOPE' || code === 'INVALID_PERIOD' || code === 'INVALID_PARAMETER'
      ? 'reject'
      : 'retry';
  }
  if (status === 403) return code === 'UNAUTHORIZED_ACCESS' ? 'reject' : 'retry';
  if (status === 404 || status === 422) return 'reject';
  return 'retry';
}

/**
 * Réseau utilisable ? `null` (« pas encore déterminé ») vaut OUI : dans le doute on tente
 * l'envoi, que la file rattrape s'il échoue — l'inverse retarderait une déclaration pour rien.
 */
export function isOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Échec qui tient à la SESSION, au réseau ou au serveur tout entier — pas à l'élément : les
 * suivants échoueraient pareil, le vidage s'arrête. Pas de réponse (réseau, délai), 401 (session
 * expirée), 403 à rejouer (MODULE_ACCESS_DENIED : abonnement suspendu), et les pannes de la
 * passerelle ou du service (502, 503 SERVICE_UNAVAILABLE, 504).
 *
 * <p>Tout autre échec à rejouer (500 sur ce seul corps, 400 non qualifié) est propre à
 * l'élément : il reste en file, et le vidage passe au suivant — un corps qui ferait tomber le
 * serveur à chaque essai ne doit pas retenir indéfiniment les déclarations saisies après lui.
 */
export function isGlobalFailure(failure: EventSendFailure): boolean {
  const { status } = failure;
  return (
    status === null ||
    status === 401 ||
    status === 403 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

let flushing: Promise<void> | null = null;

/**
 * Vide la file : envoie les éléments DANS L'ORDRE de saisie, un par un, avec le jeton de leur
 * auteur. Un échec global ({@link isGlobalFailure}) arrête le vidage et laisse le reste pour le
 * prochain déclencheur ; un échec propre à l'élément le laisse en file et passe au suivant. Dans
 * les deux cas l'échec est noté sur l'élément (« Mes actions » dit pourquoi il attend).
 *
 * <p>Un seul vidage à la fois : un second appel pendant le premier reçoit la même promesse (les
 * éléments ajoutés entre-temps sont pris par la boucle, qui relit la file à chaque tour). Une
 * libération ({@link releaseEventQueue}) l'arrête avant l'envoi suivant.
 */
export function flushEventQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    await claiming;
    const startedAt = generation;
    const ownerId = snapshot.ownerId;
    const token = ownerToken;
    if (!ownerId || !token || snapshot.pending.length === 0) return;
    const stillOurs = () => generation === startedAt && snapshot.ownerId === ownerId;
    /** Éléments laissés en file par CE vidage (échec propre à l'élément). */
    const skipped = new Set<string>();
    publish({ syncing: true });
    try {
      for (;;) {
        // Session terminée ou changée pendant le vidage : plus rien ne part.
        if (!stillOurs()) return;
        const next = snapshot.pending.find((p) => !skipped.has(p.request.clientId));
        if (!next) return;
        const clientId = next.request.clientId;
        let failure: EventSendFailure | null = null;
        try {
          await createEvent(next.request, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
          failure = toSendFailure(e);
        }
        if (failure && classifySendFailure(failure) === 'retry') {
          await noteRetry(clientId, failure, stillOurs);
          if (isGlobalFailure(failure)) return;
          skipped.add(clientId);
          continue;
        }
        const refusal = failure;
        await serial(async () => {
          if (!stillOurs()) return;
          const pending = snapshot.pending.filter((p) => p.request.clientId !== clientId);
          if (!refusal) {
            publish({ pending, syncedCount: snapshot.syncedCount + 1 });
          } else {
            const rejected: RejectedEvent = {
              ...next,
              // Le refus définitif dit tout : l'échec à rejouer d'avant n'a plus d'intérêt.
              lastFailure: undefined,
              rejectedAt: new Date().toISOString(),
              failure: refusal,
            };
            publish({ pending, rejected: [...snapshot.rejected, rejected] });
          }
          await persist();
        });
      }
    } finally {
      publish({ syncing: false });
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Note sur l'élément le dernier échec à rejouer — écrit seulement s'il a changé. */
function noteRetry(clientId: string, failure: EventSendFailure, stillOurs: () => boolean) {
  return serial(async () => {
    if (!stillOurs()) return;
    const note = retryNote(failure);
    const item = snapshot.pending.find((p) => p.request.clientId === clientId);
    if (!item) return;
    const before = item.lastFailure;
    if (before?.status === note?.status && before?.code === note?.code) return;
    publish({
      pending: snapshot.pending.map((p) =>
        p.request.clientId === clientId ? { ...p, lastFailure: note } : p,
      ),
    });
    await persist();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Vue d'une file qui n'appartient pas (ou pas encore) au compte affiché. Référence stable. */
const EMPTY_FOR_OTHER_OWNER: EventQueueSnapshot = {
  ownerId: null,
  pending: [],
  rejected: [],
  syncing: false,
  syncedCount: 0,
};

/**
 * La file du compte `userId`, à jour en direct. Une file réclamée par un AUTRE compte (ou pas
 * encore réclamée) se lit vide : rien d'un compte précédent ne s'affiche, même un instant.
 */
export function useEventQueue(userId: string | null | undefined): EventQueueSnapshot {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!userId || current.ownerId !== userId) {
    return EMPTY_FOR_OTHER_OWNER;
  }
  return current;
}
