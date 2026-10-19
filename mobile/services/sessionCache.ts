import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MeResponse } from '@/services/authApi';

/**
 * Lot E6 (plan 14/10, §6.3) — DERNIER PROFIL CONNU de la session (`/me` et modules accessibles),
 * pour qu'un lancement SANS RÉSEAU ne déconnecte pas (RG-ACT-08 : « ça ne bloque jamais »).
 *
 * <p>Un téléphone de terrain voit souvent l'application tuée par le système puis relancée hors
 * ligne. Sans ce cache, `AuthContext` n'avait ni `me` ni modules : écran de connexion — qui exige
 * lui-même le réseau —, plus de tuile « Déclarer une action », et une file hors-ligne qui ne
 * partait plus au retour du réseau.
 *
 * <p>Le cache porte l'id du compte (comme le catalogue de saisie et la file) ET le jeton de la
 * session qui l'a écrit : il n'est relu qu'avec ce jeton-là. Il est écrit après chaque `/me` et
 * chaque `/accessible-modules` réussis, VIDÉ à la déconnexion et avant toute nouvelle session ; et
 * si ce retrait échouait, le jeton suffirait encore à ne jamais prêter le profil d'un compte à la
 * session d'un autre. Il ne sert que tant que le
 * serveur est injoignable : `AuthContext` le revalide au premier retour du réseau ou du premier
 * plan, et le jeton n'est retiré que sur un vrai refus (401 / 403).
 */

const STORAGE_KEY = 'shephr.session.v1';

export interface CachedSession {
  /** Jeton de la session qui a écrit le cache — même stockage que `apiClient`, rien de plus exposé. */
  token: string;
  userId: string;
  me: MeResponse;
  /** null tant qu'aucun `/accessible-modules` n'a réussi pour ce compte. */
  modules: string[] | null;
}

/** Les écritures sont sérialisées : `/me` et les modules arrivent souvent au même instant. */
let chain: Promise<unknown> = Promise.resolve();
function serial(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run.catch(() => undefined);
}

async function read(): Promise<CachedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.token === 'string' &&
      typeof parsed.userId === 'string' &&
      parsed.me &&
      typeof parsed.me.id === 'string'
    ) {
      return {
        token: parsed.token,
        userId: parsed.userId,
        me: parsed.me as MeResponse,
        modules: Array.isArray(parsed.modules) ? parsed.modules : null,
      };
    }
  } catch {
    // Illisible (format changé, stockage corrompu) : comme s'il n'y avait rien.
  }
  return null;
}

async function write(session: CachedSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Stockage plein : le cache n'est qu'un filet, la session en cours n'en dépend pas.
  }
}

/** Session mise en cache par la session `token`, ou null. Attend les écritures en cours. */
export async function readCachedSession(token: string): Promise<CachedSession | null> {
  await chain;
  const cached = await read();
  return cached?.token === token ? cached : null;
}

/**
 * Après chaque `/me` réussi de la session `token`. Un autre compte (ou une autre session) que
 * celui en cache repart sans modules.
 */
export function cacheMe(me: MeResponse, token: string): Promise<void> {
  return serial(async () => {
    const current = await read();
    const same = current?.token === token && current.userId === me.id;
    await write({ token, userId: me.id, me, modules: same ? current.modules : null });
  });
}

/** Après chaque `/accessible-modules` réussi — ignoré si le cache est celui d'une autre session. */
export function cacheModules(token: string, userId: string, modules: string[]): Promise<void> {
  return serial(async () => {
    const current = await read();
    if (current?.token !== token || current.userId !== userId) return;
    await write({ ...current, modules });
  });
}

/** Déconnexion, ou avant de poser le jeton d'une nouvelle session. */
export function clearCachedSession(): Promise<void> {
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // Le cache restant porte le jeton de son ancienne session : il ne sera relu par aucune autre.
    }
  });
}

/** Le serveur a refusé le jeton : la session est finie pour de bon. */
export const isAuthRefusal = (e: any): boolean => {
  const status = e?.response?.status;
  return status === 401 || status === 403;
};

/** Pas de réponse (réseau, délai) ou serveur en panne (5xx) : la session reste, à revalider. */
export const isTransientFailure = (e: any): boolean => {
  const status = e?.response?.status;
  return typeof status !== 'number' || status >= 500;
};
