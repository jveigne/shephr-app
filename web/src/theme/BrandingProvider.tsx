/**
 * Thème du pays après connexion — lot « conf-pays » P2 (contrat 11_11_2026/02 §5.4 / §5.5, JP 11/11).
 *
 * - RG-PAYS-04 : le pays du thème suit le pays du COMPTE décidé par le serveur (`MeResponse.countryIso`), sinon le
 *   choix fait sur ce navigateur (`deviceCountry`). `accountCountry` est vidé à la déconnexion.
 * - RG-PAYS-07 : jamais d'écran de premier lancement ; Shephr standard sur les chemins neutres (pages publiques) ;
 *   `?pays=FR` sur `/login` ou `/signup` écrit `deviceCountry` (code connu de `/api/public/countries` seulement).
 * - Relecture (§5.4) au chargement et à chaque changement de pays, au plus une fois par heure (`lastCheckAt`), avec
 *   `If-None-Match: "{ISO}-{version}"` : 200 → remplacée et appliquée tout de suite (variables CSS, sans recharger),
 *   304 → `lastCheckAt` seul, 404 → Shephr standard, erreur réseau → rien.
 * - §3.3 : compte sans pays choisi (`countryNodeId == null && !countryLocked`) et pays choisi sur ce navigateur →
 *   `PATCH /me/country` une fois, en silence.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { fetchCountryBranding, listPublicCountries, setMyCountry } from '../services/countriesApi';
import {
  applicableBranding,
  applyBrandingVars,
  isNeutralBrandingPath,
  readBrandingCache,
  themeCountry,
  writeBrandingCache,
  type CountryBranding,
  type WelcomeText,
} from './branding';
import { BRANDING_LOGOS } from './brandingLogos';

/** §5.4 — configuration active telle que l'affichent les écrans (`useBranding()`). */
export interface ActiveBranding {
  /** null = Shephr standard. */
  countryIso: string | null;
  /** « Shephr » par défaut (i18n `branding.defaultName`). */
  displayName: string;
  shortName: string;
  /** Langue de l'interface, repli FR ; null = accueil standard. */
  welcome: WelcomeText | null;
  websiteUrl: string | null;
  /** Logo intégré du pays, sinon null → logo Shephr (recette 8). */
  logo: string | null;
}

interface BrandingContextValue {
  branding: ActiveBranding;
  /** Pays choisi sur ce navigateur (RG-PAYS-02), pour préremplir `/signup` et `/join`. */
  deviceCountry: string | null;
  /** Écrit le choix du navigateur et relit la configuration (sélecteur de `/signup`, réglages hors connexion). */
  chooseDeviceCountry: (iso: string | null) => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

const HOUR_MS = 3_600_000;

function toActive(b: CountryBranding | null, lang: string, defaultName: string): ActiveBranding {
  if (!b) {
    return { countryIso: null, displayName: defaultName, shortName: defaultName, welcome: null, websiteUrl: null, logo: null };
  }
  const welcome = lang.startsWith('en') ? (b.welcome?.en ?? b.welcome?.fr ?? null) : (b.welcome?.fr ?? null);
  const websiteUrl = b.websiteUrl && /^https:\/\//i.test(b.websiteUrl) ? b.websiteUrl : null;
  return {
    countryIso: b.countryIso,
    displayName: b.displayName || defaultName,
    shortName: b.shortName || b.displayName || defaultName,
    welcome: welcome && welcome.title ? welcome : null,
    websiteUrl,
    logo: BRANDING_LOGOS[b.countryIso.toUpperCase()] ?? null,
  };
}

/** Relectures en cours, par pays : un seul appel à la fois (StrictMode double-monte les effets). */
const inFlight = new Set<string>();
/**
 * Pays déjà relus depuis le CHARGEMENT de cette page (mémoire du module, vidée à chaque rechargement complet).
 * Spec §12 recette 5 / D-PAYS-02 (JP 11/11) : une couleur changée au back-office se voit dès le rechargement de la
 * page web — la configuration est donc relue (If-None-Match, 304 sans corps si rien n'a changé) à chaque chargement
 * complet ; la limite « au plus une fois par heure » (contrat §5.4) ne vaut plus, sur le web, qu'au sein d'un même
 * chargement (changements de route) — écart daté E-18 du contrat.
 */
const checkedThisLoad = new Set<string>();

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { ready, isAuthenticated, me, refreshMe } = useAuth();
  // Compteur de rendu : le cache vit dans localStorage, on se re-rend après chaque écriture.
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  // 1) Pays du compte (RG-PAYS-04) — vidé à la déconnexion (§5.4 n°3), jamais avant que la session soit connue.
  const accountIso = me?.countryIso ? me.countryIso.toUpperCase() : null;
  useEffect(() => {
    if (!ready) return;
    const next = isAuthenticated ? accountIso : null;
    if (readBrandingCache().accountCountry !== next) {
      writeBrandingCache({ accountCountry: next });
      bump();
    }
  }, [ready, isAuthenticated, accountIso]);

