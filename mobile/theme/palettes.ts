/**
 * Palettes du thème Shephr (`docs/theme-plan.md` §4.2 et §4.4).
 *
 * <p>Un écran ne nomme plus une couleur (`colors.moss`) mais un RÔLE (`c.accent`) : la même
 * couleur jouait plusieurs rôles (texte, fond…), c'est le tableau « usage → rôle » du §4.4 qui
 * dit lequel. Chaque mode donne une valeur à chaque rôle.
 *
 * <p>Le Clair avec l'accent par défaut reprend EXACTEMENT `theme/colors.ts` : aucune
 * régression visuelle (recette R2).
 *
 * <p>L'accent choisi ne remplace que la famille verte (`moss*`) ; la terre reste la couleur
 * secondaire, quel que soit l'accent (D2, décision B4 de JP). L'alerte reste rouge dans tous
 * les modes (D8, B3).
 */
import { colors } from '@/theme/colors';
import {
  SEUIL_GRAPHIQUE,
  SEUIL_TEXTE,
  ajusterPourContraste,
  contraste,
  melanger,
  normaliserHex,
  texteSur,
  transparence,
} from '@/theme/couleurs';

/** Ce que l'utilisateur choisit. `auto` suit le réglage clair / sombre du téléphone. */
export type ModeTheme = 'auto' | 'clair' | 'sombre' | 'noirEtBlanc';

/** Ce qui est réellement affiché, une fois `auto` résolu. */
export type ModeResolu = Exclude<ModeTheme, 'auto'>;

export type PaletteTheme = {
  /** Fond d'écran (`parchment`). */
  page: string;
  /** Fond d'écran plus marqué, bandeau (`parchmentDeep`). */
  pageProfonde: string;
  /** Carte, feuille (`paper`). */
  surface: string;
  /** Carte mise en avant, champ (`paper2`). */
  surfaceHaute: string;
  /** Texte principal (`ink`). */
  texte: string;
  /** Texte secondaire (`ink2`). */
  texte2: string;
  /** Métadonnée, placeholder, icône inactive (`ink3`). */
  texte3: string;
  /** Filet, séparateur (`hair`). */
  filet: string;
  /** Bordure marquée (`hairStrong`). */
  filetFort: string;
  /** Accent : bouton principal, onglet actif, lien (`moss`). */
  accent: string;
  /** Accent appuyé, en-tête (`mossDeep`). */
  accentProfond: string;
  /** Accent adouci (`mossSoft`). */
  accentDoux: string;
  /** Teinte légère de l'accent, fond de pastille (`mossTint`). */
  accentTeinte: string;
  /** Teinte plus marquée (`mossTint2`). */
  accentTeinte2: string;
  /** Texte et icône posés sur l'accent (`white`, une couleur crème). */
  surAccent: string;
  /** Couleur secondaire, la terre : ne suit pas l'accent (`earth`). */
  secondaire: string;
  /** Terre appuyée (`earthDeep`). */
  secondaireProfond: string;
  /** Suppression, erreur, « à revoir » (`clay`) : rouge dans tous les modes. */
  alerte: string;
  /** Texte posé sur l'alerte. */
  surAlerte: string;
  /** Voile derrière une modale. */
  voile: string;
};

/** Accent par défaut : le vert mousse Shephr. */
export const ACCENT_DEFAUT = colors.moss;

/** Pastilles proposées dans l'écran Apparence (D2). L'utilisateur peut aussi saisir un hex libre. */
export const ACCENTS_PREDEFINIS: { id: string; valeur: string }[] = [
  { id: 'mousse', valeur: colors.moss },
  { id: 'terre', valeur: colors.earthDeep },
  { id: 'argile', valeur: colors.clay },
  { id: 'bleu', valeur: '#1F5A8A' },
  { id: 'violet', valeur: '#6B3FD4' },
  { id: 'framboise', valeur: '#B4245E' },
];

/** Le Clair d'aujourd'hui, valeur pour valeur (non-régression, R2). */
const CLAIR: PaletteTheme = {
  page: colors.parchment,
  pageProfonde: colors.parchmentDeep,
  surface: colors.paper,
  surfaceHaute: colors.paper2,
  texte: colors.ink,
  texte2: colors.ink2,
  texte3: colors.ink3,
  filet: colors.hair,
  filetFort: colors.hairStrong,
  accent: colors.moss,
  accentProfond: colors.mossDeep,
  accentDoux: colors.mossSoft,
  accentTeinte: colors.mossTint,
  accentTeinte2: colors.mossTint2,
  surAccent: colors.white,
  secondaire: colors.earth,
  secondaireProfond: colors.earthDeep,
  alerte: colors.clay,
  surAlerte: colors.white,
  voile: 'rgba(22,41,31,0.45)',
};

