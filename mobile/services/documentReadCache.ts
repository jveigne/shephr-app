import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicDocument } from '@/services/documentsApi';

/**
 * D-DOC-13 / RG-DOC-08 (plan 18/10, §6.3) — mémoire des documents LUS sur cet appareil, pour la
 * relecture HORS LIGNE.
 *
 * <p>Le PDF complet est mis en cache disque par `react-native-pdf` sous le nom
 * `${slug}-v${version}.pdf` (contrat §5.1) ; ce module garde, à côté, les métadonnées publiques
 * (`PublicDocument` : titre, pages, version) et la DERNIÈRE version complète effectivement chargée.
 * Hors ligne, l'écran repart de là : métadonnées connues + version complète en cache = lecture
 * sans réseau, sans rappeler `/file` (contrat §5.1). En ligne, une version serveur plus récente
 * change le nom de fichier : l'ancien cache n'est plus lu (« l'app invalide son cache par
 * version »).
 *
 * <p>Rien de personnel n'y figure : les métadonnées sont publiques (§4.1). L'accès au texte complet
 * reste gaté par `isAttachedAccount(me)` à la relecture — `me` venant lui-même du dernier profil
 * connu (`services/sessionCache`) quand le réseau manque.
 */

const STORAGE_KEY = 'shephr.documents.read.v1';
/** Borne du nombre de documents mémorisés (les plus récents gardés). */
const MAX_ENTRIES = 50;

export interface ReadDocumentEntry {
  doc: PublicDocument;
  /** Version du PDF complet chargée avec succès sur cet appareil ; null = jamais en entier. */
  fullVersion: number | null;
  at: number;
}

type Store = Record<string, ReadDocumentEntry>;

/** Écritures sérialisées (lecture-modification-écriture), comme `services/sessionCache`. */
let chain: Promise<unknown> = Promise.resolve();
function serial(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run.catch(() => undefined);
}

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  const entries = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Stockage plein : la relecture hors ligne n'est qu'un confort.
  }
}

/** Nom du fichier du cache disque du PDF complet (contrat §5.1 : `${slug}-v${version}`). */
export function fullCacheFileName(slug: string, version: number): string {
  return `${slug}-v${version}.pdf`;
}

export async function getReadDocument(slug: string): Promise<ReadDocumentEntry | null> {
  await chain;
  const store = await readStore();
  return store[slug] ?? null;
}

/** Métadonnées fraîches : la version complète en cache n'est gardée que si elle est la même. */
export function rememberDocument(doc: PublicDocument): Promise<void> {
  return serial(async () => {
    const store = await readStore();
    const prev = store[doc.slug];
    store[doc.slug] = {
      doc,
      fullVersion: prev?.fullVersion === doc.version ? prev.fullVersion : null,
      at: Date.now(),
    };
    await writeStore(store);
  });
}

/** Le PDF complet de `version` vient d'être chargé (donc écrit dans le cache disque). */
export function markFullyCached(slug: string, version: number): Promise<void> {
  return serial(async () => {
    const store = await readStore();
    const prev = store[slug];
    if (!prev || prev.doc.version !== version) return;
    store[slug] = { ...prev, fullVersion: version, at: Date.now() };
    await writeStore(store);
  });
}

/** Le cache disque a disparu (système qui purge `CacheDir`) : on ne le promet plus. */
export function forgetFullCache(slug: string): Promise<void> {
  return serial(async () => {
    const store = await readStore();
    const prev = store[slug];
    if (!prev) return;
    store[slug] = { ...prev, fullVersion: null };
    await writeStore(store);
  });
}
