import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Plan 18/10 (§6.3, lot D5) — RETOUR APRÈS CONNEXION, générique.
 *
 * <p>Un lien universel (`/d/{slug}` des Documents ; demain `/e/*` des Évènements, cadrage 14/10 §4)
 * peut arriver sans session, ou sur un compte non rattaché. On mémorise alors la cible ; la
 * connexion, l'inscription et le rattachement (`/join`) la rouvrent au lieu de l'accueil
 * (`utils/authRouting`). Recette §9.2 n°6 : « connexion → retour sur le document ».
 *
 * <p>Persisté (AsyncStorage), parce que le parcours peut traverser un redémarrage (e-mail de
 * confirmation, application tuée), mais BORNÉ : une cible de plus de `TTL_MS` est oubliée — un lien
 * ouvert puis abandonné ne doit pas détourner une connexion du lendemain. Lue UNE fois (`take`).
 *
 * <p>Seuls les chemins de liens universels connus sont acceptés (`RETURNABLE`) : rien d'autre ne
 * peut être rejoué après la connexion. Le chemin garde son `?r=` (D-DOC-11) pour que le journal
 * relie encore l'ouverture au partage d'origine.
 */

const STORAGE_KEY = 'shephr.returnTarget.v1';
const TTL_MS = 60 * 60 * 1000;

/** `/d/{slug}` (Documents) et `/e/{id}` (Évènements, à venir), avec un `?r=` facultatif. */
const RETURNABLE = /^\/(d|e)\/[0-9A-Za-z_-]{1,64}(\?r=[0-9A-Za-z]{1,12})?$/;

interface StoredTarget {
  path: string;
  at: number;
}

let memo: StoredTarget | null = null;

export function isReturnablePath(path: string): boolean {
  return RETURNABLE.test(path);
}

/** Mémorise `path` comme cible à rouvrir après connexion / inscription / rattachement. */
export async function rememberReturnTarget(path: string): Promise<void> {
  if (!isReturnablePath(path)) return;
  memo = { path, at: Date.now() };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memo));
  } catch {
    // Stockage indisponible : la mémoire suffit tant que l'application reste ouverte.
  }
}

/** Oublie la cible (la personne a quitté le lien, ou elle vient d'être rouverte). */
export async function clearReturnTarget(): Promise<void> {
  memo = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien à faire : le TTL finira de l'écarter.
  }
}

/** Renvoie la cible encore valable et l'efface ; null s'il n'y en a pas. */
export async function takeReturnTarget(): Promise<string | null> {
  let target = memo;
  if (!target) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.path === 'string' && typeof parsed.at === 'number') {
        target = parsed as StoredTarget;
      }
    } catch {
      // Illisible : comme s'il n'y avait rien.
    }
  }
  await clearReturnTarget();
  if (!target || Date.now() - target.at > TTL_MS || !isReturnablePath(target.path)) return null;
  return target.path;
}
