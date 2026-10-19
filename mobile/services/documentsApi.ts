import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/services/apiClient';
import { newEventClientId } from '@/services/eventQueue';

// Documents — liseuse & partage par lien universel (plan 18/10, §6.3 — lot D5).
// Contrat de référence : cmfipraise-backend/docs/shephr/18_10_2026/02_Contrat_API_Documents.md.
// Deux surfaces consommées ici :
//  - publique `/api/public/documents` (§4) : sans authentification, Bearer FACULTATIF (seulement
//    pour journaliser `userId`) ; un jeton invalide y est ignoré, jamais 401 (§1.2) ;
//  - espace ministère `/api/church/documents` (§5) : connecté. `/{slug}/file` exige un compte
//    RATTACHÉ (D-DOC-04) mais PAS l'abonnement du lecteur (D-DOC-12) ; la liste et les catégories
//    sont gatées `@RequiresModule("DOCUMENTS")` (RG-06).
// Types JSON : UUID, Slug, ShareRef, Instant → string ; int / long → number (§8).

/** Mirrors com.excellence.back.documents.DocumentScopeLevel — D-DOC-08 : MINISTRY + OrgLevel, dans l'ordre d'affichage (§2.2). */
export type DocumentScopeLevel = 'MINISTRY' | 'COUNTRY' | 'ZONE' | 'LOCALITY' | 'UNIT';

/** Mirrors com.excellence.back.documents.DocumentLanguage — affichage seulement. */
export type DocumentLanguage = 'FR' | 'EN';

/** Mirrors com.excellence.back.documents.DocumentLinkEventType — RG-DOC-10. */
export type DocumentLinkEventType = 'OPEN' | 'WALL' | 'INSTALL_CLICK' | 'OPEN_APP' | 'SHARE';

/** Mirrors com.excellence.back.documents.DocumentSurface — l'app envoie toujours `APP`. */
export type DocumentSurface = 'WEB' | 'APP';

/** Mirrors com.excellence.back.documents.DocumentPlatform — app : `Platform.OS` (§2.1). */
export type DocumentPlatform = 'IOS' | 'ANDROID' | 'DESKTOP';

