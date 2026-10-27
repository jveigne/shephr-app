import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { Button, Modal } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { useToast } from '../components/Toast';
import { SHARE_BASE_URL } from '../config/links';
import { APP_SCHEME, APP_STORE_URL, PLAY_STORE_URL, isStoreUrlConfigured } from '../config/stores';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, hasMemberSpace, hasMinistryAccess, isAttachedAccount } from '../services/authApi';
import {
  documentPdfFileName,
  downloadPdfFromUrl,
  getDocumentFile,
  getDocumentPreview,
  getPublicDocument,
  isDocumentDownloadable,
  isValidSlug,
  logDocumentEvent,
  logDocumentShare,
  sanitizeRef,
  type DocumentLinkEventRequest,
  type DocumentLinkEventType,
  type DocumentPlatform,
  type PublicDocument,
} from '../services/documentsApi';
import { apiErrorInfo, detectPlatform, getVisitorId, isDocumentGone } from '../utils/documents';

// ---------------------------------------------------------------------------------------------
//  Lecteur public `/d/:slug` — plan Documents du 18/10, lot D4 (§6.2), contrat §4.
//  Route PUBLIQUE (aucune garde, comme /privacy) : c'est la page d'arrivée d'un lien partagé.
//  D-DOC-05 levée (JP 27/10, D-WEB-04) : lecture complète sur le web pour un compte connecté et
//  rattaché, aperçu pour les autres. Choix de la source (RG-DOC-01, D-DOC-04/06), une fois la session
//  connue (`ready`) :
//   - document `open` → `/preview`, qui sert le complet, pour tous (D-DOC-06, inchangé) ;
//   - compte connecté ET rattaché (`isAttachedAccount`) → `/api/church/documents/{slug}/file` (URL
//     signée 10 min), même rendu PDF.js, aucun mur ni WALL ; 403 `DOCUMENT_JOIN_REQUIRED` → repli sur
//     l'aperçu + mur « Rejoindre » (le serveur reste juge) ;
//   - sinon → `/preview` + mur : non connecté « Se connecter / Créer un compte » (retour ici par
//     `?next=`), connecté non rattaché « Rejoindre mon assemblée » (`/join?next=`), + stores / QR / app.
//  `/file` n'est appelée qu'avec `me` chargé : sans session, l'intercepteur 401 renverrait à /login.
//  « Télécharger le PDF » (D-DOC-16/17/18 ; D-DOC-19 levée par conséquence) : document COMPLET affiché
//  et `downloadable`, jamais sur un aperçu ; journal `DOWNLOAD` surface `WEB`.
//  D-WEB-04 (plan 27/10) parle d'un `iframe` du PDF signé : le lecteur garde PDF.js (même rendu que
//  l'aperçu, pas de dépendance au `Content-Disposition` de l'hébergeur) — écart noté.
//  D-DOC-02 : PDF.js lit le PDF tel quel ; pages rendues à la demande (IntersectionObserver),
//  défilement vertical continu, largeur = largeur d'écran (mobile d'abord).
// ---------------------------------------------------------------------------------------------

type Pdfjs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<Pdfjs> | null = null;

/**
 * PDF.js chargé à la demande (hors du bundle principal) ; build `legacy` pour les navigateurs
 * anciens (Android d'entrée de gamme, iOS non à jour) ; worker servi en asset Vite.
 */
function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
      .then(([lib, worker]) => {
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        return lib as unknown as Pdfjs;
      })
      .catch((e) => {
        pdfjsPromise = null; // un échec réseau ponctuel ne condamne pas la page
        throw e;
      });
  }
  return pdfjsPromise;
}

/** Plafond de pixels par canevas (mémoire des navigateurs mobiles, iOS en particulier). */
const MAX_CANVAS_PIXELS = 5_000_000;
/** Marge de rendu anticipé / de libération des pages hors champ. */
const RENDER_MARGIN = '1200px 0px';
const COLUMN_MAX = 860;

// ---------------------------------------------------------------------------------------------
//  Page PDF rendue à la demande
// ---------------------------------------------------------------------------------------------

