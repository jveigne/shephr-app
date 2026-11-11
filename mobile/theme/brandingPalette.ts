// brandingPalette.ts — RG-PAYS-08 / RG-PAYS-10 (JP 11/11). Copie IDENTIQUE web / mobile / back-office :
// contrat docs/shephr/11_11_2026/02_Contrat_API_Configuration_Pays.md §5.1. Aucun import.
export type BrandingRole =
  | 'principale' | 'texteSurPrincipale' | 'accent' | 'texteSurAccent'
  | 'fond' | 'surface' | 'champ' | 'texte' | 'texteDiscret' | 'bordure';
export type BrandingColors = Record<BrandingRole, string>;

type Rgb = [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** Mélange linéaire en sRGB : t = 0 → a, t = 1 → b. Arrondi par canal. */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a), B = parseHex(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
export const darken = (c: string, t: number) => mix(c, '#000000', t);
export const lighten = (c: string, t: number) => mix(c, '#FFFFFF', t);
/** "rgba(r,g,b,a)" — a écrit tel quel (0.06, 0.12…). */
export function alpha(c: string, a: number): string {
  const [r, g, b] = parseHex(c);
  return `rgba(${r},${g},${b},${a})`;
}
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function luminance(c: string): number {
  const [r, g, b] = parseHex(c);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const MIN_CONTRAST = 4.5;
export const CONTRAST_PAIRS: ReadonlyArray<[BrandingRole, BrandingRole]> = [
  ['texte', 'fond'], ['texte', 'surface'], ['texte', 'champ'],
  ['texteDiscret', 'fond'], ['texteDiscret', 'surface'],
  ['texteSurPrincipale', 'principale'], ['texteSurAccent', 'accent'],
  ['principale', 'fond'], ['principale', 'surface'],
];
export function firstContrastFailure(c: BrandingColors):
  { foreground: BrandingRole; background: BrandingRole; ratio: number } | null {
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(c[fg], c[bg]);
    if (ratio < MIN_CONTRAST) return { foreground: fg, background: bg, ratio };
  }
  return null;
}
/**
 * Couleur de TEXTE lisible sur des fonds clairs (V1 mode clair, D-PAYS-07) : assombrie par pas de 5 % jusqu'à
 * atteindre `min` contre CHAQUE fond (au plus 20 pas). Déterministe.
 */
export function ensureReadable(c: string, backgrounds: string[], min = MIN_CONTRAST): string {
  for (let k = 0; k <= 20; k++) {
    const candidate = darken(c, k * 0.05);
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= min)) return candidate;
  }
  return darken(c, 1);
}