/** Neutres du Sombre : brun très foncé, chaud comme le parchemin, jamais un noir bleuté. */
const SOMBRE_NEUTRES = {
  page: '#14120E',
  pageProfonde: '#0E0C0A',
  surface: '#1F1C17',
  surfaceHaute: '#29251F',
  texte: '#F2E9D2',
  texte2: '#D3C8B2',
  texte3: '#A89D89',
  filet: 'rgba(242,233,210,0.12)',
  filetFort: 'rgba(242,233,210,0.22)',
  voile: 'rgba(0,0,0,0.6)',
};

/** Noir et blanc : aucune couleur, sauf l'alerte (D8, B3). */
const NOIR_ET_BLANC: PaletteTheme = {
  page: '#FFFFFF',
  pageProfonde: '#F2F2F2',
  surface: '#FFFFFF',
  surfaceHaute: '#FFFFFF',
  texte: '#000000',
  texte2: '#333333',
  texte3: '#595959',
  filet: 'rgba(0,0,0,0.14)',
  filetFort: 'rgba(0,0,0,0.32)',
  accent: '#000000',
  accentProfond: '#000000',
  accentDoux: '#333333',
  accentTeinte: 'rgba(0,0,0,0.06)',
  accentTeinte2: 'rgba(0,0,0,0.12)',
  surAccent: '#FFFFFF',
  secondaire: '#4D4D4D',
  secondaireProfond: '#333333',
  alerte: '#B3261E',
  surAlerte: '#FFFFFF',
  voile: 'rgba(0,0,0,0.5)',
};

/** Texte posé sur `fond` : la crème de Shephr si elle reste lisible, sinon blanc ou noir. */
function texteSurAccent(fond: string): string {
  return contraste(colors.white, fond) >= SEUIL_TEXTE ? colors.white : texteSur(fond);
}

/**
 * Construit la palette affichée.
 *
 * @param mode   mode résolu (jamais `auto` : le contexte l'a déjà tranché)
 * @param accent accent choisi, hex libre. Une valeur invalide retombe sur l'accent par défaut.
 */
export function construirePalette(mode: ModeResolu, accent: string = ACCENT_DEFAUT): PaletteTheme {
  if (mode === 'noirEtBlanc') return NOIR_ET_BLANC;

  let base: string;
  try {
    base = normaliserHex(accent);
  } catch {
    base = ACCENT_DEFAUT;
  }
  const parDefaut = base === normaliserHex(ACCENT_DEFAUT);

  if (mode === 'clair') {
    if (parDefaut) return CLAIR;
    const a = ajusterPourContraste(base, [CLAIR.page, CLAIR.surface, CLAIR.surfaceHaute], SEUIL_TEXTE);
    return {
      ...CLAIR,
      accent: a,
      accentProfond: melanger(a, '#000000', 0.25),
      accentDoux: melanger(a, '#FFFFFF', 0.12),
      accentTeinte: transparence(a, 0.06),
      accentTeinte2: transparence(a, 0.12),
      surAccent: texteSurAccent(a),
    };
  }

  // Sombre : l'accent s'éclaircit jusqu'à être lisible sur la page ET sur les cartes.
  const n = SOMBRE_NEUTRES;
  const fonds = [n.page, n.surface, n.surfaceHaute];
  const a = ajusterPourContraste(base, fonds, SEUIL_TEXTE);
  const secondaire = ajusterPourContraste(colors.earth, fonds, SEUIL_TEXTE);
  const alerte = ajusterPourContraste(colors.clay, fonds, SEUIL_GRAPHIQUE);
  return {
    ...n,
    accent: a,
    accentProfond: melanger(a, n.page, 0.35),
    accentDoux: melanger(a, '#FFFFFF', 0.12),
    accentTeinte: transparence(a, 0.14),
    accentTeinte2: transparence(a, 0.24),
    surAccent: texteSur(a),
    secondaire,
    secondaireProfond: ajusterPourContraste(colors.earthDeep, fonds, SEUIL_GRAPHIQUE),
    alerte,
    surAlerte: texteSur(alerte),
  };
}
