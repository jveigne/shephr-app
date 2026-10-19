import { apiClient, getAuthToken } from './apiClient';

// ---------------------------------------------------------------------------------------------
//  Documents — lecteur public par lien universel (plan du 18/10, lot D4 — §6.2).
//  Contrat de référence : cmfipraise-backend/docs/shephr/18_10_2026/02_Contrat_API_Documents.md (§4).
//  D-DOC-05 (JP 18/10) : le web ne lit JAMAIS que l'aperçu (`/preview`), même connecté ; il n'appelle
//  aucune route `/api/church/documents` (réservées à l'app).
//  Routes publiques (`permitAll`) : Bearer facultatif, sert seulement à journaliser `userId` ; elles
//  ne répondent jamais 401 (contrat §1.2), l'intercepteur de session de `apiClient` n'y joue donc pas.
//  Types JSON : UUID, Slug, ShareRef, Instant → string ; int / long → number.
// ---------------------------------------------------------------------------------------------

const BASE = '/api/public/documents';

/** Mirrors com.excellence.back.documents.DocumentLanguage — affichage seulement. */
export type DocumentLanguage = 'FR' | 'EN';

/** Mirrors com.excellence.back.documents.DocumentLinkEventType — RG-DOC-10. */
export type DocumentLinkEventType = 'OPEN' | 'WALL' | 'INSTALL_CLICK' | 'OPEN_APP' | 'SHARE';

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
