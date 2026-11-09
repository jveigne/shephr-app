/**
 * Calculs de couleur du thème (`docs/theme-plan.md` §4.2) : luminance, contraste, mélange.
 *
 * <p>Copie de `mobile/theme/couleurs.ts` (elle-même portée de `cmfipraise-app`, PR #14) : les
 * deux surfaces ne partagent pas de code (`CLAUDE.md`). Toute correction se porte des deux côtés.
 *
 * <p>Fonctions pures, sans dépendance au navigateur. Elles sont
 * ce qui garantit qu'aucune couleur choisie par l'utilisateur ne rend l'app illisible : un
 * accent trop pâle sur fond clair, ou trop sombre sur fond noir, est corrigé ici avant
 * d'atteindre un écran.
 */

/** Seuils WCAG 2.1 : texte courant, et éléments graphiques (icônes, bordures actives). */
export const SEUIL_TEXTE = 4.5;
export const SEUIL_GRAPHIQUE = 3;

type Rgb = { r: number; g: number; b: number };

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `true` pour `#RGB` ou `#RRGGBB` (avec ou sans `#`). */
export function estHexValide(valeur: string): boolean {
  return HEX.test(valeur.trim());
}

/** Normalise en `#RRGGBB` majuscule. Lève une erreur si la valeur n'est pas un hex valide. */
export function normaliserHex(valeur: string): string {
  const m = HEX.exec(valeur.trim());
  if (!m) throw new Error(`Couleur invalide : ${valeur}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function versRgb(hex: string): Rgb {
  const h = normaliserHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function versHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Luminance relative WCAG, de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
  const { r, g, b } = versRgb(hex);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Rapport de contraste WCAG entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Mélange `a` vers `b` : `part` = 0 rend `a`, 1 rend `b`. Sert aux teintes de pastille
 * (accent dilué dans le fond).
 */
export function melanger(a: string, b: string, part: number): string {
  const x = versRgb(a);
  const y = versRgb(b);
  return versHex({
    r: x.r + (y.r - x.r) * part,
    g: x.g + (y.g - x.g) * part,
    b: x.b + (y.b - x.b) * part,
  });
}

/** Blanc ou noir : celui qui contraste le plus avec `fond`. Pour le texte posé sur un accent. */
export function texteSur(fond: string): '#FFFFFF' | '#000000' {
  return contraste('#FFFFFF', fond) >= contraste('#000000', fond) ? '#FFFFFF' : '#000000';
}

/**
 * Éclaircit ou assombrit `couleur` jusqu'à atteindre `seuil` contre CHACUN des `fonds`.
 *
 * <p>La teinte est conservée : on mélange vers le blanc (fonds sombres) ou vers le noir (fonds
 * clairs), par pas de 2 %, et on s'arrête au premier pas qui passe. Une couleur déjà lisible
 * est rendue telle quelle, c'est ce qui garde le thème clair identique à l'existant.
 */
export function ajusterPourContraste(
  couleur: string,
  fonds: string[],
  seuil: number = SEUIL_TEXTE,
): string {
  const base = normaliserHex(couleur);
  const passe = (c: string) => fonds.every((f) => contraste(c, f) >= seuil);
  if (passe(base)) return base;

  const fondsSombres = fonds.every((f) => luminance(f) < 0.5);
  const cible = fondsSombres ? '#FFFFFF' : '#000000';
  for (let part = 0.02; part <= 1; part += 0.02) {
    const essai = melanger(base, cible, part);
    if (passe(essai)) return essai;
  }
  return cible;
}

/**
 * `couleur` (hex) avec une opacité `alpha` (0 à 1), en `rgba(…)`. Sert aux filets, voiles et
 * teintes de Shephr, qui sont des transparences de l'encre ou de l'accent.
 */
export function transparence(couleur: string, alpha: number): string {
  const { r, g, b } = versRgb(couleur);
  return `rgba(${r},${g},${b},${alpha})`;
}
