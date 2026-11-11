import {
  getBranding,
  readBrandingCache,
  themeCountry,
  writeBrandingCache,
  type BrandingCacheV1,
} from '@/theme/branding';
import { fetchCountryBranding, type BrandingFetch } from '@/services/countriesApi';
import { reloadApp } from '@/utils/reloadApp';
import { notify } from '@/utils/dialogs';
import i18n from '@/utils/i18n/i18n';

// ---------------------------------------------------------------------------------------------
//  Cycle de vie du thème par pays — D-PAYS-01 / RG-PAYS-02 / RG-PAYS-04 (JP 11/11), contrat 11/11 §5.4.
//
//  Le thème est FIGÉ pour la session (posé par `index.ts` › `bootBranding()` avant les écrans). Ce module :
//   - écrit le choix de l'appareil (écran Pays) et le pays du compte (après chaque MeResponse) dans le cache ;
//   - lit la configuration du pays du thème (5 s max) ;
//   - recharge l'app UNE fois quand le thème résultant diffère du thème affiché (`reloadGuard`) ;
//   - relit la configuration en arrière-plan au plus une fois par heure, appliquée au LANCEMENT SUIVANT.
//  Séparé de `theme/branding.ts`, qui ne doit importer aucun service (évalué avant le routeur).
// ---------------------------------------------------------------------------------------------

const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Pays (ISO) pour lequel un rechargement a déjà été demandé dans cette session — jamais deux fois. */
let reloadGuard: string | null | undefined;

/** Applique au cache l'issue d'une lecture réseau pour `iso` ; renvoie le cache à jour. */
function applyFetch(iso: string, res: BrandingFetch): BrandingCacheV1 {
  const now = new Date().toISOString();
  switch (res.kind) {
    case 'ok':
      return writeBrandingCache({ applied: { countryIso: iso, branding: res.branding }, lastCheckAt: now });
    case 'unchanged':
      return writeBrandingCache({ lastCheckAt: now });
    case 'none': {
      // 404 = Shephr standard pour ce pays : la configuration en cache de CE pays tombe.
      const cache = readBrandingCache();
      return writeBrandingCache({
        applied: cache.applied && cache.applied.countryIso !== iso ? cache.applied : null,
        lastCheckAt: now,
      });
    }
    default:
      return readBrandingCache();
  }
}

/** Pays dont la configuration est APPLICABLE au prochain lancement (null = Shephr standard). */
function resultingTheme(cache: BrandingCacheV1): string | null {
  const iso = themeCountry(cache);
  return iso && cache.applied?.countryIso === iso ? iso : null;
}

/** Version en cache pour `iso` (If-None-Match), null sinon. */
function cachedVersion(iso: string): number | null {
  const applied = readBrandingCache().applied;
  return applied && applied.countryIso === iso ? applied.branding.version : null;
}

/**
 * Recharge si le thème résultant diffère du thème affiché. Garde : un seul rechargement par pays cible et par
 * session ; échec du rechargement → `branding.restartToApply`, rien d'autre.
 */
async function reloadIfThemeChanged(cache: BrandingCacheV1): Promise<boolean> {
  const target = resultingTheme(cache);
  if (target === getBranding().countryIso) return false;
  if (reloadGuard === target) return false;
  reloadGuard = target;
  const ok = await reloadApp();
  if (!ok) notify(i18n.t('branding.defaultName'), i18n.t('branding.restartToApply'));
  return ok;
}

/**
 * Déclencheur n°1 (contrat §5.4) — validation de l'écran Pays : `iso` = pays choisi, null = « Autre pays »
 * (Shephr standard). Écrit `deviceCountry` + `deviceCountryChosen`, lit la configuration (5 s max), puis
 * recharge si le thème change. Renvoie vrai si un rechargement a été demandé.
 */
export async function chooseDeviceCountry(iso: string | null): Promise<boolean> {
  let cache = writeBrandingCache({ deviceCountry: iso, deviceCountryChosen: true });
  const theme = themeCountry(cache);
  if (theme) cache = applyFetch(theme, await fetchCountryBranding(theme, cachedVersion(theme), 5000));
  return reloadIfThemeChanged(cache);
}

/**
 * Déclencheur n°2 — après chaque MeResponse (`hooks/useBrandingRefresh`) : `accountCountry = me.countryIso`.
 * Si le pays du thème change, sa configuration est lue ; on ne recharge que si elle a pu l'être (200, 304 ou
 * 404) — réseau en échec : appliqué au lancement suivant.
 */
export async function syncAccountCountry(countryIso: string | null | undefined): Promise<void> {
  const iso = countryIso ? countryIso.toUpperCase() : null;
  const before = readBrandingCache();
  if (before.accountCountry === iso && resultingTheme(before) === getBranding().countryIso) return;
  let cache = writeBrandingCache({ accountCountry: iso });
  const theme = themeCountry(cache);
  if (theme && cache.applied?.countryIso !== theme) {
    const res = await fetchCountryBranding(theme, null, 5000);
    if (res.kind === 'failed') return;
    cache = applyFetch(theme, res);
  }
  await reloadIfThemeChanged(cache);
}

/** Déclencheur n°3 — déconnexion : `accountCountry = null`, SANS rechargement (lancement suivant). */
export function forgetAccountCountry(): void {
  writeBrandingCache({ accountCountry: null });
}

/**
 * Relecture en arrière-plan (lancement, retour au premier plan) au plus une fois par heure (`lastCheckAt`) :
 * 200 → configuration remplacée, 304 → `lastCheckAt` seul, 404 → plus de configuration, réseau → rien.
 * Jamais de rechargement : appliqué au lancement suivant.
 */
export async function refreshBrandingIfDue(): Promise<void> {
  const cache = readBrandingCache();
  const theme = themeCountry(cache);
  if (!theme) return;
  const last = cache.lastCheckAt ? Date.parse(cache.lastCheckAt) : NaN;
  if (Number.isFinite(last) && Date.now() - last < CHECK_EVERY_MS) return;
  applyFetch(theme, await fetchCountryBranding(theme, cachedVersion(theme), 8000));
}
