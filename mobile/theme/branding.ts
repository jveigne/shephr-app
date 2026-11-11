// Thème par pays — D-PAYS-01 / D-PAYS-02 / RG-PAYS-08 (JP 11/11), contrat docs/shephr/11_11_2026/02 §5.2 / §5.4.
//
// Les écrans figent leurs couleurs dans `StyleSheet.create` AU CHARGEMENT du module (spec §2.3) : la palette du
// pays doit donc être posée dans `colors` AVANT que le moindre écran soit évalué. C'est le rôle de `bootBranding()`,
// appelé par le point d'entrée `index.ts` avant `expo-router/entry`. Tout est SYNCHRONE (`File.textSync()` natif,
// `localStorage` sur Expo web) et sous try/catch : un cache absent ou illisible = Shephr standard (recette 7).
//
// ⚠ Ce module ne doit importer AUCUN écran ni service (il est évalué avant le routeur) : seulement `colors`,
// `brandingPalette`, `brandingLogos`, `expo-file-system` et `Platform`.
//
// Un changement de thème s'applique au LANCEMENT : la relecture réseau (`hooks/useBrandingRefresh`, lot P2) écrit
// le cache pour le lancement suivant ; un changement immédiat passe par `utils/reloadApp`.
import { Platform, type ImageSourcePropType } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { colors } from '@/theme/colors';
import { BRANDING_LOGOS } from '@/theme/brandingLogos';
import {
  alpha, darken, ensureReadable, lighten, mix,
  type BrandingColors, type BrandingRole,
} from '@/theme/brandingPalette';

// ─── Miroirs du contrat §4.1 ────────────────────────────────────────────────────────────────────────────────────

/** Mirrors com.excellence.back.org.branding.CountryBrandingDtos.WelcomeText (JP 11/11) — title ≤ 80, text ≤ 280. */
export interface WelcomeText { title: string; text: string }
/** Mirrors com.excellence.back.org.branding.CountryBrandingDtos.BrandingWelcome (JP 11/11) — FR obligatoire. */
export interface BrandingWelcome { fr: WelcomeText; en: WelcomeText | null }
/**
 * Mirrors com.excellence.back.org.branding.CountryBrandingDtos.CountryBranding (JP 11/11) —
 * `GET /api/public/countries/{code}/branding`, configuration ACTIVE seulement.
 */
export interface CountryBranding {
  countryIso: string;
  displayName: string;       // ≤ 60 — remplace « Shephr » dans l'en-tête et l'accueil
  shortName: string;         // ≤ 16
  colors: BrandingColors;
  welcome: BrandingWelcome;
  websiteUrl: string | null; // https:// seulement
  version: number;           // + 1 à chaque PUT — sert à l'If-None-Match "{ISO}-{version}"
  updatedAt: string;         // Instant
}

// ─── Cache (contrat §5.4, même JSON que le web) ─────────────────────────────────────────────────────────────────

export interface BrandingCacheV1 {
  v: 1;
  deviceCountry: string | null;      // RG-PAYS-02 — choix fait sur l'appareil (ISO)
  deviceCountryChosen: boolean;      // l'écran Pays a été validé — jamais ré-affiché au lancement
  accountCountry: string | null;     // dernier MeResponse.countryIso connu (vidé à la déconnexion)
  applied: { countryIso: string; branding: CountryBranding } | null; // dernière configuration ACTIVE reçue
  lastCheckAt: string | null;        // Instant de la dernière relecture réseau
}

const CACHE_FILE = 'branding.json';
const CACHE_WEB_KEY = 'shephr.branding.v1';

const EMPTY_CACHE: BrandingCacheV1 = {
  v: 1,
  deviceCountry: null,
  deviceCountryChosen: false,
  accountCountry: null,
  applied: null,
  lastCheckAt: null,
};

const ROLES: readonly BrandingRole[] = [
  'principale', 'texteSurPrincipale', 'accent', 'texteSurAccent',
  'fond', 'surface', 'champ', 'texte', 'texteDiscret', 'bordure',
];
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Une palette reçue (ou relue du disque) n'est appliquée que si ses 10 rôles sont des "#RRGGBB". */
function isValidColors(c: unknown): c is BrandingColors {
  if (!c || typeof c !== 'object') return false;
  const rec = c as Record<string, unknown>;
  return ROLES.every((r) => typeof rec[r] === 'string' && HEX.test(rec[r] as string));
}

const isoOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;

/** Lecture défensive : toute forme inattendue retombe sur le cache vide (Shephr standard). */
function normalize(raw: unknown): BrandingCacheV1 {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return { ...EMPTY_CACHE };
  const r = raw as Partial<BrandingCacheV1>;
  const applied =
    r.applied
    && isoOrNull(r.applied.countryIso)
    && r.applied.branding
    && isValidColors(r.applied.branding.colors)
      ? { countryIso: isoOrNull(r.applied.countryIso) as string, branding: r.applied.branding }
      : null;
  return {
    v: 1,
    deviceCountry: isoOrNull(r.deviceCountry),
    deviceCountryChosen: r.deviceCountryChosen === true,
    accountCountry: isoOrNull(r.accountCountry),
    applied,
    lastCheckAt: typeof r.lastCheckAt === 'string' ? r.lastCheckAt : null,
  };
}

function readRaw(): string | null {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(CACHE_WEB_KEY) ?? null;
  }
  const file = new File(Paths.document, CACHE_FILE);
  return file.exists ? file.textSync() : null;
}

function writeRaw(json: string): void {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(CACHE_WEB_KEY, json);
    return;
  }
  const file = new File(Paths.document, CACHE_FILE);
  if (!file.exists) file.create();
  file.write(json);
}

