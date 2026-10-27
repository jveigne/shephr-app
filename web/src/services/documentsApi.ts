import { apiClient, getAuthToken } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Documents — lecteur public par lien universel (plan du 18/10, lot D4 — §6.2) et, depuis le lot
//  pro-plan PP-W3, espace Documents + lecture complète (plan du 27/10).
//  Contrat de référence : cmfipraise-backend/docs/shephr/18_10_2026/02_Contrat_API_Documents.md (§4, §5)
//  + 03_Avenant_Telechargement.md. Types et fonctions alignés sur `mobile/services/documentsApi.ts`.
//  Deux surfaces :
//   - publique `/api/public/documents` (§4) : Bearer facultatif, sert seulement à journaliser `userId` ;
//     elles ne répondent jamais 401 (contrat §1.2), l'intercepteur de session de `apiClient` n'y joue pas ;
//   - espace ministère `/api/church/documents` (§5) : connecté. `/{slug}/file` exige un compte RATTACHÉ
//     (D-DOC-04) mais PAS l'abonnement du lecteur (D-DOC-12) ; liste et catégories sont gatées
//     `@RequiresModule("DOCUMENTS")` (RG-06). Ces routes-là PEUVENT répondre 401 : ne les appeler
//     qu'avec une session chargée (`me`), jamais depuis le lecteur public d'un visiteur anonyme.
//  D-DOC-05 levée (JP 27/10, D-WEB-04) : lecture complète sur le web pour un compte connecté et rattaché,
//  aperçu pour les autres. D-DOC-14 levée (JP 27/10, D-WEB-03) : espace Documents sur le web.
//  Types JSON : UUID, Slug, ShareRef, Instant → string ; int / long → number.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/public/documents';

/** Mirrors com.excellence.back.documents.DocumentLanguage — affichage seulement. */
export type DocumentLanguage = 'FR' | 'EN';

/** Mirrors com.excellence.back.documents.DocumentScopeLevel — D-DOC-08 : MINISTRY + OrgLevel (§2.2). */
export type DocumentScopeLevel = 'MINISTRY' | 'COUNTRY' | 'ZONE' | 'LOCALITY' | 'UNIT';

/**
 * Mirrors com.excellence.back.documents.DocumentLinkEventType — RG-DOC-10.
 * D-DOC-18 (JP 26/10) : `DOWNLOAD`, après la remise du PDF complet. D-DOC-19 levée par conséquence de
 * D-WEB-04 (JP 27/10) : le web l'envoie aussi (surface `WEB`) quand il propose « Télécharger le PDF ».
 */
export type DocumentLinkEventType = 'OPEN' | 'WALL' | 'INSTALL_CLICK' | 'OPEN_APP' | 'SHARE' | 'DOWNLOAD';

/** Mirrors com.excellence.back.documents.DocumentSurface — le web journalise toujours `WEB`. */
export type DocumentSurface = 'WEB' | 'APP';

/** Mirrors com.excellence.back.documents.DocumentPlatform — web : déduit du user-agent (contrat §2.1). */
export type DocumentPlatform = 'IOS' | 'ANDROID' | 'DESKTOP';

/**
 * Mirrors com.excellence.back.documents.DocumentDtos.PublicDocumentResponse — contrat §4.1.
 * Mur (RG-DOC-01c) : affiché si `!open && freePages < pageCount` ; « Encore N pages » = `pageCount − freePages`.
 */
