/**
 * Thème par pays — lot « conf-pays » (contrat docs/shephr/11_11_2026/02_Contrat_API_Configuration_Pays.md §5.3 / §5.4).
 *
 * D-PAYS-02 (JP 11/11) : la configuration d'un pays est une DONNÉE servie en public, appliquée au chargement du web
 * en réécrivant les variables CSS de `:root` (aucun rechargement). RG-PAYS-08 : dérivation des nuances identique au
 * mobile (`brandingPalette.ts`, copie au caractère près). RG-PAYS-09 : couleurs d'état, ombres et rayons restent
 * Shephr. D-PAYS-08 : aucune police ne change.
 *
 * Shephr standard n'est JAMAIS calculé : sans configuration applicable, chaque variable gérée est retirée du style
 * en ligne de `<html>` et les valeurs statiques de `styles.css` reprennent la main.
 *
 * `localStorage` peut manquer ou lever (navigation privée, données bloquées) : toute lecture / écriture est sous
 * `try/catch` ; un cache illisible = Shephr standard (recette 7).
 */
import {
  alpha,
  darken,
  ensureReadable,
  lighten,
  mix,
  parseHex,
  type BrandingColors,
} from './brandingPalette';

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos (JP 11/11)
export interface WelcomeText { title: string; text: string }
// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.BrandingWelcome (JP 11/11)
export interface BrandingWelcome { fr: WelcomeText; en: WelcomeText | null }
// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.CountryBranding (JP 11/11)
/** GET /api/public/countries/{code}/branding — configuration ACTIVE seulement. */
export interface CountryBranding {
  countryIso: string;
  displayName: string;
  shortName: string;
  colors: BrandingColors;
  welcome: BrandingWelcome;
  websiteUrl: string | null;
  version: number;
  updatedAt: string;
}

/** §5.4 — même JSON que le mobile (`v: 1`). */
export interface BrandingCacheV1 {
  v: 1;
  /** RG-PAYS-02 — choix fait sur le navigateur (ISO). */
  deviceCountry: string | null;
  /** Écran Pays validé (mobile) ; gardé pour la forme commune. */
  deviceCountryChosen: boolean;
  /** Dernier `MeResponse.countryIso` connu (vidé à la déconnexion). */
  accountCountry: string | null;
  /** Dernière configuration ACTIVE reçue. */
  applied: { countryIso: string; branding: CountryBranding } | null;
  /** Instant de la dernière relecture réseau. */
  lastCheckAt: string | null;
}

export const BRANDING_CACHE_KEY = 'shephr.branding.v1';

const EMPTY_CACHE: BrandingCacheV1 = {
  v: 1,
  deviceCountry: null,
  deviceCountryChosen: false,
  accountCountry: null,
  applied: null,
  lastCheckAt: null,
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const ROLES: ReadonlyArray<keyof BrandingColors> = [
  'principale', 'texteSurPrincipale', 'accent', 'texteSurAccent',
  'fond', 'surface', 'champ', 'texte', 'texteDiscret', 'bordure',
];

function isValidColors(c: unknown): c is BrandingColors {
  if (!c || typeof c !== 'object') return false;
  return ROLES.every((r) => typeof (c as Record<string, unknown>)[r] === 'string'
    && HEX.test((c as Record<string, string>)[r]));
}

function normalizeIso(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
}

/** Lit le cache ; absent, illisible ou d'une autre version → cache vide (Shephr standard). */
export function readBrandingCache(): BrandingCacheV1 {
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return { ...EMPTY_CACHE };
    const parsed = JSON.parse(raw) as Partial<BrandingCacheV1> | null;
    if (!parsed || parsed.v !== 1) return { ...EMPTY_CACHE };
    const applied = parsed.applied;
    const appliedOk = !!applied
      && normalizeIso(applied.countryIso) !== null
      && !!applied.branding
      && isValidColors(applied.branding.colors);
    return {
      v: 1,
      deviceCountry: normalizeIso(parsed.deviceCountry),
      deviceCountryChosen: parsed.deviceCountryChosen === true,
      accountCountry: normalizeIso(parsed.accountCountry),
      applied: appliedOk
        ? { countryIso: normalizeIso(applied!.countryIso)!, branding: applied!.branding }
        : null,
      lastCheckAt: typeof parsed.lastCheckAt === 'string' ? parsed.lastCheckAt : null,
    };
  } catch {
    return { ...EMPTY_CACHE };
  }
}

