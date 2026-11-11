// Palette Shephr standard (valeurs statiques). D-PAYS-01 / RG-PAYS-08 (JP 11/11) : pour un pays dont la
// configuration est active, `theme/branding.ts` › `bootBranding()` réécrit cet objet (`Object.assign`) depuis le
// point d'entrée `index.ts`, AVANT l'évaluation des écrans — les `StyleSheet.create` des écrans lisent donc les
// couleurs du pays. Sans configuration active, rien n'est réécrit : ces valeurs font foi (contrat 11/11 §5.1 / §5.2).
// Ne jamais copier une de ces valeurs en dur dans un écran : passer par `colors.x` (ou `alpha(colors.x, a)` de
// `@/theme/brandingPalette` pour une transparence).
export const colors = {
  moss: '#1E3A2F',
  mossDeep: '#16291F',
  mossSoft: '#2E5142',
  mossTint: 'rgba(30,58,47,0.06)',
  mossTint2: 'rgba(30,58,47,0.12)',

  parchment: '#E8DCC4',
  parchmentDeep: '#D7C7A6',
  paper: '#F5ECD8',
  paper2: '#FBF5E6',

  earth: '#C9956B',
  earthDeep: '#A7754B',
  // P1 conf-pays (JP 11/11, contrat §5.2) : texte posé sur `earth` → `texteSurAccent` d'un pays.
  onEarth: '#16291F',
  // P1 conf-pays (JP 11/11, écart mobile) : texte CLAIR posé sur `earth` en Shephr (pastille « Mes actions »
  // de la déclaration d'évènement) — même valeur que `white` ici, `texteSurAccent` pour un pays (jamais de
  // blanc sur un accent clair, spec §4.3).
  onEarthBadge: '#F2E9D2',
  clay: '#B86A4A',

  ink: '#2A2620',
  ink2: '#5C544A',
  ink3: '#8B8275',

  hair: 'rgba(42,38,32,0.10)',
  hairStrong: 'rgba(42,38,32,0.18)',

  white: '#F2E9D2',
  // P1 conf-pays (JP 11/11, écart mobile) : blanc PUR posé sur `moss` (puce d'année active de la vue
  // ministère des Goals) — `texteSurPrincipale` pour un pays.
  onMossBright: '#FFFFFF',
  // P1 conf-pays (JP 11/11, écart mobile) : ton « sauge » des tuiles d'accueil (Hiérarchie, Prière) —
  // `mix(principale, texteDiscret, 0.5)` pour un pays.
  sage: '#7A8B6F',
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
};