function PdfPage({
  pdf,
  pageNumber,
  width,
  defaultRatio,
  registerEl,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  defaultRatio: number;
  registerEl: (pageNumber: number, el: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const setWrap = useCallback(
    (el: HTMLDivElement | null) => {
      wrapRef.current = el;
      registerEl(pageNumber, el);
    },
    [pageNumber, registerEl],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: RENDER_MARGIN,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let page: PDFPageProxy | null = null;
    setFailed(false);
    (async () => {
      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const viewport = page.getViewport({ scale: width / base.width });
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixels = viewport.width * viewport.height * dpr * dpr;
        if (pixels > MAX_CANVAS_PIXELS) dpr *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === 'RenderingCancelledException')) return;
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      page?.cleanup();
      // Page sortie du champ : on libère le canevas (mémoire), elle sera redessinée au retour.
      const c = canvasRef.current;
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      setRendered(false);
    };
  }, [near, width, pdf, pageNumber, attempt]);

  const height = Math.round(width * (ratio ?? defaultRatio));

  return (
    <div
      ref={setWrap}
      data-page={pageNumber}
      aria-label={t('documents.reader.pageLabel', { page: pageNumber })}
      style={{
        position: 'relative', width, height, background: '#fff', borderRadius: 4,
        boxShadow: 'var(--shadow-md)', overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {!rendered && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          {failed ? (
            <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>{t('documents.reader.retryPage')}</Button>
          ) : (
            <span>{t('documents.reader.pageLabel', { page: pageNumber })}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  QR code (ordinateur) et boutons des stores
// ---------------------------------------------------------------------------------------------

/** D-DOC-05 : sur ordinateur, le mur propose un QR code du lien (lib `qrcode`, chargée à la demande). */
function QrCode({ value }: { value: string }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const css = getComputedStyle(document.documentElement);
    const dark = css.getPropertyValue('--green-900').trim();
    const light = css.getPropertyValue('--ivory-card').trim();
    import('qrcode')
      .then((QR) =>
        QR.toDataURL(value, {
          margin: 1,
          width: 220,
          errorCorrectionLevel: 'M',
          ...(dark && light ? { color: { dark, light } } : {}),
        }),
      )
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return null;
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <img
        src={src}
        alt={t('documents.wall.qrAlt')}
        width={180}
        height={180}
        style={{ borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'var(--ivory-card)' }}
      />
      <figcaption style={{ fontSize: 13, color: 'var(--ink-500)', textAlign: 'center', maxWidth: 260 }}>
        {t('documents.wall.qrCaption')}
      </figcaption>
    </figure>
  );
}

const storeBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46,
  padding: '12px 20px', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 15,
  textDecoration: 'none', border: 'none', background: 'var(--green-800)', color: '#fff',
} as const;

function StoreButton({ store, onClick }: { store: 'ios' | 'android'; onClick?: () => void }) {
  const { t } = useTranslation();
  const url = store === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  const label = store === 'ios' ? t('documents.stores.appStore') : t('documents.stores.playStore');
  // Garde-fou P2 (liens fournis le 20/10) : une URL non `https://` → bouton inactif plutôt qu'un lien mort.
  if (!isStoreUrlConfigured(url)) {
    return (
      <button type="button" disabled title={t('documents.stores.soon')} style={{ ...storeBtnStyle, opacity: 0.55, cursor: 'not-allowed' }}>
        {label}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClick} style={storeBtnStyle}>
      {label}
    </a>
  );
}

/**
 * Boutons d'installation selon la plateforme (plan §6.2) : iOS → App Store, Android → Play Store,
 * + « Ouvrir dans l'app » (`shephr://d/{slug}` : un lien universel touché depuis son propre domaine
 * n'ouvre pas l'app sur iOS) ; ordinateur → QR code du lien + les deux stores.
 */
function AppButtons({
  platform,
  qrValue,
  appUrl,
  onInstall,
  onOpenApp,
}: {
  platform: DocumentPlatform;
  /** Lien encodé dans le QR (ordinateur) ; absent → pas de QR. */
  qrValue?: string;
  /** `shephr://d/{slug}` ; absent → pas de bouton « Ouvrir dans l'app ». */
  appUrl?: string;
  onInstall?: () => void;
  onOpenApp?: () => void;
}) {
  const { t } = useTranslation();
  const row = { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' } as const;
  if (platform === 'DESKTOP') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        {qrValue && <QrCode value={qrValue} />}
        <div style={row}>
          <StoreButton store="ios" onClick={onInstall} />
          <StoreButton store="android" onClick={onInstall} />
        </div>
      </div>
    );
  }
  return (
    <div style={row}>
      <StoreButton store={platform === 'IOS' ? 'ios' : 'android'} onClick={onInstall} />
      {appUrl && (
        <a
          href={appUrl}
          onClick={onOpenApp}
          style={{ ...storeBtnStyle, background: 'transparent', color: 'var(--green-800)', border: '1px solid var(--line-strong)' }}
        >
          {t('documents.wall.openInApp')}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Gabarit de page (en-tête léger)
// ---------------------------------------------------------------------------------------------

function Logo() {
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: 'var(--green-600)', color: '#fff',
        display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--font-serif)',
      }}
    >S</div>
  );
}

function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 600, color: 'var(--green-800)' }}>shephr</span>
        </div>
        <LangSwitch />
      </header>
      <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>{children}</div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------------------------------

/** Source du PDF affiché : `/preview` (aperçu, ou complet si `open`) ou `/file` (complet, rattaché). */
type PdfSource = 'preview' | 'file';

type PdfState =
  | { status: 'loading' }
  | { status: 'ready'; pdf: PDFDocumentProxy }
  | { status: 'error' };

export function DocumentReaderPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const location = useLocation();
  const { ready: authReady, isAuthenticated, me } = useAuth();
  // D-WEB-04 (JP 27/10) : compte connecté ET rattaché (D-DOC-04) — `me` chargé, jamais le seul jeton.
  const attached = isAuthenticated && !!me && isAttachedAccount(me);
  // 403 `DOCUMENT_JOIN_REQUIRED` reçu de `/file` : le serveur a tranché, on revient à l'aperçu.
  const [joinRefused, setJoinRefused] = useState(false);
  // Retour après connexion / inscription / rattachement : ce lecteur, `?r=` compris (D-DOC-11).
  const returnPath = `${location.pathname}${location.search}`;
  const nextParam = `?next=${encodeURIComponent(returnPath)}`;
  // Autre document ou autre compte : le refus précédent ne vaut plus.
  useEffect(() => {
    setJoinRefused(false);
  }, [slug, me?.id]);

  // `?r=` de l'URL d'arrivée, renvoyé sur TOUS les événements de cette session de lecture (contrat §4.4).
  const [ref] = useState(() => sanitizeRef(searchParams.get('r')));
  const [platform] = useState(detectPlatform);
  const [visitorId] = useState(getVisitorId);
  const validSlug = isValidSlug(slug);

  const docQuery = useQuery({
    queryKey: ['public-document', slug],
    queryFn: () => getPublicDocument(slug as string),
    enabled: validSlug,
    retry: (count, err) => !isDocumentGone(err) && count < 1,
    staleTime: 5 * 60_000,
  });
  const doc = docQuery.data;

  const baseEvent = useMemo(
    () => ({ surface: 'WEB' as const, platform, visitorId, ...(ref ? { ref } : {}) }),
    [platform, visitorId, ref],
  );
  const log = useCallback(
    (event: DocumentLinkEventType) => {
      if (!slug || !validSlug) return;
      const body: DocumentLinkEventRequest = { ...baseEvent, event };
      logDocumentEvent(slug, body);
    },
    [slug, validSlug, baseEvent],
  );

  // OPEN : une fois par chargement du lecteur, après `GET /{slug}` réussi (contrat §4.4).
  // Garde par ref : StrictMode rejoue les effets en dev.
  const openLogged = useRef<string | null>(null);
  useEffect(() => {
    if (!doc || openLogged.current === doc.slug) return;
    openLogged.current = doc.slug;
    log('OPEN');
  }, [doc, log]);

  useEffect(() => {
    if (!doc) return;
    const prev = document.title;
    document.title = `${doc.title} · Shephr`;
    return () => {
      document.title = prev;
    };
  }, [doc]);

  // --- PDF (aperçu ou complet) ----------------------------------------------------------------
  const [pdfState, setPdfState] = useState<PdfState>({ status: 'loading' });
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [defaultRatio, setDefaultRatio] = useState(1.414);
  const source: PdfSource = doc && !doc.open && attached && !joinRefused ? 'file' : 'preview';
  // Dernière URL signée reçue (10 min), réutilisée par « Télécharger » tant qu'elle est valide.
  const signedRef = useRef<{ source: PdfSource; url: string; expiresAt: number } | null>(null);

  useEffect(() => {
    // Session pas encore connue : on attend pour ne pas charger l'aperçu d'un compte rattaché.
    if (!doc || !authReady) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setPdfState({ status: 'loading' });
    (async () => {
      try {
        const signedP =
          source === 'file'
            ? getDocumentFile(doc.slug).catch((err) => {
                // Le serveur reste juge du rattachement (contrat §2.3) : repli sur l'aperçu + mur.
                if (apiErrorInfo(err).code === 'DOCUMENT_JOIN_REQUIRED') return null;
                throw err;
              })
            : getDocumentPreview(doc.slug);
        const [pdfjs, signed] = await Promise.all([loadPdfjs(), signedP]);
        if (cancelled) return;
        if (!signed) {
          setJoinRefused(true); // l'effet repart sur `/preview`
          return;
        }
        const expiresAt = Date.parse(signed.expiresAt);
        signedRef.current = { source, url: signed.url, expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt };
        // URL signée 10 min (contrat §6.2) : PDF.js charge le fichier entier en tâche de fond
        // (auto-fetch par défaut), bien avant l'échéance ; un échec se relance par « Réessayer », qui
        // redemande une URL neuve (`/preview` ou `/file`).
        const pdf = await pdfjs.getDocument({ url: signed.url, isEvalSupported: false }).promise;
        loaded = pdf;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        try {
          const first = await pdf.getPage(1);
          const vp = first.getViewport({ scale: 1 });
          if (!cancelled) setDefaultRatio(vp.height / vp.width);
        } catch {
          /* ratio par défaut A4 */
        }
        if (!cancelled) setPdfState({ status: 'ready', pdf });
      } catch (err) {
        if (cancelled) return;
        // 404 / 410 entre-temps (dépublié pendant la lecture) : on bascule sur « plus disponible ».
        if (isDocumentGone(err)) void docQuery.refetch();
        setPdfState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
    // Dépendances volontairement réduites : on ne recharge le PDF que si le fichier servi change.
  }, [doc?.slug, doc?.version, doc?.open, doc?.freePages, pdfAttempt, authReady, source]);

  // --- Largeur de colonne = largeur d'écran (mobile d'abord) ---------------------------------
  const columnRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      setWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfState.status]);

  // --- Page courante (indicateur « page X sur N ») --------------------------------------------
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const registerEl = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(n, el);
    else pageEls.current.delete(n);
  }, []);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    if (pdfState.status !== 'ready') return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.4;
        let current = 1;
        for (const [n, el] of pageEls.current) {
          if (el.getBoundingClientRect().top <= line && n > current) current = n;
        }
        setCurrentPage(current);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pdfState.status]);

  // --- Mur de fin d'aperçu (RG-DOC-01c) : WALL une fois, quand il devient visible -------------
  // Jamais de mur sur le document complet d'un compte rattaché (D-WEB-04).
  const hasWall = !!doc && !doc.open && source === 'preview' && doc.freePages < doc.pageCount;
  const wallKind: 'login' | 'join' = isAuthenticated ? 'join' : 'login';
  const laidOut = width > 0;
  const wallRef = useRef<HTMLElement | null>(null);
  const wallLogged = useRef<string | null>(null);
  useEffect(() => {
    const el = wallRef.current;
    // Pages pas encore posées (largeur inconnue) : le mur serait visible à tort en haut d'écran.
    if (!doc || !hasWall || !el || pdfState.status !== 'ready' || !laidOut) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && wallLogged.current !== doc.slug) {
          wallLogged.current = doc.slug;
          log('WALL');
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [doc, hasWall, pdfState.status, laidOut, log]);

  // --- Partage (RG-SHARE-01/03, D-DOC-11) -------------------------------------------------------
  const [sharing, setSharing] = useState(false);
  const [shareSheetUrl, setShareSheetUrl] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyLink = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        toast.push({ kind: 'ok', title: t('documents.share.copied') });
        return true;
      } catch {
        return false;
      }
    },
    [t, toast],
  );

  const nativeShare = useCallback(
    async (d: PublicDocument, url: string) => {
      try {
        await navigator.share({ title: d.title, text: t('documents.share.text', { title: d.title }), url });
        return true;
      } catch (e) {
        // L'utilisateur a fermé la feuille : rien à faire.
        if (e instanceof Error && e.name === 'AbortError') return true;
        return false;
      }
    },
    [t],
  );

  const onShare = async () => {
    if (!doc || !slug || sharing) return;
    setSharing(true);
    try {
      // SHARE journalisé AVANT la feuille de partage ; échec → lien sans `?r` (contrat §4.4).
      const res = await logDocumentShare(slug, baseEvent);
      const url = res?.shareUrl || doc.shareUrl || `${SHARE_BASE_URL}/d/${doc.slug}`;
      // Safari peut refuser `navigator.share` après l'attente réseau (geste utilisateur consommé) :
      // repli sur une petite feuille qui relance le partage d'un nouveau geste.
      if (canNativeShare ? await nativeShare(doc, url) : await copyLink(url)) return;
      setShareSheetUrl(url);
    } finally {
      setSharing(false);
    }
  };

  // --- Télécharger le PDF (D-DOC-16/17/18, D-WEB-04 JP 27/10) ------------------------------------
  // Seulement sur le document COMPLET affiché (`open`, ou `/file` d'un compte rattaché) et
  // `downloadable` ; jamais sur un aperçu. N'ouvre aucun accès (RG-DOC-01b).
  const fullShown = !!doc && pdfState.status === 'ready' && (doc.open || source === 'file');
  const canDownload = fullShown && isDocumentDownloadable(doc);
  const [downloading, setDownloading] = useState(false);
  const onDownload = async () => {
    if (!doc || !slug || downloading || !canDownload) return;
    setDownloading(true);
    try {
      const cached = signedRef.current;
      // Marge d'une minute sur l'échéance de l'URL signée ; sinon une URL neuve.
      const url =
        cached && cached.source === source && cached.expiresAt - Date.now() > 60_000
          ? cached.url
          : (source === 'file' ? await getDocumentFile(doc.slug) : await getDocumentPreview(doc.slug)).url;
      await downloadPdfFromUrl(url, documentPdfFileName(doc.title, doc.slug));
      log('DOWNLOAD');
    } catch {
      toast.push({ kind: 'error', title: t('documents.reader.downloadFailed') });
    } finally {
      setDownloading(false);
    }
  };

  // --- « D'autres documents » : l'espace Documents, si le compte y a accès (D-WEB-03) ------------
  const modulesQ = useQuery({
    queryKey: ['accessible-modules'],
    queryFn: getAccessibleModules,
    enabled: attached,
  });
  const spacePath = !attached
    ? null
    : hasMinistryAccess(me)
      ? '/documents'
      : hasMemberSpace(me)
        ? '/my-documents'
        : null;
  const moreDocsPath = spacePath && (modulesQ.data ?? []).includes('DOCUMENTS') ? spacePath : null;

  const appUrl = doc
    ? `${APP_SCHEME}://d/${encodeURIComponent(doc.slug)}${ref ? `?r=${encodeURIComponent(ref)}` : ''}`
    : undefined;
  // D-DOC-11 : le QR (ordinateur) garde le `?r=` reçu, comme « Ouvrir dans l'app » — sinon la
  // personne qui scanne n'est plus reliée au partage qui l'a amenée.
  const qrUrl = doc
    ? `${doc.shareUrl || `${SHARE_BASE_URL}/d/${doc.slug}`}${ref ? `?r=${encodeURIComponent(ref)}` : ''}`
    : undefined;

  // =============================================================================================
  //  Écrans
  // =============================================================================================

  // 404 / 410 (ou slug mal formé) → « plus disponible » + stores (RG-DOC-02, jamais de lien mort).
  // Pas d'INSTALL_CLICK ici : le serveur n'écrit rien pour un document indisponible (contrat §4.4).
  if (!validSlug || (docQuery.isError && isDocumentGone(docQuery.error))) {
    return (
      <CenteredScreen>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(24px, 6vw, 32px)', color: 'var(--green-900)', margin: '0 0 12px' }}>
          {t('documents.unavailable.title')}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 28px' }}>
          {t('documents.unavailable.body')}
        </p>
        <AppButtons platform={platform} />
      </CenteredScreen>
    );
  }

  if (docQuery.isError) {
    const { code } = apiErrorInfo(docQuery.error);
    return (
      <CenteredScreen>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26, color: 'var(--green-900)', margin: '0 0 12px' }}>
          {t('documents.reader.loadErrorTitle')}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 24px' }}>
          {code === 'RATE_LIMITED' ? t('documents.errors.RATE_LIMITED') : t('documents.reader.loadErrorBody')}
        </p>
        <Button variant="primary" onClick={() => void docQuery.refetch()}>{t('documents.reader.retry')}</Button>
      </CenteredScreen>
    );
  }

  if (!doc) {
    return (
      <CenteredScreen>
        <p style={{ color: 'var(--ink-500)', fontSize: 15 }}>{t('documents.reader.loading')}</p>
      </CenteredScreen>
    );
  }

  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  const category = lang === 'en' ? doc.categoryNameEn ?? doc.categoryName : doc.categoryName;
  const loadedPages = pdfState.status === 'ready' ? pdfState.pdf.numPages : doc.open || source === 'file' ? doc.pageCount : Math.min(doc.freePages, doc.pageCount);
  const remaining = Math.max(0, doc.pageCount - doc.freePages);
  const indicator = hasWall
    ? t('documents.reader.previewIndicator', { page: Math.min(currentPage, loadedPages), total: loadedPages })
    : t('documents.reader.pageIndicator', { page: Math.min(currentPage, loadedPages), total: loadedPages });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment-deep)', fontFamily: 'var(--font-sans)' }}>
      {/* En-tête léger : logo, titre, auteur, Partager ; indicateur d'aperçu. */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--parchment)', borderBottom: '1px solid var(--line-soft)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ maxWidth: COLUMN_MAX + 32, margin: '0 auto', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 16, color: 'var(--green-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.title}
            </div>
            {(doc.author || category) && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[doc.author, category].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => void onShare()} disabled={sharing}>
            {t('documents.share.button')}
          </Button>
        </div>
        <div style={{ maxWidth: COLUMN_MAX + 32, margin: '0 auto', padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span
            aria-live="polite"
            style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: 'var(--green-800)', background: 'var(--green-50)', borderRadius: 999, padding: '3px 10px' }}
          >
            {indicator}
          </span>
          {source === 'file' && pdfState.status === 'ready' && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--earth-700)' }}>{t('documents.reader.full')}</span>
          )}
          <span style={{ flex: 1 }} />
          {moreDocsPath && (
            <Link to={moreDocsPath} style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-700)', textDecoration: 'none' }}>
              {t('documents.reader.otherDocuments')}
            </Link>
          )}
          {canDownload && (
            <Button size="sm" onClick={() => void onDownload()} disabled={downloading}>
              {t('documents.reader.download')}
            </Button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: COLUMN_MAX + 32, margin: '0 auto', padding: '12px 16px 40px' }}>
        <div ref={columnRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {pdfState.status === 'loading' && (
            <p style={{ color: 'var(--ink-500)', fontSize: 15, padding: '48px 0' }}>{t('documents.reader.loading')}</p>
          )}
          {pdfState.status === 'error' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ color: 'var(--ink-700)', fontSize: 15, margin: '0 0 16px' }}>{t('documents.reader.pdfError')}</p>
              <Button variant="primary" onClick={() => setPdfAttempt((a) => a + 1)}>{t('documents.reader.retry')}</Button>
            </div>
          )}
          {pdfState.status === 'ready' && width > 0 &&
            Array.from({ length: pdfState.pdf.numPages }, (_, i) => (
              <PdfPage
                key={`${doc.version}-${i + 1}`}
                pdf={pdfState.pdf}
                pageNumber={i + 1}
                width={width}
                defaultRatio={defaultRatio}
                registerEl={registerEl}
              />
            ))}
        </div>

        {pdfState.status === 'ready' && laidOut && (hasWall ? (
          // Mur de fin d'aperçu — ton positif, jamais punitif (spec §7).
          <section
            ref={wallRef}
            style={{
              marginTop: 24, background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)', padding: 'clamp(22px, 5vw, 36px) clamp(18px, 4vw, 32px)', textAlign: 'center',
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(20px, 5vw, 26px)', lineHeight: 1.25, color: 'var(--green-900)', margin: '0 0 10px' }}>
              {t('documents.wall.title', { title: doc.title })}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 6px' }}>{t('documents.wall.body')}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--earth-700)', margin: '0 0 22px' }}>
              {t('documents.wall.remaining', { count: remaining })}
            </p>
            {/* D-WEB-04 (JP 27/10) : la suite se lit aussi sur le web — connexion / inscription pour un
                visiteur, rattachement pour un compte connecté non rattaché ; retour ici par `?next=`. */}
            {wallKind === 'login' ? (
              <div style={{ margin: '0 0 22px' }}>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-700)', margin: '0 0 14px' }}>{t('documents.wall.signInHint')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  <Link to={`/login${nextParam}`} className="btn primary" style={{ textDecoration: 'none' }}>{t('documents.wall.signIn')}</Link>
                  <Link to={`/signup${nextParam}`} className="btn secondary" style={{ textDecoration: 'none' }}>{t('documents.wall.signUp')}</Link>
                </div>
              </div>
            ) : (
              <div style={{ margin: '0 0 22px' }}>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, color: 'var(--green-900)', margin: '0 0 6px' }}>
                  {t('documents.wall.joinTitle')}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-700)', margin: '0 0 14px' }}>{t('documents.wall.joinBody')}</p>
                <Link to={`/join${nextParam}`} className="btn primary" style={{ textDecoration: 'none' }}>{t('documents.wall.join')}</Link>
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 14px' }}>{t('documents.wall.orApp')}</p>
            <AppButtons
              platform={platform}
              qrValue={qrUrl}
              appUrl={appUrl}
              onInstall={() => log('INSTALL_CLICK')}
              onOpenApp={() => log('OPEN_APP')}
            />
          </section>
        ) : (
          // Document `open` (ou aperçu = document entier) : pas de mur, mêmes boutons en pied de page.
          <footer style={{ marginTop: 28, padding: '24px 16px', borderTop: '1px solid var(--line)', textAlign: 'center' }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 18px' }}>{t('documents.footer.body')}</p>
            <AppButtons
              platform={platform}
              qrValue={qrUrl}
              appUrl={appUrl}
              onInstall={() => log('INSTALL_CLICK')}
              onOpenApp={() => log('OPEN_APP')}
            />
          </footer>
        ))}
      </main>

      {/* Repli du partage : nouveau geste utilisateur pour `navigator.share`, ou copie manuelle. */}
      <Modal
        open={!!shareSheetUrl}
        onClose={() => setShareSheetUrl(null)}
        title={t('documents.share.sheetTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareSheetUrl(null)}>{t('documents.share.close')}</Button>
            {shareSheetUrl && (
              <Button onClick={() => void copyLink(shareSheetUrl).then((ok) => ok && setShareSheetUrl(null))}>
                {t('documents.share.copy')}
              </Button>
            )}
            {canNativeShare && shareSheetUrl && (
              <Button
                variant="primary"
                onClick={() => void nativeShare(doc, shareSheetUrl).then((ok) => ok && setShareSheetUrl(null))}
              >
                {t('documents.share.button')}
              </Button>
            )}
          </>
        }
      >
        <input
          readOnly
          value={shareSheetUrl ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('documents.share.linkLabel')}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--ivory-raised)', fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
      </Modal>
    </div>
  );
}