/** Fusionne `patch` dans le cache et l'écrit ; renvoie le cache résultant (même si l'écriture a échoué). */
export function writeBrandingCache(patch: Partial<Omit<BrandingCacheV1, 'v'>>): BrandingCacheV1 {
  const next: BrandingCacheV1 = { ...readBrandingCache(), ...patch, v: 1 };
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : le thème vit pour la page seulement */
  }
  return next;
}

/** §5.4 — pays du thème = accountCountry ?? deviceCountry. */
export function themeCountry(cache: BrandingCacheV1 = readBrandingCache()): string | null {
  return cache.accountCountry ?? cache.deviceCountry;
}

/** Configuration applicable : `applied` si elle porte le pays du thème, sinon `null` (Shephr standard). */
export function applicableBranding(cache: BrandingCacheV1 = readBrandingCache()): CountryBranding | null {
  const country = themeCountry(cache);
  if (!country || !cache.applied || cache.applied.countryIso !== country) return null;
  return cache.applied.branding;
}

/**
 * RG-PAYS-07 (JP 11/11) : chemins NEUTRES, toujours en Shephr standard (accueil public, offres, abonnements,
 * documents partagés, pages exigées par les stores, invitation, activation). Thème du pays partout ailleurs.
 */
export function isNeutralBrandingPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (p === '' || p === '/') return true;
  if (p === '/offres' || p.startsWith('/offres/')) return true;
  if (p === '/abonnements' || p.startsWith('/abonnements/')) return true;
  if (p.startsWith('/d/')) return true;
  if (p.startsWith('/invitation/')) return true;
  return ['/privacy', '/confidentialite', '/delete-account', '/supprimer-compte', '/activate'].includes(p);
}

/** "r,g,b" pour les variables `*-rgb` (utilisées en `rgba(var(--x-rgb), a)` dans styles.css). */
function rgbTriplet(hex: string): string {
  return parseHex(hex).join(',');
}

/**
 * §5.3 — variables CSS d'un pays actif. Liste EXHAUSTIVE des variables gérées : `BRANDING_CSS_VARS`.
 * Variables ajoutées au codage de P1 (écart daté E-17 du contrat, tables §5.3) : `--on-primary-soft`,
 * `--on-primary-bright`, `--ivory-soft`, `--ivory-mist`, `--parchment-soft`, `--track` et les triplets `*-rgb`.
 */
