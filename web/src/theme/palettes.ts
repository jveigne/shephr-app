import { SEUIL_TEXTE, ajusterPourContraste, contraste, melanger, normaliserHex, texteSur } from './couleurs';

/**
 * Thème de l'Espace ministère (`docs/theme-plan.md` §4.3) : modes, accent, variables CSS.
 *
 * <p>Les couleurs vivent dans des **variables de rôle** de `theme/styles.css` (`--page`,
 * `--surface`, `--texte`, `--accent`…), une valeur par mode : `:root` et `[data-theme="clair"]`
 * (le Clair d'aujourd'hui, valeur pour valeur), `[data-theme="sombre"]`, `[data-theme="noirEtBlanc"]`.
 * Seule la famille de l'ACCENT dépend du choix de l'utilisateur : elle est calculée ici et posée
 * en style sur `<html>` quand l'accent n'est pas celui par défaut (D2 — la terre ne suit pas).
 *
 * <p>Mêmes règles que le mobile (`mobile/theme/palettes.ts`) : l'accent est ajusté jusqu'à être
 * lisible sur la page et sur les cartes, le texte posé dessus est choisi par contraste.
 */

export type ModeTheme = 'auto' | 'clair' | 'sombre' | 'noirEtBlanc';
export type ModeResolu = Exclude<ModeTheme, 'auto'>;

export const MODES: ModeTheme[] = ['auto', 'clair', 'sombre', 'noirEtBlanc'];

/** Accent par défaut : le vert mousse Shephr (`--green-800`). */
export const ACCENT_DEFAUT = '#1E3A2F';

/** Pastilles proposées (D2), identiques au mobile. L'utilisateur peut aussi saisir un hex libre. */
export const ACCENTS_PREDEFINIS: { id: string; valeur: string }[] = [
  { id: 'mousse', valeur: ACCENT_DEFAUT },
  { id: 'terre', valeur: '#A7754B' },
  { id: 'argile', valeur: '#B86A4A' },
  { id: 'bleu', valeur: '#1F5A8A' },
  { id: 'violet', valeur: '#6B3FD4' },
  { id: 'framboise', valeur: '#B4245E' },
];

/** Fonds sur lesquels l'accent doit rester lisible, par mode (valeurs de `styles.css`). */
const FONDS: Record<'clair' | 'sombre', { page: string; surface: string; surfaceHaute: string }> = {
  clair: { page: '#E8DCC4', surface: '#FBF5E4', surfaceHaute: '#FFFAEC' },
  sombre: { page: '#14120E', surface: '#1F1C17', surfaceHaute: '#29251F' },
};

/** Crème posée sur le vert dans le Clair d'aujourd'hui (`.btn.primary`, coches). */
const CREME = '#FBF5E4';

export function estAccentParDefaut(accent: string): boolean {
  try {
    return normaliserHex(accent) === ACCENT_DEFAUT;
  } catch {
    return true;
  }
}

/**
 * Variables CSS de la famille de l'accent pour un mode et un accent.
 *
 * <p>Vide quand `styles.css` porte déjà les bonnes valeurs : Noir et blanc (accent noir, D8) et
 * accent par défaut (Clair et Sombre). Sinon, toutes les variables `--accent*` et le texte posé
 * dessus ; en Clair aussi celui de la barre latérale, qui est l'accent.
 */
export function variablesAccent(mode: ModeResolu, accent: string): Record<string, string> {
  if (mode === 'noirEtBlanc' || estAccentParDefaut(accent)) return {};
  return calculerAccent(mode, normaliserHex(accent));
}

/** Calcul complet (exporté pour générer les valeurs par défaut du Sombre de `styles.css`). */
export function calculerAccent(mode: 'clair' | 'sombre', base: string): Record<string, string> {
  const f = FONDS[mode];
  const fonds = [f.page, f.surface, f.surfaceHaute];
  const a = ajusterPourContraste(base, fonds, SEUIL_TEXTE);
  // Les variantes servent aussi de texte (liens, survols) : elles restent lisibles.
  const lisible = (c: string) => ajusterPourContraste(c, fonds, SEUIL_TEXTE);

  if (mode === 'clair') {
    const surAccent = contraste(CREME, a) >= SEUIL_TEXTE ? CREME : texteSur(a);
    return {
      '--accent': a,
      '--accent-profond': melanger(a, '#000000', 0.3),
      '--accent-moyen': lisible(melanger(a, '#FFFFFF', 0.12)),
      '--accent-doux': melanger(a, '#FFFFFF', 0.25),
      '--accent-pale': melanger(a, '#FFFFFF', 0.4),
      '--accent-teinte': melanger(a, '#FFFFFF', 0.82),
      '--accent-teinte-douce': melanger(a, '#FFFFFF', 0.9),
      '--sur-accent': surAccent,
      '--sur-barre': surAccent,
      '--sur-barre-vif': surAccent,
      '--sur-barre-max': surAccent,
    };
  }

  // Sombre : l'accent s'éclaircit ; les teintes sont des mélanges avec la carte, donc sombres.
  return {
    '--accent': a,
    '--accent-profond': melanger(a, f.page, 0.35),
    '--accent-moyen': lisible(melanger(a, '#FFFFFF', 0.12)),
    '--accent-doux': melanger(a, '#FFFFFF', 0.22),
    '--accent-pale': melanger(a, '#FFFFFF', 0.32),
    '--accent-teinte': melanger(a, f.surface, 0.78),
    '--accent-teinte-douce': melanger(a, f.surface, 0.86),
    '--sur-accent': texteSur(a),
  };
}
