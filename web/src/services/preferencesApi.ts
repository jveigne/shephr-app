import { apiClient } from './apiClient';
import { estHexValide, normaliserHex } from '../theme/couleurs';
import { ACCENT_DEFAUT, type ModeTheme } from '../theme/palettes';

/**
 * Préférences d'affichage du compte (`docs/theme-plan.md` §4.1, étape W4).
 *
 * <p>Le thème choisi est enregistré sur le compte : un choix fait sur l'Espace ministère se
 * retrouve sur l'application mobile, et inversement (demande de JP du 05/11). Pas de temps réel :
 * chaque surface relit `GET /me/preferences` quand on revient sur elle (D6).
 *
 * <p>Copie de `mobile/services/preferencesApi.ts` (les deux surfaces ne partagent pas de code,
 * `CLAUDE.md`) : tout changement de contrat se porte des deux côtés.
 */

/** Mirrors com.excellence.back.auth.preference.ThemeMode */
export type ThemeModeApi = 'AUTO' | 'CLAIR' | 'SOMBRE' | 'NOIR_ET_BLANC';

/**
 * Mirrors com.excellence.back.auth.preference.dto.UserPreferenceDto — aussi servi dans
 * `MeResponse.preferences`. Les deux champs valent `null` tant que le compte n'a rien choisi.
 */
export interface UserPreferences {
  themeMode: ThemeModeApi | null;
  themeAccent: string | null;
}

/** Le choix tel que le web l'affiche : mode et accent `#RRGGBB`. */
export interface ChoixTheme {
  mode: ModeTheme;
  accent: string;
}

const VERS_API: Record<ModeTheme, ThemeModeApi> = {
  auto: 'AUTO',
  clair: 'CLAIR',
  sombre: 'SOMBRE',
  noirEtBlanc: 'NOIR_ET_BLANC',
};

const DEPUIS_API: Record<ThemeModeApi, ModeTheme> = {
  AUTO: 'auto',
  CLAIR: 'clair',
  SOMBRE: 'sombre',
  NOIR_ET_BLANC: 'noirEtBlanc',
};

/**
 * Préférences du serveur → choix affiché. Un compte SANS préférence (ou une valeur inconnue)
 * affiche le thème par défaut, jamais celui laissé dans le navigateur (D4, décision B2 de JP).
 */
export function choixDepuisServeur(p: UserPreferences | null | undefined): ChoixTheme {
  const mode = p?.themeMode ? DEPUIS_API[p.themeMode] : undefined;
  const accent = p?.themeAccent && estHexValide(p.themeAccent) ? normaliserHex(p.themeAccent) : ACCENT_DEFAUT;
  return { mode: mode ?? 'clair', accent };
}

/** Choix affiché → corps du `PUT`. L'accent par défaut part en `null` (« pas de choix »). */
export function versServeur(choix: ChoixTheme): UserPreferences {
  const accent = normaliserHex(choix.accent);
  return {
    themeMode: VERS_API[choix.mode],
    themeAccent: accent === ACCENT_DEFAUT ? null : accent,
  };
}

export async function fetchMyPreferences(): Promise<UserPreferences> {
  const { data } = await apiClient.get<UserPreferences>('/api/church/auth/me/preferences');
  return data;
}

/** Remplacement complet (§4.1) : `themeMode` obligatoire, `themeAccent` facultatif. */
export async function putMyPreferences(p: UserPreferences): Promise<UserPreferences> {
  const { data } = await apiClient.put<UserPreferences>('/api/church/auth/me/preferences', p);
  return data;
}