/** Mirrors com.excellence.back.documents.DocumentDtos.PublicDocumentResponse (§4.1). */
export interface PublicDocument {
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  language: DocumentLanguage | null;
  categoryName: string | null;
  /** null → afficher `categoryName` (donnée, pas une clé i18n — RG-FOLDER-03). */
  categoryNameEn: string | null;
  ministryName: string | null;
  pageCount: number;
  /** Pages de l'aperçu = open ? pageCount : min(freePages, pageCount). */
  freePages: number;
  /** D-DOC-06 : true → pas de mur, nulle part. */
  open: boolean;
  /** Clé du cache disque du PDF complet (RG-DOC-08). */
  version: number;
  updatedAt: string;
  /** [AJOUT] « https://<SHARE_DOMAIN>/d/{slug} » — repli de partage sans `?r`. */
  shareUrl: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentPreviewResponse (§4.2) — URL signée 10 min. */
export interface DocumentPreviewResponse {
  url: string;
  expiresAt: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.LinkEventRequest (§4.4). */
export interface DocumentLinkEventRequest {
  event: DocumentLinkEventType;
  surface: DocumentSurface;
  platform: DocumentPlatform;
  /** UUID v4 aléatoire, persistant par appareil (§4.5, D-DOC-15). */
  visitorId: string;
  /** `?r=` reçu dans le lien ; le serveur ignore une valeur mal formée. */
  ref?: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.ShareResponse (§4.4) — 201 d'un `SHARE`. */
export interface DocumentShareResponse {
  shareRef: string;
  /** [AJOUT] « https://<SHARE_DOMAIN>/d/{slug}?r={shareRef} » — à partager TEL QUEL. */
  shareUrl: string;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentFileResponse (§5.1) — URL signée de document.pdf. */
export interface DocumentFileResponse {
  url: string;
  expiresAt: string;
  /** Clé de cache disque côté app : `${slug}-v${version}`. */
  version: number;
}

/** Mirrors com.excellence.back.documents.DocumentDtos.DocumentListItem (§5.2). */
export interface DocumentListItem {
  slug: string;
  title: string;
  author: string | null;
  /** [AJOUT] dossier du document (D-DOC-16) ; null = « sans dossier ». */
  categoryId: string | null;
  categoryName: string | null;
  categoryNameEn: string | null;
  scopeLevel: DocumentScopeLevel;
  /** [AJOUT] regroupement par nœud ; null ⇔ MINISTRY. */
  scopeId: string | null;
  /** Nom du nœud ; nom du ministère pour MINISTRY. */
  scopeName: string | null;
  pageCount: number;
  version: number;
  publishedAt: string;
}

/**
 * Mirrors com.excellence.back.documents.DocumentDtos.DocumentCategoryItem (§5.3) — catégories ACTIVES.
 *
 * <p>D-DOC-16 (JP 19/10) — les catégories deviennent des DOSSIERS hiérarchiques (comme Drive,
 * 3 niveaux max, par ministère). Le serveur renvoie une liste PLATE ; l'arbre se construit côté app
 * à partir de `parentId` (`utils/documentFolders.ts`).
 */
export interface DocumentCategoryItem {
  id: string;
  name: string;
  nameEn: string | null;
  displayOrder: number;
  /** D-DOC-16 : dossier parent ; null = dossier racine. */
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

const slugPath = (slug: string) => encodeURIComponent(slug);

// ─── Public (§4) ──────────────────────────────────────────────────────────────────────────────

export async function getPublicDocument(slug: string): Promise<PublicDocument> {
  const { data } = await apiClient.get<PublicDocument>(`/api/public/documents/${slugPath(slug)}`);
  return data;
}

/** URL signée de `preview.pdf` (ou du PDF complet si `open`) — jamais `document.pdf` sinon (RG-DOC-01b). */
export async function getDocumentPreview(slug: string): Promise<DocumentPreviewResponse> {
  const { data } = await apiClient.get<DocumentPreviewResponse>(
    `/api/public/documents/${slugPath(slug)}/preview`,
  );
  return data;
}

/** Délai maximal du journal `SHARE` avant d'ouvrir la feuille de partage (aligné sur le web). */
const SHARE_LOG_TIMEOUT_MS = 2500;

/**
 * Journal (RG-DOC-06/10) en « fire and forget » (contrat §4.4) : un échec (réseau, 429, 5xx)
 * n'affiche rien et ne bloque rien → `null`. Pour `SHARE`, renvoie le `shareUrl` à partager.
 */
export async function logDocumentEvent(
  slug: string,
  event: DocumentLinkEventType,
  ref?: string | null,
): Promise<DocumentShareResponse | null> {
  const platform = appPlatform();
  // Expo web n'envoie rien : il affiche la page web, qui journalise elle-même en WEB (§2.1).
  if (!platform) return null;
  try {
    const body: DocumentLinkEventRequest = {
      event,
      surface: 'APP',
      platform,
      visitorId: await getVisitorId(),
      ...(ref ? { ref } : {}),
    };
    const res = await apiClient.post<DocumentShareResponse | ''>(
      `/api/public/documents/${slugPath(slug)}/events`,
      body,
      // Contrat §4.4 : le journal ne bloque rien. `SHARE` est attendu avant la feuille de partage,
      // donc borné court (même délai que le web) ; au-delà, on partage le lien sans `?r=`.
      event === 'SHARE' ? { timeout: SHARE_LOG_TIMEOUT_MS } : undefined,
    );
    return event === 'SHARE' && res.data && typeof res.data === 'object' ? res.data : null;
  } catch {
    return null;
  }
}

// ─── Espace ministère (§5) ────────────────────────────────────────────────────────────────────

/** PDF complet : compte rattaché (403 `DOCUMENT_JOIN_REQUIRED` sinon), sans `@RequiresModule` (D-DOC-12). */
export async function getDocumentFile(slug: string): Promise<DocumentFileResponse> {
  const { data } = await apiClient.get<DocumentFileResponse>(
    `/api/church/documents/${slugPath(slug)}/file`,
  );
  return data;
}

/** Espace Documents (RG-DOC-09, RG-FOLDER-02) — déjà trié par portée, nom, publication ↓. */
export async function listDocuments(params?: { categoryId?: string; q?: string }): Promise<DocumentListItem[]> {
  const query: Record<string, string> = {};
  if (params?.categoryId) query.categoryId = params.categoryId;
  if (params?.q?.trim()) query.q = params.q.trim();
  const { data } = await apiClient.get<DocumentListItem[]>('/api/church/documents', { params: query });
  return data ?? [];
}

/** D-DOC-16 (JP 19/10) : dossiers actifs du ministère, à plat (`parentId`). */
export async function getDocumentCategories(): Promise<DocumentCategoryItem[]> {
  const { data } = await apiClient.get<DocumentCategoryItem[]>('/api/church/documents/categories');
  return data ?? [];
}

// ─── Aides ────────────────────────────────────────────────────────────────────────────────────

/** Code machine d'une erreur axios (`response.data.error`, contrat §1.5). */
export function documentErrorCode(e: any): string | null {
  const code = e?.response?.data?.error;
  return typeof code === 'string' ? code : null;
}

/**
 * RG-DOC-02 — 404 et 410 se traitent À L'IDENTIQUE : « Ce document n'est plus disponible »
 * (contrat §2.4), jamais un lien mort.
 */
export function isDocumentGone(e: any): boolean {
  const status = e?.response?.status;
  return status === 404 || status === 410;
}

/** Libellé d'une catégorie : lang === 'en' ? (nameEn ?? name) : name (RG-FOLDER-03). */
export function categoryLabel(name: string | null, nameEn: string | null, language: string): string | null {
  if (language.toLowerCase().startsWith('en')) return nameEn ?? name;
  return name;
}

/** `Platform.OS` → `DocumentPlatform` ; null sur Expo web (aucun journal, §2.1). */
export function appPlatform(): DocumentPlatform | null {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return null;
}

const VISITOR_KEY = 'shephr.visitorId';
let visitorIdMemo: string | null = null;

/**
 * D-DOC-15 (JP 18/10) [HYPOTHÈSE] — identifiant visiteur ALÉATOIRE, tiré une fois par appareil et
 * gardé en `AsyncStorage['shephr.visitorId']` (contrat §4.5) : ni IP, ni cookie, ni lien au compte
 * (le `userId` vient du jeton, côté serveur). Stockage indisponible → UUID en mémoire pour la
 * session. Tiré par le même générateur que le `clientId` des Évènements (UUID v4, ne lève jamais).
 */
export async function getVisitorId(): Promise<string> {
  if (visitorIdMemo) return visitorIdMemo;
  try {
    const stored = await AsyncStorage.getItem(VISITOR_KEY);
    if (stored) {
      visitorIdMemo = stored;
      return stored;
    }
  } catch {
    // Lecture impossible : on tire un identifiant de session ci-dessous.
  }
  const id = newEventClientId();
  visitorIdMemo = id;
  try {
    await AsyncStorage.setItem(VISITOR_KEY, id);
  } catch {
    // Stockage plein ou indisponible : l'identifiant vaut pour cette session.
  }
  return id;
}
