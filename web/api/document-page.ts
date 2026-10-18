/**
 * Fonction Vercel — page `/d/{slug}` avec balises OpenGraph (plan Documents du 18/10, lot D4, §6.2).
 *
 * D-DOC-10 (JP 18/10) [HYPOTHÈSE] : un lien sans titre ni vignette n'est pas touché (WhatsApp). La SPA
 * ne peut pas produire ces balises (les robots n'exécutent pas le JS) : `vercel.json` réécrit
 * `/d/:slug` vers cette fonction AVANT la règle SPA. Elle lit `GET /api/public/documents/{slug}`, prend
 * l'`index.html` du déploiement, y injecte `<title>`, `og:*` et `twitter:card`, et renvoie le HTML ;
 * React prend ensuite la main sur la même URL (route publique `/d/:slug`).
 *
 * Autonome : aucune dépendance au build Vite ni à `@vercel/node` (API Web standard `Request` /
 * `Response`, Node 18+) ; hors du `include` de `tsconfig.json`, donc hors de `tsc -b`.
 *
 * Configuration (une variable d'environnement Vercel par valeur, contrat Documents §9) :
 *   - API_PUBLIC_BASE_URL : base publique du backend (og:image + métadonnées), ex. l'URL Railway ;
 *     repli `VITE_API_BASE_URL` (déjà définie pour le build du web), sinon placeholder
 *     `TODO_API_PUBLIC_BASE_URL` → la page est servie sans balises propres au document.
 */

// `process.env` lu sans dépendre de `@types/node` (absent du dépôt) ni le redéclarer.
const env: Record<string, string | undefined> =
  (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const API_PUBLIC_BASE_URL = (
  env.API_PUBLIC_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'TODO_API_PUBLIC_BASE_URL'
).replace(/\/+$/, '');

const SLUG_RE = /^[0-9A-Za-z]{10}$/; // contrat §7.1
const API_TIMEOUT_MS = 3000;

/** Sous-ensemble de PublicDocument utile ici — Mirrors com.excellence.back.documents.DocumentDtos.PublicDocumentResponse. */
interface PublicDocumentMeta {
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  language: 'FR' | 'EN' | null;
  ministryName: string | null;
  version: number;
  shareUrl: string;
}

/**
 * Textes de repli des balises (pas d'i18next côté fonction) : la langue suit `language` du document
 * (`FR` par défaut), comme l'aperçu WhatsApp, qui n'a pas de préférence de lecteur.
 */
const FALLBACK = {
  FR: {
    description: 'Lisez un aperçu gratuit, puis la suite dans l’app Shephr.',
    unavailable: 'Ce document n’est plus disponible',
  },
  EN: {
    description: 'Read a free preview, then the rest in the Shephr app.',
    unavailable: 'This document is no longer available',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Lookup =
  | { kind: 'ok'; doc: PublicDocumentMeta }
  | { kind: 'gone'; status: 404 | 410 }
  | { kind: 'unknown' };

async function lookupDocument(slug: string): Promise<Lookup> {
  if (!SLUG_RE.test(slug)) return { kind: 'gone', status: 404 };
  if (!API_PUBLIC_BASE_URL.startsWith('http')) return { kind: 'unknown' };
  try {
    const res = await fetchWithTimeout(`${API_PUBLIC_BASE_URL}/api/public/documents/${slug}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404 || res.status === 410) return { kind: 'gone', status: res.status };
    if (!res.ok) return { kind: 'unknown' };
    return { kind: 'ok', doc: (await res.json()) as PublicDocumentMeta };
  } catch {
    return { kind: 'unknown' }; // API injoignable : la SPA gérera, on sert la page sans balises propres
  }
}

function metaTags(lookup: Lookup, requestUrl: URL): { title: string | null; tags: string } {
  if (lookup.kind === 'unknown') return { title: null, tags: '' };
  if (lookup.kind === 'gone') {
    const title = FALLBACK.FR.unavailable;
    return {
      title,
      tags: [
        `<meta name="robots" content="noindex" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:site_name" content="Shephr" />`,
      ].join('\n    '),
    };
  }
  const { doc } = lookup;
  const lang = doc.language === 'EN' ? 'EN' : 'FR';
  const description = truncate(doc.description?.trim() || FALLBACK[lang].description, 300);
  const byline = [doc.author, doc.ministryName].filter(Boolean).join(' · ');
  const url = doc.shareUrl || `${requestUrl.origin}/d/${doc.slug}`;
  // Contrat §7.3 : `?v=` évite qu'un remplacement de fichier serve une vignette périmée depuis les caches.
  const image = `${API_PUBLIC_BASE_URL}/api/public/documents/${doc.slug}/cover.jpg?v=${doc.version}`;
  const title = doc.title;
  return {
    title,
    tags: [
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="Shephr" />`,
      `<meta property="og:locale" content="${lang === 'EN' ? 'en_US' : 'fr_FR'}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:type" content="image/jpeg" />`,
      `<meta property="og:image:alt" content="${escapeHtml(title)}" />`,
      byline ? `<meta name="author" content="${escapeHtml(byline)}" />` : '',
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
    ]
      .filter(Boolean)
      .join('\n    '),
  };
}

function inject(html: string, title: string | null, tags: string): string {
  let out = html;
  // Remplacement par fonction : une chaîne de remplacement interpréterait `$&`, `` $` `` et `$'`
  // présents dans un titre ou une description (escapeHtml ne les neutralise pas).
  if (title) out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)} · Shephr</title>`);
  if (tags) out = out.replace(/<\/head>/i, () => `    ${tags}\n  </head>`);
  return out;
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  // Hôte public d'origine (derrière la réécriture Vercel) pour relire l'index.html du déploiement.
  const host = request.headers.get('x-forwarded-host') || requestUrl.host;
  const proto = request.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '') || 'https';
  const origin = `${proto}://${host}`;
  const slug = requestUrl.searchParams.get('slug') ?? '';

  const [lookup, indexRes] = await Promise.all([
    lookupDocument(slug),
    fetchWithTimeout(`${origin}/index.html`).catch(() => null),
  ]);

  const { title, tags } = metaTags(lookup, new URL(origin));

  if (!indexRes || !indexRes.ok) {
    // Filet : sans index.html (déploiement protégé, panne), on renvoie au moins les balises pour les
    // robots, et un lien vers la page d'accueil pour un humain.
    const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title ?? 'Shephr')}</title>
    ${tags}
  </head><body><p><a href="/">Shephr</a></p></body></html>`;
    return new Response(body, {
      status: lookup.kind === 'gone' ? lookup.status : 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
    });
  }

  const html = inject(await indexRes.text(), title, tags);
  return new Response(html, {
    // 404 / 410 reflétés pour les robots ; le navigateur affiche quand même la SPA (« plus disponible »).
    status: lookup.kind === 'gone' ? lookup.status : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Navigateur : toujours revalider (comme index.html) ; CDN : 5 min, le temps d'un partage en rafale.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
