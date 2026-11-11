import type { ImageSourcePropType } from 'react-native';

// D-PAYS-03 (JP 11/11) : logos INTÉGRÉS au binaire, un par code ISO (contrat 11/11 §5.5) — un nouveau logo demande
// une version mobile. Sans entrée : logo Shephr aux couleurs du pays (recette 8).
// FR : logo CMCI PROVISOIRE (spec §4.6, `logo-cmci-provisoire.jpg` converti en PNG 384 × 384, fond blanc, sans
// transparence) — posé dans une pastille blanche ronde par `components/BrandLogo`. Une version transparente /
// recadrée sur le globe reste souhaitable (Q4).
export const BRANDING_LOGOS: Partial<Record<string, ImageSourcePropType>> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FR: require('@/assets/branding/FR.png'),
};