let memo: BrandingCacheV1 | null = null;

/** Cache courant (lu une fois sur le disque, puis gardé en mémoire). Jamais d'exception. */
export function readBrandingCache(): BrandingCacheV1 {
  if (memo) return memo;
  try {
    const raw = readRaw();
    memo = raw ? normalize(JSON.parse(raw)) : { ...EMPTY_CACHE };
  } catch {
    memo = { ...EMPTY_CACHE };
  }
  return memo;
}

/**
 * Fusionne `patch` dans le cache et l'écrit (synchrone). N'agit PAS sur le thème affiché : il est figé pour la
 * session (appliqué au lancement suivant, ou après `reloadApp()`). Une écriture en échec garde la mémoire à jour.
 */
export function writeBrandingCache(patch: Partial<Omit<BrandingCacheV1, 'v'>>): BrandingCacheV1 {
  const next = normalize({ ...readBrandingCache(), ...patch, v: 1 });
  memo = next;
  try {
    writeRaw(JSON.stringify(next));
  } catch {
    // Disque ou stockage indisponible : la session garde la valeur, le prochain lancement repartira de l'ancienne.
  }
  return next;
}

/** Pays du thème = pays du compte, sinon choix fait sur l'appareil (RG-PAYS-04, contrat §5.4). */
export function themeCountry(cache: BrandingCacheV1 = readBrandingCache()): string | null {
  return cache.accountCountry ?? cache.deviceCountry;
}

// ─── Dérivation des nuances (contrat §5.2, RG-PAYS-08, écart E-07) ──────────────────────────────────────────────

/**
 * Palette mobile d'un pays ACTIF. Shephr standard n'est jamais « calculé » (valeurs statiques de `colors.ts`).
 * Les clés `#RRGGBB` restent des `#RRGGBB` (des écrans concatènent un suffixe d'opacité : `colors.earth + '1A'`) ;
 * seules `mossTint` / `mossTint2` sont des `rgba`, comme aujourd'hui. Couleurs d'état (`clay`) inchangées
 * (RG-PAYS-09) ; `hair` / `hairStrong` deviennent des `#RRGGBB` (bordure opaque du pays).
 */
export function paletteFor(c: BrandingColors): Partial<typeof colors> {
  const lightBgs = [c.fond, c.surface];
  return {
    moss: c.principale,
    mossDeep: darken(c.principale, 0.25),
    mossSoft: ensureReadable(lighten(c.principale, 0.15), lightBgs),
    mossTint: alpha(c.principale, 0.06),
    mossTint2: alpha(c.principale, 0.12),
    parchment: c.fond,
    parchmentDeep: darken(c.surface, 0.08),
    paper: c.surface,
    paper2: c.champ,
    earth: c.accent,
    earthDeep: ensureReadable(darken(c.accent, 0.2), lightBgs),
    onEarth: c.texteSurAccent,
    onEarthBadge: c.texteSurAccent,
    ink: c.texte,
    ink2: c.texteDiscret,
    ink3: c.texteDiscret,
    hair: c.bordure,
    hairStrong: darken(c.bordure, 0.15),
    white: c.texteSurPrincipale,
    onMossBright: c.texteSurPrincipale,
    sage: mix(c.principale, c.texteDiscret, 0.5),
  };
}

// ─── Démarrage et lecture du thème de la session ────────────────────────────────────────────────────────────────

let booted = false;
let active: { countryIso: string; branding: CountryBranding } | null = null;

/**
 * Appelé UNE fois par `index.ts`, avant `expo-router/entry`. Si le cache porte une configuration du pays du thème,
 * réécrit `colors` ; sinon ne touche à rien (Shephr standard). Ne lève jamais.
 */
export function bootBranding(): void {
  if (booted) return;
  booted = true;
  try {
    const cache = readBrandingCache();
    const iso = themeCountry(cache);
    if (iso && cache.applied && cache.applied.countryIso === iso) {
      Object.assign(colors, paletteFor(cache.applied.branding.colors));
      active = cache.applied;
    }
  } catch {
    active = null;
  }
}

/** Thème de la session (contrat §5.4 › ActiveBranding) — figé jusqu'au prochain lancement / rechargement. */
export interface ActiveBranding {
  countryIso: string | null;          // null = Shephr standard
  displayName: string;                // nom du pays ; en Shephr standard, le nom produit (i18n branding.defaultName)
  shortName: string;
  welcome: WelcomeText | null;        // dans la langue de l'UI, repli FR ; null = accueil standard
  websiteUrl: string | null;
  logo: ImageSourcePropType | null;   // logo intégré du pays, sinon null → logo Shephr (recette 8)
}

/** Nom produit en Shephr standard. Les écrans affichent `t('branding.defaultName')` quand `countryIso` est null. */
const DEFAULT_NAME = 'Shephr';

/** `lang` = langue de l'UI (`i18n.language`) pour choisir le texte d'accueil ; repli FR. */
export function getBranding(lang?: string): ActiveBranding {
  if (!active) {
    return {
      countryIso: null, displayName: DEFAULT_NAME, shortName: DEFAULT_NAME,
      welcome: null, websiteUrl: null, logo: null,
    };
  }
  const b = active.branding;
  const en = lang?.toLowerCase().startsWith('en') ? b.welcome?.en : null;
  return {
    countryIso: active.countryIso,
    displayName: b.displayName,
    shortName: b.shortName || b.displayName,
    welcome: en ?? b.welcome?.fr ?? null,
    websiteUrl: b.websiteUrl ?? null,
    logo: BRANDING_LOGOS[active.countryIso] ?? null,
  };
}
