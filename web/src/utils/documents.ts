import type { DocumentPlatform } from '../services/documentsApi';

// Utilitaires du lecteur public `/d/:slug` (plan du 18/10, lot D4).

const VISITOR_KEY = 'shephr.visitorId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Repli en mémoire quand `localStorage` est indisponible (navigation privée, données bloquées). */
let memoryVisitorId: string | null = null;

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * D-DOC-15 (JP 18/10) [HYPOTHÈSE] — identifiant visiteur aléatoire, sans IP ni cookie tiers (exemption
 * CNIL « mesure d'audience »). Tiré une fois par navigateur et conservé dans `localStorage`
 * (`shephr.visitorId`, contrat §4.5) ; lecture / écriture sous try/catch, repli en mémoire pour la page.
 */
export function getVisitorId(): string {
  if (memoryVisitorId) return memoryVisitorId;
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored && UUID_RE.test(stored)) {
      memoryVisitorId = stored;
      return stored;
    }
  } catch {
    /* localStorage indisponible */
  }
  const id = randomUuid();
  memoryVisitorId = id;
  try {
    localStorage.setItem(VISITOR_KEY, id);
  } catch {
    /* localStorage indisponible : l'id vit le temps de la page */
  }
  return id;
}

/**
 * Contrat §2.1 — plateforme du lecteur web : iPhone / iPad / iPod (ou iPadOS qui se présente en
 * `MacIntel` tactile) → IOS ; Android → ANDROID ; sinon DESKTOP.
 */
export function detectPlatform(): DocumentPlatform {
  if (typeof navigator === 'undefined') return 'DESKTOP';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'IOS';
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) return 'IOS';
  if (/Android/i.test(ua)) return 'ANDROID';
  return 'DESKTOP';
}

/** Statut HTTP + code machine (`ApiError.error`) d'une erreur axios. */
export function apiErrorInfo(err: unknown): { status: number | null; code: string | null } {
  const res = (err as { response?: { status?: number; data?: { error?: unknown } } })?.response;
  const code = typeof res?.data?.error === 'string' ? res.data.error : null;
  return { status: res?.status ?? null, code };
}

/**
 * Contrat §2.4 : 404 `DOCUMENT_NOT_FOUND` (slug inconnu, mal formé, ancien slug régénéré) et 410
 * `DOCUMENT_UNAVAILABLE` se traitent à l'identique — « Ce document n'est plus disponible » (RG-DOC-02).
 */
export const isDocumentGone = (err: unknown) => {
  const { status } = apiErrorInfo(err);
  return status === 404 || status === 410;
};