  // 2) `?pays=FR` sur /login ou /signup (RG-PAYS-07) — seulement un code connu de la liste publique.
  const paysParam = new URLSearchParams(location.search).get('pays');
  const onAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  useEffect(() => {
    if (!onAuthPage || !paysParam || !/^[A-Za-z]{2}$/.test(paysParam)) return;
    const iso = paysParam.toUpperCase();
    if (readBrandingCache().deviceCountry === iso) return;
    let cancelled = false;
    listPublicCountries()
      .then((list) => {
        if (cancelled || !list.some((c) => c.code.toUpperCase() === iso)) return;
        writeBrandingCache({ deviceCountry: iso, deviceCountryChosen: true });
        bump();
      })
      .catch(() => { /* liste indisponible : paramètre ignoré */ });
    return () => { cancelled = true; };
  }, [onAuthPage, paysParam]);

  // 3) §3.3 — pays choisi sur ce navigateur reporté une fois sur un compte qui n'en a pas.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!me || me.countryNodeId != null || me.countryLocked !== false) return;
    const device = readBrandingCache().deviceCountry;
    if (!device || syncedFor.current === me.id) return;
    syncedFor.current = me.id;
    setMyCountry(device).then(() => refreshMe()).catch(() => { /* silencieux (§3.3) */ });
  }, [me, refreshMe]);

  // 4) Relecture de la configuration du pays du thème.
  const cache = readBrandingCache();
  const country = themeCountry(cache);
  useEffect(() => {
    if (!country) return;
    const c = readBrandingCache();
    const sameCountry = c.applied?.countryIso === country;
    const fresh = !!c.lastCheckAt && Date.now() - Date.parse(c.lastCheckAt) < HOUR_MS;
    // Pas de nouvelle relecture dans l'heure au sein d'un même chargement — sauf si le cache ne porte pas ce pays
    // (choix ou compte nouveau) ; toujours une relecture au premier passage après un chargement complet.
    if (sameCountry && fresh && checkedThisLoad.has(country)) return;
    if (inFlight.has(country)) return;
    inFlight.add(country);
    fetchCountryBranding(country, sameCountry ? c.applied!.branding.version : null)
      .then((res) => {
        if (res.kind !== 'error') checkedThisLoad.add(country);
        const now = new Date().toISOString();
        if (res.kind === 'ok') writeBrandingCache({ applied: { countryIso: country, branding: res.branding }, lastCheckAt: now });
        else if (res.kind === 'unchanged') writeBrandingCache({ lastCheckAt: now });
        else if (res.kind === 'none') writeBrandingCache({ applied: null, lastCheckAt: now });
        bump();
      })
      .finally(() => inFlight.delete(country));
  }, [country]);

  // 5) Application des variables CSS : à chaque changement de pays, de configuration ou de route (chemins neutres).
  const neutral = isNeutralBrandingPath(location.pathname);
  const applicable = neutral ? null : applicableBranding(cache);
  const applicableKey = applicable ? `${applicable.countryIso}-${applicable.version}` : '';
  useEffect(() => {
    applyBrandingVars(applicable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicableKey, neutral]);

  const defaultName = t('branding.defaultName');
  const lang = i18n.language;
  const value = useMemo<BrandingContextValue>(() => ({
    branding: toActive(applicable, lang, defaultName),
    deviceCountry: cache.deviceCountry,
    chooseDeviceCountry: (iso) => {
      writeBrandingCache({ deviceCountry: iso ? iso.toUpperCase() : null, deviceCountryChosen: true });
      bump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [applicableKey, lang, defaultName, cache.deviceCountry, rev]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

const STANDARD: BrandingContextValue = {
  branding: { countryIso: null, displayName: 'Shephr', shortName: 'Shephr', welcome: null, websiteUrl: null, logo: null },
  deviceCountry: null,
  chooseDeviceCountry: () => {},
};

/** Configuration active (Shephr standard hors provider). */
export function useBranding(): ActiveBranding {
  return (useContext(BrandingContext) ?? STANDARD).branding;
}

/** Choix du pays sur ce navigateur (sélecteurs `/signup`, `/join`). */
export function useDeviceCountry(): { deviceCountry: string | null; chooseDeviceCountry: (iso: string | null) => void } {
  const ctx = useContext(BrandingContext) ?? STANDARD;
  return { deviceCountry: ctx.deviceCountry, chooseDeviceCountry: ctx.chooseDeviceCountry };
}