export interface PublicDocument {
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  language: DocumentLanguage | null;
  categoryName: string | null;
  /** null → afficher `categoryName`. */
  categoryNameEn: string | null;
  ministryName: string | null;
  pageCount: number;
  /** Pages de l'aperçu = open ? pageCount : min(freePages, pageCount). */
  freePages: number;
  /** D-DOC-06 : true → pas de mur, nulle part ; `/preview` sert alors le document complet. */
  open: boolean;
  version: number;
  /**
   * D-DOC-16 (JP 26/10) : vrai par défaut. Vrai + PDF complet affiché → « Télécharger le PDF »
   * (D-DOC-17 ; sur le web depuis D-WEB-04, JP 27/10). N'ouvre aucun accès (RG-DOC-01b).
   * Lire avec `isDocumentDownloadable` : absent = vrai.
   */
  downloadable?: boolean;
  updatedAt: string;
  /** [AJOUT] "https://<SHARE_DOMAIN>/d/{slug}" — repli de partage sans `?r` (D-DOC-11). */
  shareUrl: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentPreviewResponse — contrat §4.2 (URL signée 10 min). */
export interface DocumentPreviewResponse {
  url: string;
  expiresAt: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.LinkEventRequest — contrat §4.4. */
export interface DocumentLinkEventRequest {
  event: DocumentLinkEventType;
  surface: DocumentSurface;
  platform: DocumentPlatform;
  /** UUID v4 persistant par navigateur (`localStorage['shephr.visitorId']`, D-DOC-15). */
  visitorId: string;
  /** `?r=` reçu dans le lien, renvoyé sur tous les événements de la session de lecture. */
  ref?: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.ShareResponse — 201 d'un `SHARE` (D-DOC-11). */
export interface DocumentShareResponse {
  shareRef: string;
  /** [AJOUT] "https://<SHARE_DOMAIN>/d/{slug}?r={shareRef}" — à partager tel quel. */
  shareUrl: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentFileResponse (§5.1) — URL signée 10 min de document.pdf. */
export interface DocumentFileResponse {
  url: string;
  expiresAt: string;
  version: number;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentListItem (§5.2). */
export interface DocumentListItem {
  slug: string;
  title: string;
  author: string | null;
  /** [AJOUT] dossier du document (D-DOC-16, JP 19/10) ; null = « sans dossier ». */
  categoryId: string | null;
  categoryName: string | null;
  categoryNameEn: string | null;
  scopeLevel: DocumentScopeLevel;
  /** [AJOUT] null ⇔ MINISTRY. */
  scopeId: string | null;
  /** Nom du nœud ; nom du ministère pour MINISTRY. */
  scopeName: string | null;
  pageCount: number;
  version: number;
  /** D-DOC-16 (JP 26/10) — miroir ; non lu : le lecteur se fie à `PublicDocument.downloadable`. */
  downloadable: boolean;
  publishedAt: string;
}

/**
 * Mirrors com.excellence.back.documents.DocumentDtos.DocumentCategoryItem (§5.3) — catégories ACTIVES.
 * D-DOC-16 (JP 19/10) : dossiers hiérarchiques (3 niveaux max) renvoyés À PLAT ; l'arbre se construit
 * côté client (`utils/documentFolders.ts`).
 */
export interface DocumentCategoryItem {
  id: string;
  name: string;
  nameEn: string | null;
  displayOrder: number;
  /** Dossier parent ; null = dossier racine. */
  parentId: string | null;
}

/** Codes d'erreur propres au module (contrat §1.5), traduits sous `documents.errors.<CODE>`. */
export const DOCUMENT_ERROR_CODES = [
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_UNAVAILABLE',
  'DOCUMENT_JOIN_REQUIRED',
  'RATE_LIMITED',
  'DOC_FILE_TOO_LARGE',
  'DOC_NOT_A_PDF',
  'DOC_PDF_ENCRYPTED',
  'DOC_PDF_UNREADABLE',
  'DOC_INVALID_SCOPE',
  'DOC_FREE_PAGES_OUT_OF_RANGE',
  'DOC_CATEGORY_MINISTRY_MISMATCH',
  'DOC_CATEGORY_IN_USE',
  'DOC_CATEGORY_NAME_EXISTS',
  'DOC_INVALID_TRANSITION',
];

/** Contrat §7.1 : toute autre forme répond 404 sans requête en base — on ne l'appelle même pas. */
export const isValidSlug = (slug: string | undefined): slug is string => !!slug && /^[0-9A-Za-z]{10}$/.test(slug);

/** Contrat §4.4 : un `ref` hors de cette forme est ignoré par le serveur ; on ne le renvoie pas. */
export const sanitizeRef = (ref: string | null | undefined): string | undefined =>
  ref && /^[0-9A-Za-z]{1,12}$/.test(ref) ? ref : undefined;

export async function getPublicDocument(slug: string): Promise<PublicDocument> {
  const { data } = await apiClient.get<PublicDocument>(`${BASE}/${encodeURIComponent(slug)}`);
  return data;
}

/** URL signée de `preview.pdf` (ou de `document.pdf` si `open`) — jamais le PDF complet sinon (RG-DOC-01b). */
export async function getDocumentPreview(slug: string): Promise<DocumentPreviewResponse> {
  const { data } = await apiClient.get<DocumentPreviewResponse>(`${BASE}/${encodeURIComponent(slug)}/preview`);
  return data;
}

// ─── Espace ministère (§5) — D-WEB-03 / D-WEB-04 (JP 27/10) ────────────────────────────────────

const CHURCH_BASE = '/api/church/documents';

/**
 * PDF complet (URL signée 10 min) : compte rattaché (403 `DOCUMENT_JOIN_REQUIRED` sinon), sans
 * `@RequiresModule` (D-DOC-12). D-DOC-05 levée (JP 27/10, D-WEB-04) : le lecteur web l'appelle pour un
 * compte connecté et rattaché — seulement une fois `me` chargé (route authentifiée : un 401 y purgerait
 * la session).
 */
export async function getDocumentFile(slug: string): Promise<DocumentFileResponse> {
  const { data } = await apiClient.get<DocumentFileResponse>(`${CHURCH_BASE}/${encodeURIComponent(slug)}/file`);
  return data;
}

/** Espace Documents (RG-DOC-09, RG-FOLDER-02) — déjà trié par portée, nom, publication ↓. */
export async function listDocuments(params?: { categoryId?: string; q?: string }): Promise<DocumentListItem[]> {
  const query: Record<string, string> = {};
  if (params?.categoryId) query.categoryId = params.categoryId;
  if (params?.q?.trim()) query.q = params.q.trim();
  const { data } = await apiClient.get<DocumentListItem[]>(CHURCH_BASE, { params: query });
  return data ?? [];
}

/** D-DOC-16 (JP 19/10) : dossiers actifs du ministère, à plat (`parentId`). */
export async function getDocumentCategories(): Promise<DocumentCategoryItem[]> {
  const { data } = await apiClient.get<DocumentCategoryItem[]>(`${CHURCH_BASE}/categories`);
  return data ?? [];
}

/** D-DOC-16 (JP 26/10) : seul un `false` explicite retire le bouton ; absent = téléchargeable. */
export function isDocumentDownloadable(doc: Pick<PublicDocument, 'downloadable'> | null | undefined): boolean {
  return !!doc && doc.downloadable !== false;
}

/**
 * D-DOC-17 (JP 26/10) — nom du fichier remis : `{titre}.pdf`, caractères interdits (Windows / iOS /
 * Android : `\ / : * ? " < > |`, caractères de contrôle) remplacés par `_`, espaces resserrés,
 * longueur bornée ; titre vide → le slug. Port exact de `mobile/services/documentsApi.ts`.
 */
export function documentPdfFileName(title: string, fallback: string): string {
  const base = (title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120)
    .trim();
  return `${base || fallback}.pdf`;
}

/** Libellé d'une catégorie : lang === 'en' ? (nameEn ?? name) : name (RG-FOLDER-03). */
export function categoryLabel(name: string | null, nameEn: string | null, language: string): string | null {
  if (language.toLowerCase().startsWith('en')) return nameEn ?? name;
  return name;
}

/**
 * D-WEB-04 (JP 27/10) — « Télécharger le PDF » : le fichier est récupéré en `blob` pour porter le nom
 * du titre ; si l'hébergeur du PDF refuse la lecture croisée (CORS), repli sur l'ouverture de l'URL
 * signée dans un nouvel onglet. L'appelant ne l'utilise que sur un document COMPLET affiché.
 * Rejette si rien n'a été remis (lecture échouée ET onglet de repli bloqué) : l'appelant ne journalise
 * `DOWNLOAD` qu'après une résolution.
 */
export async function downloadPdfFromUrl(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Libérer l'objet tout de suite couperait le téléchargement dans certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    // Repli hors du geste utilisateur (après des `await`) : un bloqueur de fenêtres peut l'arrêter.
    // Sans `noopener` dans les options (qui ferait toujours renvoyer null), pour détecter le blocage ;
    // l'opener est coupé à la main. Bloqué → erreur relancée : l'appelant affiche un échec et ne
    // journalise PAS `DOWNLOAD` (compteur `downloads` des statistiques, D-DOC-16..19).
    const win = window.open(url, '_blank');
    if (!win) throw new Error('DOWNLOAD_BLOCKED');
    try {
      win.opener = null;
    } catch {
      /* fenêtre d'une autre origine : rien à couper */
    }
  }
}

/**
 * Journal « fire and forget » (contrat §4.4) : `fetch` + `keepalive` plutôt qu'axios, pour que l'envoi
 * survive à la navigation qui suit souvent l'événement (clic store, « Ouvrir dans l'app »). Un échec
 * (réseau, 429, 5xx) n'affiche rien et ne bloque rien.
 */
export function logDocumentEvent(slug: string, body: DocumentLinkEventRequest): void {
  void postEvent(slug, body, true).catch(() => undefined);
}

/**
 * `SHARE` (RG-SHARE-01, D-DOC-11) : journalise AVANT d'ouvrir la feuille de partage et renvoie le lien
 * à diffuser (`?r=`). Échec ou délai dépassé → null : l'appelant partage `PublicDocument.shareUrl`.
 */
export async function logDocumentShare(
  slug: string,
  body: Omit<DocumentLinkEventRequest, 'event'>,
  timeoutMs = 2500,
): Promise<DocumentShareResponse | null> {
  try {
    const res = await Promise.race([
      postEvent(slug, { ...body, event: 'SHARE' }, false),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!res || res.status !== 201) return null;
    const data = (await res.json()) as DocumentShareResponse;
    return data && typeof data.shareUrl === 'string' && data.shareUrl ? data : null;
  } catch {
    return null;
  }
}

function postEvent(slug: string, body: DocumentLinkEventRequest, keepalive: boolean): Promise<Response> {
  const baseURL = (apiClient.defaults.baseURL ?? '').replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Bearer facultatif (contrat §1.2) : seulement pour journaliser `userId` ; un jeton invalide est ignoré.
  const token = safeToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseURL}${BASE}/${encodeURIComponent(slug)}/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    keepalive,
  });
}

function safeToken(): string | null {
  try {
    return getAuthToken();
  } catch {
    return null;
  }
}