export function cssVarsFor(c: BrandingColors): Record<string, string> {
  const onSurfaces = [c.fond, c.surface];
  const v: Record<string, string> = {
    '--green-900': darken(c.principale, 0.35),
    '--green-800': c.principale,
    '--green-700': ensureReadable(lighten(c.principale, 0.12), onSurfaces),
    '--green-600': ensureReadable(lighten(c.principale, 0.25), onSurfaces),
    '--green-500': ensureReadable(lighten(c.principale, 0.40), onSurfaces, 3),
    '--green-100': mix(c.principale, c.fond, 0.85),
    '--green-50': mix(c.principale, c.fond, 0.92),

    '--earth-700': ensureReadable(darken(c.accent, 0.30), onSurfaces),
    '--earth-600': ensureReadable(darken(c.accent, 0.15), onSurfaces),
    '--earth-500': c.accent,
    '--earth-400': lighten(c.accent, 0.25),
    '--earth-100': lighten(c.accent, 0.70),
    '--earth-50': lighten(c.accent, 0.82),

    '--parchment': c.fond,
    '--parchment-deep': darken(c.surface, 0.06),
    '--ivory': c.surface,
    '--ivory-card': c.surface,
    '--ivory-raised': c.champ,

    '--ink-900': darken(c.texte, 0.25),
    '--ink-800': c.texte,
    '--ink-700': mix(c.texte, c.texteDiscret, 0.35),
    '--ink-600': mix(c.texte, c.texteDiscret, 0.70),
    '--ink-500': c.texteDiscret,
    '--ink-400': ensureReadable(mix(c.texteDiscret, c.fond, 0.25), onSurfaces, 3),
    '--ink-300': mix(c.texteDiscret, c.fond, 0.45),

    '--line': c.bordure,
    '--line-soft': mix(c.bordure, c.fond, 0.40),
    '--line-strong': darken(c.bordure, 0.15),

    '--on-primary': c.texteSurPrincipale,
    '--on-primary-muted': mix(c.texteSurPrincipale, c.principale, 0.15),
    '--on-accent': c.texteSurAccent,
    '--earth-tint': alpha(c.accent, 0.1),

    // Ajouts P1 (rendu Shephr identique : valeurs autrefois écrites en dur dans les .tsx / styles.css).
    '--on-primary-soft': c.texteSurPrincipale,
    '--on-primary-bright': c.texteSurPrincipale,
    '--ivory-soft': c.champ,
    '--ivory-mist': c.champ,
    '--parchment-soft': mix(c.surface, c.fond, 0.5),
    '--track': alpha(c.texte, 0.08),
  };
  // Triplets « r,g,b » des nuances employées en transparence (rgba(var(--x-rgb), a)).
  v['--green-900-rgb'] = rgbTriplet(v['--green-900']);
  v['--green-700-rgb'] = rgbTriplet(v['--green-700']);
  v['--earth-600-rgb'] = rgbTriplet(v['--earth-600']);
  v['--earth-500-rgb'] = rgbTriplet(v['--earth-500']);
  v['--ivory-rgb'] = rgbTriplet(c.surface);
  v['--ivory-glow-rgb'] = rgbTriplet(c.surface);
  v['--parchment-rgb'] = rgbTriplet(c.fond);
  v['--line-rgb'] = rgbTriplet(c.bordure);
  v['--ink-800-rgb'] = rgbTriplet(c.texte);
  v['--on-primary-muted-rgb'] = rgbTriplet(v['--on-primary-muted']);
  v['--on-primary-soft-rgb'] = rgbTriplet(c.texteSurPrincipale);
  return v;
}

/** Toutes les variables que le thème d'un pays peut réécrire (pour le retour au Shephr standard). */
export const BRANDING_CSS_VARS: ReadonlyArray<string> = Object.keys(cssVarsFor({
  principale: '#1E3A2F', texteSurPrincipale: '#FBF5E4', accent: '#C9956B', texteSurAccent: '#14271F',
  fond: '#E8DCC4', surface: '#FBF5E4', champ: '#FFFAEC', texte: '#3A2E20', texteDiscret: '#7A6B55',
  bordure: '#D7C7A6',
}));

/** Clé du thème posé sur `:root` (`null` = Shephr standard), pour ne rien réécrire inutilement. */
let appliedKey: string | null = null;

/**
 * Pose (ou retire) les variables du pays sur `:root`, sans rechargement. `null` = Shephr standard
 * (`removeProperty` de chaque variable gérée).
 */
export function applyBrandingVars(branding: CountryBranding | null): void {
  if (typeof document === 'undefined') return;
  const valid = !!branding && isValidColors(branding.colors);
  const key = valid ? `${branding!.countryIso}-${ROLES.map((r) => branding!.colors[r]).join('')}` : null;
  if (key === appliedKey) return;
  const style = document.documentElement.style;
  try {
    if (!valid || !branding) {
      for (const name of BRANDING_CSS_VARS) style.removeProperty(name);
      appliedKey = null;
      return;
    }
    const vars = cssVarsFor(branding.colors);
    for (const [name, value] of Object.entries(vars)) style.setProperty(name, value);
    appliedKey = key;
  } catch {
    for (const name of BRANDING_CSS_VARS) style.removeProperty(name);
    appliedKey = null;
  }
}

/**
 * §5.4 — appelé par `main.tsx` AVANT `createRoot` (synchrone) : applique la configuration du cache si elle porte le
 * pays du thème et que la page n'est pas un chemin neutre (RG-PAYS-07). Renvoie la configuration appliquée.
 */
export function applyCachedBranding(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/',
): CountryBranding | null {
  const branding = isNeutralBrandingPath(pathname) ? null : applicableBranding();
  applyBrandingVars(branding);
  return branding;
}
