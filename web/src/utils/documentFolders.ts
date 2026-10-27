import {
  categoryLabel,
  type DocumentCategoryItem,
  type DocumentListItem,
} from '../services/documentsApi';

/**
 * D-DOC-16 (JP 19/10) — DOSSIERS de l'espace Documents (port exact de `mobile/utils/documentFolders.ts`,
 * D-WEB-03 JP 27/10) : les catégories deviennent des dossiers
 * hiérarchiques (comme Drive, 3 niveaux max, par ministère). Le serveur renvoie une liste PLATE
 * (`parentId`) ; l'arbre se construit ici, à partir des dossiers ET des documents visibles.
 *
 * <p>Règles d'affichage :
 *  - un dossier n'apparaît QUE s'il contient, lui ou un descendant, au moins un document visible
 *    pour la personne (la liste des documents est déjà filtrée par le serveur, RG-FOLDER-02) ;
 *  - `count` = nombre de documents du dossier ET de ses descendants ;
 *  - un document dont le dossier est absent de la liste (désactivé entre-temps) est rangé « sans
 *    dossier » à la racine, pour ne jamais disparaître ; de même, un dossier dont le parent est
 *    absent remonte à la racine.
 */
export interface FolderNode {
  id: string;
  label: string;
  parentId: string | null;
  displayOrder: number;
  /** Sous-dossiers NON VIDES, triés (ordre d'affichage puis libellé). */
  children: FolderNode[];
  /** Documents directement dans ce dossier, dans l'ordre reçu du serveur. */
  docs: DocumentListItem[];
  /** Documents du dossier et de ses descendants. */
  count: number;
}

export interface FolderTree {
  /** Dossiers racines non vides. */
  roots: FolderNode[];
  /** Documents « sans dossier » (ou dont le dossier n'est plus actif). */
  unfiled: DocumentListItem[];
  /** Tous les dossiers NON VIDES, par id. */
  byId: Map<string, FolderNode>;
}

/** Garde-fou : le serveur borne à 3 niveaux ; au-delà (donnée corrompue, cycle), on coupe. */
const MAX_DEPTH = 8;

export function buildFolderTree(
  categories: DocumentCategoryItem[],
  docs: DocumentListItem[],
  language: string,
): FolderTree {
  const all = new Map<string, FolderNode>();
  for (const c of categories) {
    all.set(c.id, {
      id: c.id,
      label: categoryLabel(c.name, c.nameEn, language) ?? c.name,
      parentId: c.parentId,
      displayOrder: c.displayOrder,
      children: [],
      docs: [],
      count: 0,
    });
  }

  const unfiled: DocumentListItem[] = [];
  for (const d of docs) {
    const folder = d.categoryId ? all.get(d.categoryId) : undefined;
    if (folder) folder.docs.push(d);
    else unfiled.push(d);
  }

  // Rattachement parent → enfants ; parent inconnu (ou lui-même) → racine.
  const rawRoots: FolderNode[] = [];
  for (const node of all.values()) {
    const parent = node.parentId && node.parentId !== node.id ? all.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else rawRoots.push(node);
  }

  const byId = new Map<string, FolderNode>();
  const visited = new Set<string>();
  // Compte récursif + élagage des dossiers vides, avec garde de cycle.
  const prune = (node: FolderNode, depth: number): FolderNode | null => {
    if (visited.has(node.id) || depth > MAX_DEPTH) return null;
    visited.add(node.id);
    const kept = node.children
      .map((child) => prune(child, depth + 1))
      .filter((child): child is FolderNode => child !== null);
    node.children = sortFolders(kept);
    node.count = node.docs.length + kept.reduce((sum, child) => sum + child.count, 0);
    if (node.count === 0) return null;
    byId.set(node.id, node);
    return node;
  };

  const roots = sortFolders(
    rawRoots.map((node) => prune(node, 1)).filter((node): node is FolderNode => node !== null),
  );
  return { roots, unfiled, byId };
}

function sortFolders(nodes: FolderNode[]): FolderNode[] {
  return [...nodes].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label),
  );
}

/** Chemin d'un dossier, de la racine jusqu'à lui inclus (vide si le dossier n'est pas affiché). */
export function folderPath(tree: FolderTree, folderId: string | null | undefined): FolderNode[] {
  const path: FolderNode[] = [];
  let current = folderId ? tree.byId.get(folderId) : undefined;
  while (current && path.length <= MAX_DEPTH) {
    path.unshift(current);
    current = current.parentId ? tree.byId.get(current.parentId) : undefined;
  }
  return path;
}
